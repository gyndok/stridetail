import { listProblemNotifications, problemVisitIds, smsIssueLabel, type ProblemNotification } from '../api';

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
      for (const m of ['select', 'eq', 'in', 'order']) {
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

const skipped = (over?: Partial<ProblemNotification>): ProblemNotification => ({
  id: 'n1',
  template: 'visit_finished',
  status: 'skipped_no_provider',
  payload: {},
  ...over,
});

test('smsIssueLabel: null when nothing is undelivered', () => {
  expect(smsIssueLabel([])).toBeNull();
});

test('smsIssueLabel: all skipped_no_provider explains SMS is pending setup', () => {
  expect(smsIssueLabel([skipped()])).toBe('1 SMS message not sent — SMS pending setup');
  expect(smsIssueLabel([skipped(), skipped({ id: 'n2' })])).toBe(
    '2 SMS messages not sent — SMS pending setup',
  );
});

test('smsIssueLabel: any hard failure drops the setup note', () => {
  expect(smsIssueLabel([skipped(), skipped({ id: 'n2', status: 'failed' })])).toBe(
    '2 SMS messages not sent',
  );
});

test('problemVisitIds collects visitId payloads and ignores rows without one', () => {
  const ids = problemVisitIds([
    skipped({ payload: { visitId: 'v1', reportToken: 't' } }),
    skipped({ id: 'n2', payload: { visitId: 'v1' } }), // duplicate collapses
    skipped({ id: 'n3', template: 'invite', payload: { token: 'x' } }), // no visit
    skipped({ id: 'n4', payload: { visitId: 42 } }), // non-string ignored
  ]);
  expect([...ids].sort()).toEqual(['v1']);
});

// ---- query shape ----

test('listProblemNotifications scopes to the business and terminal statuses only', async () => {
  mockResult = { data: [skipped()], error: null };
  const rows = await listProblemNotifications('b1');
  expect(rows).toHaveLength(1);
  const q = mockLog[0]!;
  expect(q.table).toBe('notifications');
  expect(q.steps).toEqual([
    ['select', ['id, template, status, payload']],
    ['eq', ['business_id', 'b1']],
    ['in', ['status', ['failed', 'skipped_no_provider']]],
    ['order', ['created_at', { ascending: false }]],
  ]);
});

test('listProblemNotifications surfaces query errors', async () => {
  mockResult = { data: null, error: new Error('boom') };
  await expect(listProblemNotifications('b1')).rejects.toThrow('boom');
});
