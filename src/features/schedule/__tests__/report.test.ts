import {
  getReportEmailStatus,
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
      for (const m of ['select', 'eq', 'order', 'limit', 'maybeSingle']) {
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
  expect(cols).toEqual(['public_token', 'sent_at', 'revoked_at']);
  expect(REPORT_COLUMNS).not.toContain('private_notes_md');
  expect(REPORT_COLUMNS).not.toContain('*');
});

test('getVisitReport selects named columns pinned to business and visit, maybeSingle', async () => {
  mockResult = {
    data: { public_token: 'ab'.repeat(24), sent_at: null, revoked_at: null },
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

test('getReportEmailStatus reads the LATEST visit_finished email row for the visit', async () => {
  mockResult = { data: { status: 'sent', updated_at: '2026-08-24T20:12:00Z' }, error: null };
  const n = await getReportEmailStatus('biz-1', 'visit-1');
  expect(n?.status).toBe('sent');
  const entry = mockLog[0]!;
  expect(entry.table).toBe('notifications');
  expect(entry.steps).toEqual([
    ['select', ['status, updated_at']],
    ['eq', ['business_id', 'biz-1']],
    ['eq', ['channel', 'email']],
    ['eq', ['template', 'visit_finished']],
    ['eq', ['payload->>visitId', 'visit-1']],
    ['order', ['created_at', { ascending: false }]],
    ['limit', [1]],
    ['maybeSingle', []],
  ]);
});

test('getReportEmailStatus returns null when nothing was ever queued (no email on file)', async () => {
  mockResult = { data: null, error: null };
  await expect(getReportEmailStatus('biz-1', 'visit-1')).resolves.toBeNull();
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

test('reportLink joins the shared base with the token (mirrors the senders)', () => {
  const token = 'cd'.repeat(24);
  expect(reportLink(token)).toBe(`${REPORT_BASE_URL}/${token}`);
  expect(reportLink(token).startsWith('https://stridetail.app/report/')).toBe(true);
});

// ---- email delivery status line ----

const tz = 'America/Chicago';

test('reportStatusLine: no notification row means the client had no email at finish', () => {
  expect(reportStatusLine(null, tz)).toBe('Email: not sent — client has no email on file');
});

test('reportStatusLine: queued until the send-email cron drains the row', () => {
  expect(reportStatusLine({ status: 'queued', updated_at: null }, tz)).toBe('Email: queued');
  // 'sending' is a mid-claim blink, still "queued" to the owner.
  expect(reportStatusLine({ status: 'sending', updated_at: '2026-08-24T20:00:00Z' }, tz)).toBe(
    'Email: queued',
  );
});

test('reportStatusLine: sent shows the business-local send time', () => {
  // 2026-08-24T20:12:00Z is 15:12 CDT.
  expect(reportStatusLine({ status: 'sent', updated_at: '2026-08-24T20:12:00Z' }, tz)).toBe(
    'Email: sent Aug 24, 3:12 PM',
  );
  expect(reportStatusLine({ status: 'sent', updated_at: null }, tz)).toBe('Email: sent');
});

test('reportStatusLine: terminal failure states', () => {
  expect(reportStatusLine({ status: 'failed', updated_at: null }, tz)).toBe('Email: failed to send');
  expect(reportStatusLine({ status: 'skipped_no_provider', updated_at: null }, tz)).toBe(
    'Email: not sent — email delivery pending setup',
  );
});

test('reportStatusLine: unknown statuses pass through verbatim', () => {
  expect(reportStatusLine({ status: 'mystery', updated_at: null }, tz)).toBe('Email: mystery');
});
