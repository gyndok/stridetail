import {
  depositPreview,
  eligibleVisitLine,
  filterByLocalDateRange,
  invoiceLink,
  manualLineError,
  parseSignedDollars,
  visitLocalDate,
  type UninvoicedVisit,
} from '../newInvoice';

// newInvoice.ts imports priceSnapshotCents from schedule/api, which pulls the
// supabase client module — stub it (jest hoists this above the imports) so
// the pure helpers test without env vars.
jest.mock('@/src/lib/supabase', () => ({ supabase: {} }));

const CHI = 'America/Chicago';

const visit = (over: Partial<UninvoicedVisit>): UninvoicedVisit => ({
  id: 'v1',
  client_id: 'c1',
  pet_ids: ['p1'],
  scheduled_start: '2026-08-25T14:00:00Z',
  business_tz: CHI,
  service: { name: 'Walk', base_price_cents: 2500, extra_pet_price_cents: 500 },
  ...over,
});

// ---- visitLocalDate: mirrors the RPC's (scheduled_start at time zone business_tz)::date ----

describe('visitLocalDate', () => {
  test('renders the calendar date in the visit own business_tz', () => {
    expect(visitLocalDate(visit({}))).toBe('2026-08-25');
  });

  test('a UTC instant past midnight is still the previous LOCAL day', () => {
    // 2026-08-26 03:00 UTC = 2026-08-25 22:00 CDT — the RPC picks it for Aug 25.
    expect(visitLocalDate(visit({ scheduled_start: '2026-08-26T03:00:00Z' }))).toBe('2026-08-25');
  });
});

// ---- filterByLocalDateRange: inclusive both ends, null/'' = open (RPC rule) ----

describe('filterByLocalDateRange', () => {
  const early = visit({ id: 'early', scheduled_start: '2026-08-20T14:00:00Z' });
  const mid = visit({ id: 'mid', scheduled_start: '2026-08-25T14:00:00Z' });
  const late = visit({ id: 'late', scheduled_start: '2026-08-30T14:00:00Z' });
  const all = [early, mid, late];

  test('open range keeps everything', () => {
    expect(filterByLocalDateRange(all, null, null)).toEqual(all);
    expect(filterByLocalDateRange(all, '', '')).toEqual(all);
  });

  test('bounds are inclusive on both ends', () => {
    expect(filterByLocalDateRange(all, '2026-08-20', '2026-08-25').map((v) => v.id)).toEqual([
      'early',
      'mid',
    ]);
    expect(filterByLocalDateRange(all, '2026-08-25', null).map((v) => v.id)).toEqual([
      'mid',
      'late',
    ]);
  });

  test('filters on the LOCAL day, not the UTC day', () => {
    // Aug 26 03:00 UTC is Aug 25 in Chicago: a to=Aug 25 range keeps it.
    const lateNight = visit({ id: 'ln', scheduled_start: '2026-08-26T03:00:00Z' });
    expect(filterByLocalDateRange([lateNight], null, '2026-08-25')).toHaveLength(1);
    expect(filterByLocalDateRange([lateNight], '2026-08-26', null)).toHaveLength(0);
  });
});

// ---- eligibleVisitLine: mirrors the RPC's line description + price snapshot math ----

describe('eligibleVisitLine', () => {
  test("description is 'Service — Dy, Mon D' in the business tz (RPC to_char format)", () => {
    expect(eligibleVisitLine(visit({})).description).toBe('Walk — Tue, Aug 25');
  });

  test('amount is base price for one pet', () => {
    expect(eligibleVisitLine(visit({})).amountCents).toBe(2500);
  });

  test('amount adds extra-pet price per pet beyond the first (priceSnapshotCents)', () => {
    expect(eligibleVisitLine(visit({ pet_ids: ['a', 'b', 'c'] })).amountCents).toBe(3500);
  });

  test('missing service embed falls back to Visit / 0 (display-only estimate)', () => {
    const line = eligibleVisitLine(visit({ service: null }));
    expect(line.description).toBe('Visit — Tue, Aug 25');
    expect(line.amountCents).toBe(0);
  });
});

