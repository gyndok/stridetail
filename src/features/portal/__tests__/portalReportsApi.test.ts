import {
  groupReportsByMonth,
  listReportArchive,
  PORTAL_REPORT_ARCHIVE_COLUMNS,
  reportHref,
  type PortalReportCard,
} from '../reportsApi';

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

/** Same column contract as portalQueries.test.ts — extended to Task 5 selects. */
const FORBIDDEN = /price_cents_snapshot|owner_notes_md|decline_reason|private_notes_md/;

function card(over: Partial<PortalReportCard> & { scheduled_start?: string; tz?: string }): PortalReportCard {
  return {
    id: over.id ?? 'r1',
    visit_id: 'v1',
    created_at: over.created_at ?? '2026-08-25T20:00:00Z',
    public_token: over.public_token ?? 'tok1',
    revoked_at: over.revoked_at ?? null,
    visit: {
      id: 'v1',
      client_id: 'c1',
      scheduled_start: over.scheduled_start ?? '2026-08-25T19:00:00Z',
      business_tz: over.tz ?? 'America/Chicago',
      status: 'completed',
      pet_ids: ['p1'],
      service: { name: 'Walk' },
    },
  };
}

test('archive columns: named only, no forbidden columns, token included', () => {
  expect(PORTAL_REPORT_ARCHIVE_COLUMNS).not.toMatch(FORBIDDEN);
  expect(PORTAL_REPORT_ARCHIVE_COLUMNS).toContain('public_token');
  expect(PORTAL_REPORT_ARCHIVE_COLUMNS).toContain('revoked_at');
  expect(PORTAL_REPORT_ARCHIVE_COLUMNS).toContain('visit:visits!inner(');
});

test('listReportArchive: inner-joined visit filtered by client, newest first', async () => {
  await listReportArchive('c1');
  expect(mockLog[0]?.table).toBe('visit_reports');
  expect(mockLog[0]?.steps).toEqual([
    ['select', [PORTAL_REPORT_ARCHIVE_COLUMNS]],
    ['eq', ['visit.client_id', 'c1']],
    ['order', ['created_at', { ascending: false }]],
    ['limit', [200]],
  ]);
});

test('listReportArchive surfaces supabase errors', async () => {
  mockResult = { data: null, error: new Error('boom') };
  await expect(listReportArchive('c1')).rejects.toThrow('boom');
});

test('reportHref: live token deep-links, revoked token does not', () => {
  expect(reportHref(card({ public_token: 'tokA' }))).toBe('/report/tokA');
  expect(reportHref(card({ revoked_at: '2026-08-26T00:00:00Z' }))).toBeNull();
});

test('groupReportsByMonth: month of the visit in the business zone, newest first', () => {
  const groups = groupReportsByMonth([
    // Deliberately shuffled — the grouper sorts by scheduled_start itself.
    card({ id: 'july', scheduled_start: '2026-07-10T19:00:00Z' }),
    card({ id: 'augLate', scheduled_start: '2026-08-25T19:00:00Z' }),
    card({ id: 'augEarly', scheduled_start: '2026-08-02T19:00:00Z' }),
    // Aug 1 00:30 UTC is still JULY 31 in Chicago — zone decides the month.
    card({ id: 'julyByZone', scheduled_start: '2026-08-01T00:30:00Z' }),
  ]);
  expect(groups.map((g) => g.key)).toEqual(['2026-08', '2026-07']);
  expect(groups.map((g) => g.label)).toEqual(['August 2026', 'July 2026']);
  expect(groups[0]?.reports.map((r) => r.id)).toEqual(['augLate', 'augEarly']);
  expect(groups[1]?.reports.map((r) => r.id)).toEqual(['julyByZone', 'july']);
});

test('groupReportsByMonth: empty in, empty out', () => {
  expect(groupReportsByMonth([])).toEqual([]);
});
