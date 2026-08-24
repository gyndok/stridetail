import { queueInviteSms } from '../api';

// ---- supabase mock (chain recorder) ----

type Step = [string, unknown[]];
const mockLog: { table: string; steps: Step[] }[] = [];
let mockResult: { data: unknown; error: unknown } = { data: null, error: null };

jest.mock('@/src/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      const entry = { table, steps: [] as Step[] };
      mockLog.push(entry);
      const builder: Record<string, unknown> = {};
      for (const m of ['insert', 'select']) {
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

test('queueInviteSms inserts the exact row shape the 0011 owner policy allows', async () => {
  await queueInviteSms('b1', '+15551234567', 'tok123');
  const q = mockLog[0]!;
  expect(q.table).toBe('notifications');
  expect(q.steps).toHaveLength(1);
  const [method, args] = q.steps[0]!;
  expect(method).toBe('insert');
  const row = args[0] as Record<string, unknown>;
  expect(row).toMatchObject({
    business_id: 'b1',
    channel: 'sms',
    to: '+15551234567',
    template: 'invite',
    payload: { token: 'tok123', link: 'stridetail://invite/tok123' },
  });
  // Explicit due-now stamp (belt and braces over the column default).
  expect(typeof row.next_attempt_at).toBe('string');
  // Never forge status/attempts — the DB defaults (queued/0) must apply.
  expect(row).not.toHaveProperty('status');
  expect(row).not.toHaveProperty('attempts');
});

test('queueInviteSms surfaces insert errors', async () => {
  mockResult = { data: null, error: new Error('denied') };
  await expect(queueInviteSms('b1', '+15551234567', 'tok123')).rejects.toThrow('denied');
});
