import { removeWalker } from '../api';

const mockRpc = jest.fn(
  async (): Promise<{ data: number | null; error: unknown }> => ({ data: 2, error: null }),
);

jest.mock('@/src/lib/supabase', () => ({
  supabase: { rpc: (...args: unknown[]) => mockRpc(...(args as [])) },
}));

beforeEach(() => mockRpc.mockClear());

test('removeWalker calls the RPC with the membership id and returns the unassigned count', async () => {
  await expect(removeWalker('m-1')).resolves.toBe(2);
  expect(mockRpc).toHaveBeenCalledWith('remove_walker', { p_membership: 'm-1' });
});

test('a null count (nothing unassigned) comes back as 0', async () => {
  mockRpc.mockResolvedValueOnce({ data: null, error: null });
  await expect(removeWalker('m-1')).resolves.toBe(0);
});

test('throws on RPC error', async () => {
  mockRpc.mockResolvedValueOnce({ data: null, error: new Error('only the business owner can remove team members') });
  await expect(removeWalker('m-1')).rejects.toThrow('only the business owner');
});