// ---- depositPreview: MUST match the RPC's stop-at-first-misfit loop ----

describe('depositPreview', () => {
  const dep = (id: string, amount_cents: number) => ({ id, amount_cents });

  test('pgTAP pinned vector: held [2500, 2000] vs subtotal 3000 applies ONLY 2500', () => {
    // 2500 fits (remaining 500); 2000 no longer fits -> stop. Skipping ahead
    // would violate oldest-first (Task 2 recorded rule).
    const p = depositPreview([dep('d1', 2500), dep('d2', 2000)], 3000);
    expect(p.applied.map((d) => d.id)).toEqual(['d1']);
    expect(p.appliedCents).toBe(2500);
  });

  test('stops at the first misfit even when a LATER deposit would fit', () => {
    // 2500 > 2000 -> stop immediately; the fitting 2000 is never reached.
    const p = depositPreview([dep('big', 2500), dep('fits', 2000)], 2000);
    expect(p.applied).toEqual([]);
    expect(p.appliedCents).toBe(0);
  });

  test('an exact fit applies (RPC exits only when amount > remaining)', () => {
    const p = depositPreview([dep('d1', 3000)], 3000);
    expect(p.applied.map((d) => d.id)).toEqual(['d1']);
    expect(p.appliedCents).toBe(3000);
  });

  test('consumes whole deposits in order while they fit', () => {
    const p = depositPreview([dep('d1', 1000), dep('d2', 1000), dep('d3', 1500)], 2500);
    expect(p.applied.map((d) => d.id)).toEqual(['d1', 'd2']);
    expect(p.appliedCents).toBe(2000);
  });

  test('zero subtotal applies nothing (RPC recorded rule)', () => {
    expect(depositPreview([dep('d1', 100)], 0).applied).toEqual([]);
  });

  test('empty ledger applies nothing', () => {
    expect(depositPreview([], 3000)).toEqual({ applied: [], appliedCents: 0 });
  });
});

// ---- parseSignedDollars: manual lines allow negatives (discounts) ----

describe('parseSignedDollars', () => {
  test('positive amounts delegate to dollarsStringToCents', () => {
    expect(parseSignedDollars('12.50')).toBe(1250);
    expect(parseSignedDollars('$12')).toBe(1200);
  });

  test('a leading minus flips the sign', () => {
    expect(parseSignedDollars('-12.50')).toBe(-1250);
    expect(parseSignedDollars('-$5')).toBe(-500);
    expect(parseSignedDollars(' -5.5 ')).toBe(-550);
  });

  test('zero parses to 0 (rejected later by manualLineError)', () => {
    expect(parseSignedDollars('0')).toBe(0);
    expect(parseSignedDollars('-0')).toBe(-0);
  });

  test('junk is null', () => {
    expect(parseSignedDollars('abc')).toBeNull();
    expect(parseSignedDollars('--5')).toBeNull();
    expect(parseSignedDollars('5.123')).toBeNull();
    expect(parseSignedDollars('')).toBeNull();
  });
});

// ---- manualLineError: mirrors add_invoice_item prechecks ----

describe('manualLineError', () => {
  test('valid line passes', () => {
    expect(manualLineError('Extra key drop-off', '10.00')).toBeNull();
    expect(manualLineError('Loyalty discount', '-5.00')).toBeNull();
  });

  test('blank description rejected (RPC precheck)', () => {
    expect(manualLineError('  ', '10.00')).toBe('Enter a description');
  });

  test('unparseable amount rejected', () => {
    expect(manualLineError('Tip', 'abc')).toBe('Enter an amount like 12.50 (or -12.50)');
  });

  test('zero amount rejected (RPC precheck)', () => {
    expect(manualLineError('Tip', '0')).toBe('Amount cannot be zero');
  });
});

// ---- invoiceLink: mirrors reportLink over INVOICE_BASE_URL ----

test('invoiceLink appends the token to INVOICE_BASE_URL', () => {
  expect(invoiceLink('abc123')).toBe('https://stridetail.app/invoice/abc123');
});
