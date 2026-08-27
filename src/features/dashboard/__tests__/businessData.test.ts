import {
  BUSINESS_CLIENT_COLUMNS,
  capRows,
  clientFlags,
  fetchBusinessClients,
  fetchUnbilledVisitCount,
  filterClients,
  invoiceRowView,
  petsSummary,
  unbilledVisitCount,
  type BusinessClientRow,
} from '../businessData';

import type { InvoiceListItem } from '@/src/features/billing/api';

// Same builder-log mock pattern as kpis.test.ts / billing api.test.ts: record
// the chain per table, resolve with a per-table result.

type Step = [string, unknown[]];
const mockLog: { table: string; steps: Step[] }[] = [];
let mockResultByTable: Record<string, { data: unknown; error: unknown }> = {};

jest.mock('@/src/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      const entry = { table, steps: [] as Step[] };
      mockLog.push(entry);
      const builder: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'not', 'order']) {
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

const client = (over: Partial<BusinessClientRow>): BusinessClientRow => ({
  id: 'c1',
  name: 'Dana',
  phones: ['555-0100'],
  email: 'dana@example.com',
  mg_completed_at: '2026-08-01T00:00:00Z',
  portal_invited_at: null,
  pets: [],
  ...over,
});

// ---- roster query ----

test('fetchBusinessClients issues one business-scoped named-columns query ordered by name', async () => {
  await fetchBusinessClients('b1');
  expect(mockLog).toHaveLength(1);
  const [entry] = mockLog;
  expect(entry?.table).toBe('clients');
  expect(entry?.steps).toEqual([
    ['select', [BUSINESS_CLIENT_COLUMNS]],
    ['eq', ['business_id', 'b1']],
    ['order', ['name']],
  ]);
});

test('fetchBusinessClients throws on error', async () => {
  mockResultByTable = { clients: { data: null, error: new Error('42501') } };
  await expect(fetchBusinessClients('b1')).rejects.toThrow('42501');
});

// ---- search filter (client-side: ~11 clients, fetch-all + filter) ----

test('filterClients matches on client name, case-insensitive', () => {
  const rows = [client({ id: 'c1', name: 'Dana Smith' }), client({ id: 'c2', name: 'Lee Wong' })];
  expect(filterClients(rows, 'dana').map((c) => c.id)).toEqual(['c1']);
  expect(filterClients(rows, 'WONG').map((c) => c.id)).toEqual(['c2']);
});

test('filterClients matches on pet name too', () => {
  const rows = [
    client({ id: 'c1', pets: [{ id: 'p1', name: 'Baxter', species: 'dog' }] }),
    client({ id: 'c2', pets: [{ id: 'p2', name: 'Olive', species: 'cat' }] }),
  ];
  expect(filterClients(rows, 'bax').map((c) => c.id)).toEqual(['c1']);
});

test('filterClients: blank or whitespace term returns every row; no match returns none', () => {
  const rows = [client({ id: 'c1' }), client({ id: 'c2' })];
  expect(filterClients(rows, '')).toEqual(rows);
  expect(filterClients(rows, '   ')).toEqual(rows);
  expect(filterClients(rows, 'zzz')).toEqual([]);
});

// ---- pets summary ----

test('petsSummary renders "Name (species)" name-sorted, skipping missing species', () => {
  expect(
    petsSummary([
      { id: 'p2', name: 'Olive', species: 'dog' },
      { id: 'p1', name: 'Baxter', species: 'dog' },
      { id: 'p3', name: 'Rex', species: null },
    ]),
  ).toBe('Baxter (dog), Olive (dog), Rex');
});

test('petsSummary: no pets', () => {
  expect(petsSummary([])).toBe('No pets');
});

// ---- flags ----

test('clientFlags: missing email flips noEmail (portal invites need one)', () => {
  expect(clientFlags(client({ email: null })).noEmail).toBe(true);
  expect(clientFlags(client({ email: '  ' })).noEmail).toBe(true);
  expect(clientFlags(client({ email: 'a@b.c' })).noEmail).toBe(false);
});

test('clientFlags: meet & greet pending while mg_completed_at is null', () => {
  expect(clientFlags(client({ mg_completed_at: null })).meetGreetPending).toBe(true);
  expect(clientFlags(client({ mg_completed_at: '2026-08-01T00:00:00Z' })).meetGreetPending).toBe(
    false,
  );
});

// ---- row cap ----

test('capRows: at or under the cap shows all with no remainder', () => {
  const rows = [1, 2, 3];
  expect(capRows(rows, 8)).toEqual({ visible: rows, moreCount: 0 });
});

test('capRows: over the cap slices and counts the rest', () => {
  const rows = Array.from({ length: 11 }, (_, i) => i);
  const { visible, moreCount } = capRows(rows, 8);
  expect(visible).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  expect(moreCount).toBe(3);
});

// ---- invoice row shaping ----

const NOW = new Date('2026-08-27T12:00:00Z');

const invoice = (over: Partial<InvoiceListItem>): InvoiceListItem => ({
  id: 'i1',
  business_id: 'b1',
  client_id: 'c1',
  number: 7,
  status: 'sent',
  issued_on: '2026-08-20',
  due_on: null,
  sent_at: '2026-08-20T00:00:00Z',
  paid_at: null,
  client: { name: 'Dana' },
  items: [{ amount_cents: 5000 }],
  payments: [],
  ...over,
});

test('invoiceRowView shapes label, client, amount, and status chip', () => {
  const row = invoiceRowView(invoice({}), NOW);
  expect(row).toEqual({
    id: 'i1',
    label: 'INV-0007',
    clientName: 'Dana',
    amountLabel: '$50.00',
    chip: { label: 'Sent', tone: 'neutral' },
  });
});

test('invoiceRowView: paid goes green, overdue sent goes danger, missing client falls back', () => {
  expect(invoiceRowView(invoice({ status: 'paid' }), NOW).chip).toEqual({
    label: 'Paid',
    tone: 'green',
  });
  expect(invoiceRowView(invoice({ due_on: '2026-08-01' }), NOW).chip).toEqual({
    label: 'Overdue',
    tone: 'danger',
  });
  expect(invoiceRowView(invoice({ client: null }), NOW).clientName).toBe('Client');
});

// ---- unbilled visits count ----

test('unbilledVisitCount: completed visits minus the invoiced set', () => {
  const visits = [{ id: 'v1' }, { id: 'v2' }, { id: 'v3' }];
  const invoiced = [{ visit_id: 'v2' }, { visit_id: null }];
  expect(unbilledVisitCount(visits, invoiced)).toBe(2);
  expect(unbilledVisitCount([], [])).toBe(0);
});

test('fetchUnbilledVisitCount issues both business-scoped reads and filters client-side', async () => {
  mockResultByTable = {
    visits: { data: [{ id: 'v1' }, { id: 'v2' }], error: null },
    invoice_items: { data: [{ visit_id: 'v1' }], error: null },
  };
  const count = await fetchUnbilledVisitCount('b1');
  expect(count).toBe(1);
  const byTable = Object.fromEntries(mockLog.map((e) => [e.table, e.steps]));
  expect(byTable['visits']).toEqual([
    ['select', ['id']],
    ['eq', ['business_id', 'b1']],
    ['eq', ['status', 'completed']],
  ]);
  expect(byTable['invoice_items']).toEqual([
    ['select', ['visit_id']],
    ['eq', ['business_id', 'b1']],
    ['not', ['visit_id', 'is', null]],
  ]);
});
