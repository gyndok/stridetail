import { inviteClientToPortal, portalInviteState } from '../api';

const mockRpc: jest.Mock = jest.fn(async () => ({ data: null, error: null }));

jest.mock('@/src/lib/supabase', () => ({
  supabase: { rpc: (...args: unknown[]) => mockRpc(...(args as [])) },
}));

beforeEach(() => {
  mockRpc.mockClear();
  mockRpc.mockResolvedValue({ data: null, error: null });
});

describe('portalInviteState', () => {
  test('no email -> needs-email (blank counts as none)', () => {
    expect(portalInviteState({ email: null, portal_invited_at: null })).toBe('needs-email');
    expect(portalInviteState({ email: '  ', portal_invited_at: null })).toBe('needs-email');
  });

  test('email but never invited -> invitable', () => {
    expect(portalInviteState({ email: 'a@b.com', portal_invited_at: null })).toBe('invitable');
  });

  test('email and stamped -> invited (re-invite offered)', () => {
    expect(
      portalInviteState({ email: 'a@b.com', portal_invited_at: '2026-08-26T12:00:00Z' }),
    ).toBe('invited');
  });
});

describe('inviteClientToPortal', () => {
  test('calls the owner-only RPC with the client id', async () => {
    await inviteClientToPortal('c1');
    expect(mockRpc).toHaveBeenCalledWith('invite_client_to_portal', { p_client: 'c1' });
  });

  test('surfaces the RPC error (e.g. missing email)', async () => {
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: new Error('client has no email on file — add one before inviting'),
    });
    await expect(inviteClientToPortal('c1')).rejects.toThrow('no email on file');
  });
});
