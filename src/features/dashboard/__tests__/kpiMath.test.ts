import {
  clientsKpi,
  kpiWeekWindows,
  outstandingKpi,
  revenueDeltaLabel,
  revenueKpi,
  walksKpi,
} from '../kpiMath';

const TZ = 'America/Chicago';
const HOUR_MS = 3_600_000;

const span = (w: { fromUtc: Date; toUtc: Date }) =>
  (w.toUtc.getTime() - w.fromUtc.getTime()) / HOUR_MS;

describe('kpiWeekWindows', () => {
  test('normal week: Sunday-based local bounds in the business tz', () => {
    // Wed 2026-08-26 07:00 in Chicago -> week Sun Aug 23 .. Sat Aug 29.
    const w = kpiWeekWindows(new Date('2026-08-26T12:00:00Z'), TZ);
    expect(w.current.startYmd).toBe('2026-08-23');
    expect(w.current.endYmd).toBe('2026-08-30');
    expect(w.current.fromUtc.toISOString()).toBe('2026-08-23T05:00:00.000Z'); // CDT midnight
    expect(span(w.current)).toBe(168);
    expect(w.previous.startYmd).toBe('2026-08-16');
    expect(w.previous.endYmd).toBe('2026-08-23');
    expect(span(w.previous)).toBe(168);
  });

  test('windows are contiguous: previous ends exactly where current begins', () => {
    const w = kpiWeekWindows(new Date('2026-08-26T12:00:00Z'), TZ);
    expect(w.previous.toUtc.toISOString()).toBe(w.current.fromUtc.toISOString());
    expect(w.previous.endYmd).toBe(w.current.startYmd);
  });

  test('spring-forward week is 167 real hours, previous still 168', () => {
    // DST starts Sun 2026-03-08 in Chicago; anchor Wed Mar 11.
    const w = kpiWeekWindows(new Date('2026-03-11T12:00:00Z'), TZ);
    expect(w.current.startYmd).toBe('2026-03-08');
    expect(w.current.endYmd).toBe('2026-03-15');
    expect(w.current.fromUtc.toISOString()).toBe('2026-03-08T06:00:00.000Z'); // CST midnight
    expect(w.current.toUtc.toISOString()).toBe('2026-03-15T05:00:00.000Z'); // CDT midnight
    expect(span(w.current)).toBe(167);
    expect(w.previous.startYmd).toBe('2026-03-01');
    expect(span(w.previous)).toBe(168);
    expect(w.previous.toUtc.toISOString()).toBe(w.current.fromUtc.toISOString());
  });

  test('fall-back week is 169 real hours', () => {
    // DST ends Sun 2026-11-01 in Chicago; anchor Wed Nov 4.
    const w = kpiWeekWindows(new Date('2026-11-04T12:00:00Z'), TZ);
    expect(w.current.startYmd).toBe('2026-11-01');
    expect(w.current.endYmd).toBe('2026-11-08');
    expect(span(w.current)).toBe(169);
  });
});

describe('revenueKpi', () => {
  const windows = kpiWeekWindows(new Date('2026-08-26T12:00:00Z'), TZ);

  test('splits payments by received_on at the week boundaries', () => {
    const kpi = revenueKpi(
      [
        { amount_cents: 1000, received_on: '2026-08-23' }, // current week start (inclusive)
        { amount_cents: 2000, received_on: '2026-08-29' }, // current week end day
        { amount_cents: 4000, received_on: '2026-08-22' }, // previous week last day
        { amount_cents: 8000, received_on: '2026-08-16' }, // previous week start (inclusive)
        { amount_cents: 500, received_on: '2026-08-15' }, // before both windows: ignored
        { amount_cents: 500, received_on: '2026-08-30' }, // after current window: ignored
      ],
      windows,
    );
    expect(kpi.currentCents).toBe(3000);
    expect(kpi.previousCents).toBe(12_000);
    expect(kpi.deltaCents).toBe(-9000);
  });

  test('zero state: no payments at all', () => {
    expect(revenueKpi([], windows)).toEqual({ currentCents: 0, previousCents: 0, deltaCents: 0 });
  });
});

describe('revenueDeltaLabel', () => {
  test('up is green, down is warning, flat is muted', () => {
    expect(revenueDeltaLabel(1200)).toEqual({ text: '▲ $12.00 vs last week', tone: 'green' });
    expect(revenueDeltaLabel(-501)).toEqual({ text: '▼ $5.01 vs last week', tone: 'warning' });
    expect(revenueDeltaLabel(0)).toEqual({ text: 'Same as last week', tone: 'muted' });
  });
});

describe('walksKpi', () => {
  test('completed over non-cancelled total', () => {
    expect(
      walksKpi([
        { status: 'completed' },
        { status: 'completed' },
        { status: 'accepted' },
        { status: 'in_progress' },
        { status: 'unassigned' },
        { status: 'cancelled' }, // in neither count
      ]),
    ).toEqual({ completed: 2, total: 5 });
  });

  test('zero state', () => {
    expect(walksKpi([])).toEqual({ completed: 0, total: 0 });
  });
});

describe('clientsKpi', () => {
  test('counts clients and sums the pets(count) embeds', () => {
    expect(
      clientsKpi([{ pets: [{ count: 2 }] }, { pets: [{ count: 1 }] }, { pets: null }]),
    ).toEqual({ clients: 3, pets: 3 });
  });

  test('zero state', () => {
    expect(clientsKpi([])).toEqual({ clients: 0, pets: 0 });
  });
});

describe('outstandingKpi', () => {
  test('sums sent balances; counts only sent invoices still owing', () => {
    const kpi = outstandingKpi([
      // sent, partially paid: balance 3000, counted
      { status: 'sent', items: [{ amount_cents: 5000 }], payments: [{ amount_cents: 2000 }] },
      // sent, untouched: balance 1000, counted
      { status: 'sent', items: [{ amount_cents: 1000 }], payments: [] },
      // sent but over-paid: credit reduces the total, NOT counted as unpaid
      { status: 'sent', items: [{ amount_cents: 1000 }], payments: [{ amount_cents: 1500 }] },
      // draft and paid never contribute
      { status: 'draft', items: [{ amount_cents: 9000 }], payments: [] },
      { status: 'paid', items: [{ amount_cents: 9000 }], payments: [{ amount_cents: 9000 }] },
    ]);
    expect(kpi.totalCents).toBe(3500);
    expect(kpi.unpaidCount).toBe(2);
  });

  test('zero state', () => {
    expect(outstandingKpi([])).toEqual({ totalCents: 0, unpaidCount: 0 });
  });
});
