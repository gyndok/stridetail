import {
  fetchDashboardKpis,
  KPI_CLIENT_COLUMNS,
  KPI_INVOICE_COLUMNS,
  KPI_PAYMENT_COLUMNS,
  KPI_VISIT_COLUMNS,
} from '../kpis';

// Same builder-log mock pattern as billing __tests__/api.test.ts: record the
// chain per table, resolve with a per-table result.

type Step = [string, unknown[]];
const mockLog: { table: string; steps: Step[] }[] = [];
let mockResultByTable: Record<string, { data: unknown; error: unknown }> = {};

jest.mock('@/src/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      const entry = { table, steps: [] as Step[] };
      mockLog.push(entry);
      const builder: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'gte', 'lt']) {
        builder[m] = (...args: unknown[]) => {
          entry.steps.push([m, args]);
          return builder;
        };
      }
      builder.then = (resolve: (v: unknown) => unknown) =>
        Promise.resolve(resolve(mockResultByTable[table] ?? { data: [], error: null }));
      return builder;
    },
  },
}));

beforeEach(() => {
  mockLog.length = 0;
  mockResultByTable = {};
});

const TZ = 'America/Chicago';
// Wed 2026-08-26 in Chicago -> current week Aug 23-29, previous Aug 16-22.
const NOW = new Date('2026-08-26T12:00:00Z');

test('fetchDashboardKpis issues the four business-scoped queries with named columns', async () => {
  await fetchDashboardKpis('b1', TZ, NOW);
  const byTable = Object.fromEntries(mockLog.map((e) => [e.table, e.steps]));
  expect(Object.keys(byTable).sort()).toEqual(['clients', 'invoices', 'payments', 'visits']);

  expect(byTable['payments']).toEqual([
    ['select', [KPI_PAYMENT_COLUMNS]],
    ['eq', ['business_id', 'b1']],
    ['gte', ['received_on', '2026-08-16']], // previous week start
    ['lt', ['received_on', '2026-08-30']], // current week end (exclusive)
  ]);
  expect(byTable['clients']).toEqual([
    ['select', [KPI_CLIENT_COLUMNS]],
    ['eq', ['business_id', 'b1']],
  ]);
  expect(byTable['visits']).toEqual([
    ['select', [KPI_VISIT_COLUMNS]],
    ['eq', ['business_id', 'b1']],
    ['gte', ['scheduled_start', '2026-08-23T05:00:00.000Z']],
    ['lt', ['scheduled_start', '2026-08-30T05:00:00.000Z']],
  ]);
  expect(byTable['invoices']).toEqual([
    ['select', [KPI_INVOICE_COLUMNS]],
    ['eq', ['business_id', 'b1']],
    ['eq', ['status', 'sent']],
  ]);
});

test('computes every KPI from the batched rows', async () => {
  mockResultByTable = {
    payments: {
      data: [
        { amount_cents: 3000, received_on: '2026-08-24' },
        { amount_cents: 1000, received_on: '2026-08-18' },
      ],
      error: null,
    },
    clients: { data: [{ pets: [{ count: 2 }] }, { pets: [{ count: 1 }] }], error: null },
    visits: {
      data: [{ status: 'completed' }, { status: 'accepted' }, { status: 'cancelled' }],
      error: null,
    },
    invoices: {
      data: [{ status: 'sent', items: [{ amount_cents: 5000 }], payments: [{ amount_cents: 2000 }] }],
      error: null,
    },
  };
  const kpis = await fetchDashboardKpis('b1', TZ, NOW);
  expect(kpis.revenue).toEqual({ currentCents: 3000, previousCents: 1000, deltaCents: 2000 });
  expect(kpis.clients).toEqual({ clients: 2, pets: 3 });
  expect(kpis.walks).toEqual({ completed: 1, total: 2 });
  expect(kpis.outstanding).toEqual({ totalCents: 3000, unpaidCount: 1 });
  expect(kpis.windows.current.startYmd).toBe('2026-08-23');
});

test('a failing query throws', async () => {
  mockResultByTable = { visits: { data: null, error: new Error('42501') } };
  await expect(fetchDashboardKpis('b1', TZ, NOW)).rejects.toThrow('42501');
});
