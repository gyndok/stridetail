import {
  listPortalBusinesses,
  listPortalPets,
  listPortalSentInvoices,
  listRecentReports,
  listUpcomingVisits,
  PORTAL_INVOICE_COLUMNS,
  PORTAL_REPORT_COLUMNS,
  PORTAL_VISIT_COLUMNS,
} from '../api';

type Step = [string, unknown[]];
const mockLog: { table: string; steps: Step[] }[] = [];
let mockResult: { data: unknown; error: unknown } = { data: [], error: null };

jest.mock('@/src/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      const entry = { table, steps: [] as Step[] };
      mockLog.push(entry);
      const builder: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'in', 'gte', 'order', 'limit']) {
        builder[m] = (...args: unknown[]) => {
          entry.steps.push([m, args]);
          return builder;
        };
      }
      builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve(resolve(mockResult));
      return builder;
    },
  },
}));

beforeEach(() => {
  mockLog.length = 0;
  mockResult = { data: [], error: null };
});

/**
 * The client-side column contract (Plan 8 Task 4): visits selects must NEVER
 * carry price_cents_snapshot (the column grant errors the whole query for
 * clients) and must never render owner_notes_md / decline_reason /
 * private_notes_md even though rows are technically selectable.
 */
const FORBIDDEN = /price_cents_snapshot|owner_notes_md|decline_reason|private_notes_md/;

test('portal column constants exclude the forbidden columns', () => {
  expect(PORTAL_VISIT_COLUMNS).not.toMatch(FORBIDDEN);
  expect(PORTAL_REPORT_COLUMNS).not.toMatch(FORBIDDEN);
  expect(PORTAL_INVOICE_COLUMNS).not.toMatch(FORBIDDEN);
});

test('listUpcomingVisits: named columns, client scope, soonest first', async () => {
  await listUpcomingVisits('c1', '2026-08-26T12:00:00Z');
  expect(mockLog[0]?.table).toBe('visits');
  expect(mockLog[0]?.steps).toEqual([
    ['select', [PORTAL_VISIT_COLUMNS]],
    ['eq', ['client_id', 'c1']],
    ['in', ['status', ['unassigned', 'offered', 'accepted', 'in_progress']]],
    ['gte', ['scheduled_end', '2026-08-26T12:00:00Z']],
    ['order', ['scheduled_start', { ascending: true }]],
    ['limit', [3]],
  ]);
  const select = String(mockLog[0]?.steps[0]?.[1]?.[0]);
  expect(select).not.toMatch(FORBIDDEN);
  expect(select).toContain('business_tz');
  expect(select).toContain('service:services(name)');
});

test('listRecentReports: inner-joined visit filtered by client, newest first', async () => {
  await listRecentReports('c1');
  expect(mockLog[0]?.table).toBe('visit_reports');
  expect(mockLog[0]?.steps).toEqual([
    ['select', [PORTAL_REPORT_COLUMNS]],
    ['eq', ['visit.client_id', 'c1']],
    ['order', ['created_at', { ascending: false }]],
    ['limit', [3]],
  ]);
  const select = String(mockLog[0]?.steps[0]?.[1]?.[0]);
  expect(select).not.toMatch(FORBIDDEN);
  expect(select).toContain('visit:visits!inner(');
});

test('listPortalSentInvoices: sent only, amounts for client-side math', async () => {
  await listPortalSentInvoices('c1');
  expect(mockLog[0]?.table).toBe('invoices');
  expect(mockLog[0]?.steps).toEqual([
    ['select', [PORTAL_INVOICE_COLUMNS]],
    ['eq', ['client_id', 'c1']],
    ['eq', ['status', 'sent']],
  ]);
  const select = String(mockLog[0]?.steps[0]?.[1]?.[0]);
  expect(select).toContain('items:invoice_items(amount_cents)');
  expect(select).toContain('payments:payments(amount_cents)');
});

test('listPortalPets: id and name only, for pet_ids joins', async () => {
  await listPortalPets('c1');
  expect(mockLog[0]?.table).toBe('pets');
  expect(mockLog[0]?.steps).toEqual([
    ['select', ['id, name']],
    ['eq', ['client_id', 'c1']],
    ['order', ['name', { ascending: true }]],
  ]);
});

test('listPortalBusinesses: branding columns for the linked businesses', async () => {
  await listPortalBusinesses(['b1', 'b2']);
  expect(mockLog[0]?.table).toBe('businesses');
  expect(mockLog[0]?.steps).toEqual([
    ['select', ['id, name, brand_color, time_zone']],
    ['in', ['id', ['b1', 'b2']]],
  ]);
});

test('listPortalBusinesses: no ids -> no query', async () => {
  expect(await listPortalBusinesses([])).toEqual([]);
  expect(mockLog).toHaveLength(0);
});

test('queries surface supabase errors', async () => {
  mockResult = { data: null, error: new Error('boom') };
  await expect(listUpcomingVisits('c1', '2026-08-26T12:00:00Z')).rejects.toThrow('boom');
});
