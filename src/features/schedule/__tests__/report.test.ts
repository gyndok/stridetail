import {
  getVisitReport,
  REPORT_COLUMNS,
  reportLink,
  reportStatusLine,
  resendReport,
  revokeReport,
} from '../report';
import { REPORT_BASE_URL } from '@/src/lib/brand';

type Step = [string, unknown[]];
const mockLog: { table: string; steps: Step[] }[] = [];
let mockResult: { data: unknown; error: unknown } = { data: null, error: null };
const rpcLog: Step[] = [];
let mockRpcResult: { data: unknown; error: unknown } = { data: null, error: null };

jest.mock('@/src/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      const entry = { table, steps: [] as Step[] };
      mockLog.push(entry);
      const builder: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'maybeSingle']) {
        builder[m] = (...args: unknown[]) => {
          entry.steps.push([m, args]);
          return builder;
        };
      }
      builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve(resolve(mockResult));
      return builder;
    },
    rpc: async (...args: unknown[]) => {
      rpcLog.push(['rpc', args]);
      return mockRpcResult;
    },
  },
}));

beforeEach(() => {
  mockLog.length = 0;
  rpcLog.length = 0;
  mockResult = { data: null, error: null };
  mockRpcResult = { data: null, error: null };
});

// ---- query shape ----

test('REPORT_COLUMNS carries the card fields and never the private notes', () => {
  const cols = REPORT_COLUMNS.split(',').map((c) => c.trim());
  expect(cols).toEqual(['public_token', 'sent_at', 'sms_status', 'revoked_at']);
  expect(REPORT_COLUMNS).not.toContain('private_notes_md');
  expect(REPORT_COLUMNS).not.toContain('*');
});

test('getVisitReport selects named columns pinned to business and visit, maybeSingle', async () => {
  mockResult = {
    data: { public_token: 'ab'.repeat(24), sent_at: null, sms_status: null, revoked_at: null },
    error: null,
  };
  const r = await getVisitReport('biz-1', 'visit-1');
  expect(r?.public_token).toBe('ab'.repeat(24));
  const entry = mockLog[0]!;
  expect(entry.table).toBe('visit_reports');
  expect(entry.steps).toEqual([
    ['select', [REPORT_COLUMNS]],
    ['eq', ['business_id', 'biz-1']],
    ['eq', ['visit_id', 'visit-1']],
    ['maybeSingle', []],
  ]);
});

test('getVisitReport returns null when no report row exists', async () => {
  mockResult = { data: null, error: null };
  await expect(getVisitReport('biz-1', 'visit-1')).resolves.toBeNull();
});

test('resend and revoke go through the audited RPCs', async () => {
  await resendReport('visit-1');
  await revokeReport('visit-1');
  expect(rpcLog).toEqual([
    ['rpc', ['resend_report', { p_visit: 'visit-1' }]],
    ['rpc', ['revoke_report', { p_visit: 'visit-1' }]],
  ]);
});

// ---- link ----

test('reportLink joins the shared base with the token (mirrors send-sms)', () => {
  const token = 'cd'.repeat(24);
  expect(reportLink(token)).toBe(`${REPORT_BASE_URL}/${token}`);
  expect(reportLink(token).startsWith('https://stridetail.app/report/')).toBe(true);
});

// ---- SMS status line ----

const tz = 'America/Chicago';

test('reportStatusLine: queued until the sender stamps a status', () => {
  expect(reportStatusLine({ sms_status: null, sent_at: null }, tz)).toBe('SMS: queued');
});

test('reportStatusLine: sent shows the business-local send time', () => {
  // 2026-08-24T20:12:00Z is 15:12 CDT.
  expect(reportStatusLine({ sms_status: 'sent', sent_at: '2026-08-24T20:12:00Z' }, tz)).toBe(
    'SMS: sent Aug 24, 3:12 PM',
  );
  expect(reportStatusLine({ sms_status: 'sent', sent_at: null }, tz)).toBe('SMS: sent');
});

test('reportStatusLine: terminal failure states', () => {
  expect(reportStatusLine({ sms_status: 'failed', sent_at: null }, tz)).toBe('SMS: failed to send');
  expect(reportStatusLine({ sms_status: 'skipped_no_provider', sent_at: null }, tz)).toBe(
    'SMS: not sent — SMS pending setup',
  );
});

test('reportStatusLine: unknown statuses pass through verbatim', () => {
  expect(reportStatusLine({ sms_status: 'sending', sent_at: null }, tz)).toBe('SMS: sending');
});
