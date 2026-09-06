import {
  buildClientStatement,
  buildWalkerStatement,
  presetRange,
  type StatementDeposit,
  type StatementInvoice,
  type StatementPayment,
  type WalkerLedgerRow,
} from '../statements';

// ---- client side ----

const inv = (
  id: string,
  number: number,
  issued: string,
  cents: number,
  extra: Partial<StatementInvoice> = {},
): StatementInvoice => ({
  id,
  number,
  status: 'sent',
  issued_on: issued,
  items: [{ amount_cents: cents, kind: 'visit' }],
  ...extra,
});
const pay = (
  invoiceId: string,
  received: string,
  cents: number,
  tip = 0,
): StatementPayment => ({
  invoice_id: invoiceId,
  amount_cents: cents,
  tip_cents: tip,
  method: 'venmo',
  received_on: received,
});

test('client statement: running balance, tips annotated but never counted', () => {
  const s = buildClientStatement({
    invoices: [inv('a', 1, '2026-09-01', 2500), inv('b', 2, '2026-09-03', 3000)],
    payments: [pay('a', '2026-09-02', 2500, 500)],
    deposits: [],
    range: {},
    timeZone: 'America/Chicago',
  });
  expect(s.rows.map((r) => [r.kind, r.balanceCents])).toEqual([
    ['invoice', 2500],
    ['payment', 0],
    ['invoice', 3000],
  ]);
  expect(s.rows[1]!.note).toContain('$5.00 tip');
  expect(s.summary).toEqual({
    forwardCents: 0,
    chargedCents: 5500,
    creditedCents: 2500,
    balanceCents: 3000, // the tip moved nothing
    tipsCents: 500,
    heldCents: 0,
  });
});

test('client statement: activity before the range folds into balance forward', () => {
  const s = buildClientStatement({
    invoices: [inv('a', 1, '2026-08-01', 2500), inv('b', 2, '2026-09-03', 3000)],
    payments: [pay('a', '2026-08-05', 2000)],
    deposits: [],
    range: { from: '2026-09-01', to: '2026-09-30' },
    timeZone: 'America/Chicago',
  });
  expect(s.summary.forwardCents).toBe(500); // 2500 − 2000 before Sep
  expect(s.rows).toHaveLength(1);
  expect(s.rows[0]!.balanceCents).toBe(3500); // forward + September invoice
  expect(s.summary.balanceCents).toBe(3500);
});

test('client statement: applied deposits credit the balance; held ones are info only', () => {
  const dep = (status: string, extra: Partial<StatementDeposit> = {}): StatementDeposit => ({
    amount_cents: 5000,
    status,
    received_on: '2026-09-01',
    created_at: '2026-09-01T10:00:00Z',
    updated_at: '2026-09-04T10:00:00Z',
    memo: null,
    ...extra,
  });
  const s = buildClientStatement({
    invoices: [
      {
        id: 'a',
        number: 3,
        status: 'sent',
        issued_on: '2026-09-02',
        items: [
          { amount_cents: 2500, kind: 'visit' },
          { amount_cents: -2500, kind: 'deposit_credit' },
        ],
      },
    ],
    payments: [],
    deposits: [dep('applied'), dep('held', { received_on: '2026-09-03' })],
    range: {},
    timeZone: 'America/Chicago',
  });
  const kinds = s.rows.map((r) => r.kind);
  expect(kinds).toEqual(['deposit_info', 'invoice', 'deposit_credit', 'deposit_info']);
  expect(s.summary.balanceCents).toBe(0); // 2500 charged, 2500 deposit-credited
  expect(s.summary.heldCents).toBe(5000); // the held one, never netted
  const info = s.rows.filter((r) => r.info);
  expect(info.every((r) => r.chargeCents === 0 && r.creditCents === 0)).toBe(true);
});

test('client statement: drafts, voids, and their payments never appear', () => {
  const s = buildClientStatement({
    invoices: [
      inv('a', 1, '2026-09-01', 2500, { status: 'draft' }),
      inv('b', 2, '2026-09-01', 9000, { status: 'void' }),
    ],
    payments: [pay('b', '2026-09-02', 9000)],
    deposits: [],
    range: {},
    timeZone: 'America/Chicago',
  });
  expect(s.rows).toEqual([]);
  expect(s.summary.balanceCents).toBe(0);
});

// ---- walker side ----

const wl = (
  kind: WalkerLedgerRow['kind'],
  at: string,
  cents: number,
  statementId: string | null = null,
): WalkerLedgerRow => ({
  kind,
  at,
  detail: kind === 'payout' ? 'Statement Sep 1 – Sep 4' : 'Walk — Casey',
  amount_cents: cents,
  statement_id: statementId,
});

test('walker statement: earned minus paid runs the balance; ties to owed-now shape', () => {
  const s = buildWalkerStatement({
    rows: [
      wl('wage', '2026-09-01T14:00:00Z', 1875, 'st1'),
      wl('tip', '2026-09-01T14:00:00Z', 1000, 'st1'),
      wl('wage', '2026-09-05T14:00:00Z', 1875),
      wl('tip', '2026-09-05T14:00:00Z', 500),
      wl('payout', '2026-09-04T18:00:00Z', 2875, 'st1'),
    ],
    range: {},
    timeZone: 'America/Chicago',
  });
  expect(s.rows.map((r) => r.balanceCents)).toEqual([1875, 2875, 0, 1875, 2375]);
  expect(s.summary.balanceCents).toBe(2375); // exactly walker_owed_now's total
  expect(s.summary.tipsCents).toBe(1500);
  expect(s.rows.find((r) => r.kind === 'wage' && !r.description.includes('Paid'))).toBeTruthy();
});

