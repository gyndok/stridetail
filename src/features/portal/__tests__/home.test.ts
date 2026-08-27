import {
  outstandingBalanceCents,
  petNamesLabel,
  portalVisitChip,
  visitWhenLabel,
} from '../home';

describe('portalVisitChip', () => {
  test('scheduled-family statuses read as Scheduled', () => {
    expect(portalVisitChip('unassigned')).toEqual({ label: 'Scheduled', tone: 'neutral' });
    expect(portalVisitChip('offered')).toEqual({ label: 'Scheduled', tone: 'neutral' });
    expect(portalVisitChip('accepted')).toEqual({ label: 'Scheduled', tone: 'neutral' });
  });

  test('in_progress reads as Happening now', () => {
    expect(portalVisitChip('in_progress')).toEqual({ label: 'Happening now', tone: 'green' });
  });

  test('completed reads as Completed (reports list)', () => {
    expect(portalVisitChip('completed')).toEqual({ label: 'Completed', tone: 'muted' });
  });
});

describe('visitWhenLabel', () => {
  test('renders the business-local wall clock, not the device zone', () => {
    // 19:00Z on Aug 27 2026 is 2:00 PM in Chicago (CDT).
    expect(visitWhenLabel('2026-08-27T19:00:00Z', 'America/Chicago')).toBe('Thu, Aug 27 · 2:00 PM');
    expect(visitWhenLabel('2026-08-27T19:00:00Z', 'America/New_York')).toBe('Thu, Aug 27 · 3:00 PM');
  });
});

describe('petNamesLabel', () => {
  const pets = [
    { id: 'p1', name: 'Biscuit' },
    { id: 'p2', name: 'Max' },
  ];

  test('joins the named pets in pet_ids order', () => {
    expect(petNamesLabel(['p2', 'p1'], pets)).toBe('Max & Biscuit');
  });

  test('skips ids without a readable pet row', () => {
    expect(petNamesLabel(['p1', 'p9'], pets)).toBe('Biscuit');
  });

  test('empty when nothing matches', () => {
    expect(petNamesLabel([], pets)).toBe('');
    expect(petNamesLabel(['p9'], pets)).toBe('');
  });
});

describe('outstandingBalanceCents', () => {
  test('sums true balances across sent invoices only', () => {
    expect(
      outstandingBalanceCents([
        {
          status: 'sent',
          items: [{ amount_cents: 5000 }, { amount_cents: -500 }],
          payments: [{ amount_cents: 1000 }],
        },
        { status: 'sent', items: [{ amount_cents: 2000 }], payments: [] },
        { status: 'paid', items: [{ amount_cents: 9900 }], payments: [{ amount_cents: 9900 }] },
      ]),
    ).toBe(3500 + 2000);
  });

  test('zero when nothing is outstanding', () => {
    expect(outstandingBalanceCents([])).toBe(0);
    expect(
      outstandingBalanceCents([
        { status: 'paid', items: [{ amount_cents: 100 }], payments: [{ amount_cents: 100 }] },
      ]),
    ).toBe(0);
  });

  test('an over-paid sent invoice reduces the total (credit)', () => {
    expect(
      outstandingBalanceCents([
        { status: 'sent', items: [{ amount_cents: 2000 }], payments: [] },
        { status: 'sent', items: [{ amount_cents: 1000 }], payments: [{ amount_cents: 1500 }] },
      ]),
    ).toBe(1500);
  });
});
