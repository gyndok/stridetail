import { listMyClientLinks } from '../api';

type Step = [string, unknown[]];
const mockLog: { table: string; steps: Step[] }[] = [];
let mockResult: { data: unknown; error: unknown } = { data: [], error: null };
let mockSession: unknown = { user: { id: 'u1' } };

jest.mock('@/src/lib/supabase', () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: mockSession } }) },
    from: (table: string) => {
      const entry = { table, steps: [] as Step[] };
      mockLog.push(entry);
      const builder: Record<string, unknown> = {};
      for (const m of ['select', 'eq']) {
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
  mockSession = { user: { id: 'u1' } };
});

test('listMyClientLinks filters client_users to the caller', async () => {
  mockResult = { data: [{ id: 'cu1', business_id: 'b1', client_id: 'c1' }], error: null };
  const links = await listMyClientLinks();
  expect(links).toEqual([{ id: 'cu1', business_id: 'b1', client_id: 'c1' }]);
  expect(mockLog[0]?.table).toBe('client_users');
  expect(mockLog[0]?.steps).toEqual([
    ['select', ['id, business_id, client_id']],
    ['eq', ['user_id', 'u1']],
  ]);
});

test('listMyClientLinks returns [] when signed out without querying', async () => {
  mockSession = null;
  expect(await listMyClientLinks()).toEqual([]);
  expect(mockLog).toHaveLength(0);
});