test('walker statement: unswept rows carry the not-yet-on-a-statement note', () => {
  const s = buildWalkerStatement({
    rows: [wl('wage', '2026-09-05T14:00:00Z', 1875), wl('wage', '2026-09-01T14:00:00Z', 1875, 'st1')],
    range: {},
    timeZone: 'America/Chicago',
  });
  expect(s.rows[1]!.note).toBe('not yet on a statement');
  expect(s.rows[0]!.note).toBeUndefined();
});

// ---- finding 4 (2026-09-06 review): business-tz dates ----

test('an evening instant buckets to the BUSINESS calendar day, not UTC', () => {
  // 2026-09-06T03:00Z = Sep 5, 10 PM in Chicago. UTC slicing (the old bug)
  // would file this walk under Sep 6 and move it across statement periods.
  const s = buildWalkerStatement({
    rows: [wl('wage', '2026-09-06T03:00:00Z', 1875)],
    range: {},
    timeZone: 'America/Chicago',
  });
  expect(s.rows[0]!.date).toBe('2026-09-05');
  // The same rows in a zone east of UTC land on Sep 6 — the zone decides.
  const tokyo = buildWalkerStatement({
    rows: [wl('wage', '2026-09-06T03:00:00Z', 1875)],
    range: {},
    timeZone: 'Asia/Tokyo',
  });
  expect(tokyo.rows[0]!.date).toBe('2026-09-06');
});

test('a range boundary honors the business day: the evening walk stays in-period', () => {
  const s = buildWalkerStatement({
    rows: [wl('wage', '2026-09-06T03:00:00Z', 1875)],
    range: { from: '2026-09-01', to: '2026-09-05' },
    timeZone: 'America/Chicago',
  });
  expect(s.rows).toHaveLength(1); // Sep 5 in Chicago — inside the period
  expect(s.summary.balanceCents).toBe(1875);
});

test('date-only values pass through untouched; only instants convert', () => {
  const s = buildClientStatement({
    invoices: [inv('a', 1, '2026-09-05', 2500)], // issued_on is already a date
    payments: [pay('a', '2026-09-05', 2500)], // received_on too
    deposits: [
      {
        amount_cents: 5000,
        status: 'held',
        received_on: null, // falls back to created_at, an instant
        created_at: '2026-09-02T02:00:00Z', // Sep 1, 9 PM Chicago
        updated_at: '2026-09-02T02:00:00Z',
        memo: null,
      },
    ],
    range: {},
    timeZone: 'America/Chicago',
  });
  expect(s.rows.map((r) => [r.kind, r.date])).toEqual([
    ['deposit_info', '2026-09-01'],
    ['invoice', '2026-09-05'],
    ['payment', '2026-09-05'],
  ]);
});

test('walker statement: range folds earlier activity into forward', () => {
  const s = buildWalkerStatement({
    rows: [
      wl('wage', '2026-08-20T14:00:00Z', 1875),
      wl('payout', '2026-08-25T14:00:00Z', 1000),
      wl('wage', '2026-09-02T14:00:00Z', 1875),
    ],
    range: { from: '2026-09-01' },
    timeZone: 'America/Chicago',
  });
  expect(s.summary.forwardCents).toBe(875);
  expect(s.rows).toHaveLength(1);
  expect(s.summary.balanceCents).toBe(2750);
});

// ---- presetRange (finding 4): "today" comes from the business zone ----

describe('presetRange', () => {
  afterEach(() => jest.useRealTimers());
  const at = (iso: string) => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(iso));
  };

  test('near midnight the BUSINESS zone decides which month "this month" is', () => {
    at('2026-09-01T02:00:00Z'); // Aug 31, 9 PM in Chicago; already Sep 1 in Tokyo
    expect(presetRange('month', { from: '', to: '' }, 'America/Chicago')).toEqual({
      from: '2026-08-01',
    });
    expect(presetRange('month', { from: '', to: '' }, 'Asia/Tokyo')).toEqual({
      from: '2026-09-01',
    });
  });

  test('last month spans its full calendar days', () => {
    at('2026-09-06T15:00:00Z');
    expect(presetRange('last', { from: '', to: '' }, 'America/Chicago')).toEqual({
      from: '2026-08-01',
      to: '2026-08-31',
    });
  });

  test('January wraps last-month into the previous year', () => {
    at('2026-01-15T15:00:00Z');
    expect(presetRange('last', { from: '', to: '' }, 'America/Chicago')).toEqual({
      from: '2025-12-01',
      to: '2025-12-31',
    });
  });

  test('year, all-time, and custom shapes', () => {
    at('2026-09-06T15:00:00Z');
    expect(presetRange('year', { from: '', to: '' }, 'America/Chicago')).toEqual({
      from: '2026-01-01',
    });
    expect(presetRange('all', { from: '', to: '' }, 'America/Chicago')).toEqual({});
    expect(
      presetRange('custom', { from: ' 2026-09-01 ', to: '' }, 'America/Chicago'),
    ).toEqual({ from: '2026-09-01' });
  });
});
