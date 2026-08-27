import type { QueryClient } from '@tanstack/react-query';

import { claimClientLinks } from '../api';
import { claimAndRefresh, shouldAttemptClaim } from '../claim';

const mockRpc: jest.Mock = jest.fn(async () => ({ data: { linked: 0, links: [] }, error: null }));

jest.mock('@/src/lib/supabase', () => ({
  supabase: { rpc: (...args: unknown[]) => mockRpc(...(args as [])) },
}));

beforeEach(() => {
  mockRpc.mockClear();
  mockRpc.mockResolvedValue({ data: { linked: 0, links: [] }, error: null });
});

describe('claimClientLinks', () => {
  test('calls the definer RPC and unwraps the result', async () => {
    mockRpc.mockResolvedValueOnce({
      data: { linked: 2, links: [{ client_id: 'c1', business_id: 'b1' }] },
      error: null,
    });
    const res = await claimClientLinks();
    expect(mockRpc).toHaveBeenCalledWith('claim_client_links');
    expect(res).toEqual({ linked: 2, links: [{ client_id: 'c1', business_id: 'b1' }] });
  });

  test('degrades a null payload to zero links', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: null });
    expect(await claimClientLinks()).toEqual({ linked: 0, links: [] });
  });

  test('throws on an RPC error', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: new Error('not signed in') });
    await expect(claimClientLinks()).rejects.toThrow('not signed in');
  });
});

describe('claimAndRefresh', () => {
  const qc = () => ({ invalidateQueries: jest.fn(async () => {}) }) as unknown as QueryClient;

  test('invalidates the client-links query when links were created', async () => {
    mockRpc.mockResolvedValueOnce({ data: { linked: 1, links: [] }, error: null });
    const client = qc();
    expect(await claimAndRefresh(client)).toBe(1);
    expect(client.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['client-links'] });
  });

  test('leaves the query alone when nothing linked (no-account message stays)', async () => {
    const client = qc();
    expect(await claimAndRefresh(client)).toBe(0);
    expect(client.invalidateQueries).not.toHaveBeenCalled();
  });
});

describe('shouldAttemptClaim (the claim-on-empty hook guard)', () => {
  test('attempts exactly when loaded, empty, and not yet attempted', () => {
    expect(shouldAttemptClaim(true, 0, false)).toBe(true);
    expect(shouldAttemptClaim(false, 0, false)).toBe(false); // still loading
    expect(shouldAttemptClaim(true, 2, false)).toBe(false); // already linked
    expect(shouldAttemptClaim(true, 0, true)).toBe(false); // once per mount
  });
});
