import { updatePayoutPercent } from '../api';

type Step = [string, unknown[]];
const mockLog: { table: string; steps: Step[] }[] = [];
let mockResult: { data: unknown; error: unknown } = { data: null, error: null };

jest.mock('@/src/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      const entry = { table, steps: [] as Step[] };
      mockLog.push(entry);
      const builder: Record<string, unknown> = {};
      for (const m of ['update', 'eq']) {
        builder[m] = (...args: unknown[]) => {
          entry.steps.push([m, args]);
          return builder;
        };
      }
      builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve(resolve(mockResult));
      return builder;
    },
    rpc: jest.fn(),
  },
}));

beforeEach(() => {
  mockLog.length = 0;
  mockResult = { data: null, error: null };
});

test('updates payout_percent on the membership row', async () => {
  await updatePayoutPercent('m-1', 75);
  expect(mockLog[0]!.table).toBe('memberships');
  expect(mockLog[0]!.steps).toEqual([
    ['update', [{ payout_percent: 75 }]],
    ['eq', ['id', 'm-1']],
  ]);
});

test('rejects out-of-range and non-numeric percents before any query', async () => {
  await expect(updatePayoutPercent('m-1', -1)).rejects.toThrow('between 0 and 100');
  await expect(updatePayoutPercent('m-1', 101)).rejects.toThrow('between 0 and 100');
  await expect(updatePayoutPercent('m-1', Number.NaN)).rejects.toThrow('between 0 and 100');
  expect(mockLog).toHaveLength(0);
});

test('throws on error', async () => {
  mockResult = { data: null, error: new Error('denied') };
  await expect(updatePayoutPercent('m-1', 50)).rejects.toThrow('denied');
});
