import {
  listProblemNotifications,
  notificationIssueLabel,
  problemVisitIds,
  type ProblemNotification,
} from '../api';

// Notification-problem surfacing (Plan 4 Task 6; sms retired by migration
// 0013 — email is the live channel, dormant-sms rows are excluded).

// ---- supabase mock (chain recorder, matching visits.test.ts) ----

type Step = [string, unknown[]];
const mockLog: { table: string; steps: Step[] }[] = [];
let mockResult: { data: unknown; error: unknown } = { data: null, error: null };

jest.mock('@/src/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      const entry = { table, steps: [] as Step[] };
      mockLog.push(entry);
      const builder: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'in', 'or', 'gte', 'order']) {
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
  mockResult = { data: null, error: null };
});

// ---- pure helpers ----

const failedEmail = (over?: Partial<ProblemNotification>): ProblemNotification => ({
  id: 'n1',
  channel: 'email',
  template: 'visit_finished',
  status: 'failed',
  payload: {},
  ...over,
});

test('notificationIssueLabel: null when nothing is undelivered', () => {
  expect(notificationIssueLabel([])).toBeNull();
});

test('notificationIssueLabel: all-email rows read as emails, singular and plural', () => {
  expect(notificationIssueLabel([failedEmail()])).toBe('1 email not delivered');
  expect(notificationIssueLabel([failedEmail(), failedEmail({ id: 'n2', status: 'skipped_no_provider' })])).toBe(
    '2 emails not delivered',
  );
});

test('notificationIssueLabel: a non-email row falls back to the generic noun', () => {
  // A real FAILED sms (never excluded by the query) still surfaces honestly.
  expect(notificationIssueLabel([failedEmail(), failedEmail({ id: 'n2', channel: 'sms' })])).toBe(
    '2 notifications not delivered',
  );
  expect(notificationIssueLabel([failedEmail({ channel: 'sms' })])).toBe('1 notification not delivered');
});

test('problemVisitIds collects visitId payloads and ignores rows without one', () => {
  const ids = problemVisitIds([
    failedEmail({ payload: { visitId: 'v1', reportToken: 't' } }),
    failedEmail({ id: 'n2', payload: { visitId: 'v1' } }), // duplicate collapses
    failedEmail({ id: 'n3', template: 'invite', payload: { token: 'x' } }), // no visit
    failedEmail({ id: 'n4', payload: { visitId: 42 } }), // non-string ignored
  ]);
  expect([...ids].sort()).toEqual(['v1']);
});

// ---- query shape ----

test('listProblemNotifications scopes to the business, terminal statuses, and excludes dormant-sms skips', async () => {
  mockResult = { data: [failedEmail()], error: null };
  const rows = await listProblemNotifications('b1');
  expect(rows).toHaveLength(1);
  const q = mockLog[0]!;
  expect(q.table).toBe('notifications');
  expect(q.steps).toEqual([
    ['select', ['id, channel, template, status, payload']],
    ['eq', ['business_id', 'b1']],
    ['in', ['status', ['failed', 'skipped_no_provider']]],
    // NOT(channel='sms' AND status='skipped_no_provider'): an sms row skipped
    // for lack of a provider is the dormant channel's expected state, not a
    // problem; failed sms and every email problem still match.
    ['or', ['channel.neq.sms,status.neq.skipped_no_provider']],
    // 7-day age bound: terminal failures older than a week age out of the
    // needs-attention strip instead of haunting it forever.
    ['gte', ['created_at', expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/)]],
    ['order', ['created_at', { ascending: false }]],
  ]);
});

test('listProblemNotifications surfaces query errors', async () => {
  mockResult = { data: null, error: new Error('boom') };
  await expect(listProblemNotifications('b1')).rejects.toThrow('boom');
});
