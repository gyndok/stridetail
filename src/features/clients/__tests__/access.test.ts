import { hasClientAccess, revealAccessOwner, setClientAccess } from '../access';

const mockRpc = jest.fn();
jest.mock('@/src/lib/supabase', () => ({
  supabase: { rpc: (...args: unknown[]) => mockRpc(...args) },
}));
const rpc = mockRpc;

beforeEach(() => {
  rpc.mockReset();
});

test('hasClientAccess calls the rpc with the exact param name and returns the boolean', async () => {
  rpc.mockResolvedValue({ data: true, error: null });
  await expect(hasClientAccess('client-1')).resolves.toBe(true);
  expect(rpc).toHaveBeenCalledWith('has_client_access', { p_client: 'client-1' });

  rpc.mockResolvedValue({ data: false, error: null });
  await expect(hasClientAccess('client-1')).resolves.toBe(false);
});

test('hasClientAccess throws on rpc error', async () => {
  rpc.mockResolvedValue({ data: null, error: new Error('only the business owner can check access codes') });
  await expect(hasClientAccess('client-1')).rejects.toThrow('only the business owner');
});

test('revealAccessOwner returns the single revealed row', async () => {
  const row = {
    door_code: '1234',
    lockbox_code: null,
    gate_code: '9',
    alarm_code: null,
    key_location: 'under mat',
    notes: null,
  };
  rpc.mockResolvedValue({ data: [row], error: null });
  await expect(revealAccessOwner('client-1')).resolves.toEqual(row);
  expect(rpc).toHaveBeenCalledWith('reveal_access_owner', { p_client: 'client-1' });
});

test('revealAccessOwner returns null when the client has no codes on file', async () => {
  rpc.mockResolvedValue({ data: [], error: null });
  await expect(revealAccessOwner('client-1')).resolves.toBeNull();
});

test('setClientAccess sends every field under the migration param names, empty → null', async () => {
  rpc.mockResolvedValue({ data: null, error: null });
  await setClientAccess('client-1', {
    door: ' 1234 ',
    lockbox: '',
    gate: '55',
    alarm: '   ',
    keyLocation: 'under the mat',
    notes: '',
  });
  expect(rpc).toHaveBeenCalledWith('set_client_access', {
    p_client: 'client-1',
    p_door: '1234',
    p_lockbox: null,
    p_gate: '55',
    p_alarm: null,
    p_key_location: 'under the mat',
    p_notes: null,
  });
});

test('setClientAccess throws on rpc error', async () => {
  rpc.mockResolvedValue({ data: null, error: new Error('only the business owner can set access codes') });
  await expect(
    setClientAccess('client-1', { door: '', lockbox: '', gate: '', alarm: '', keyLocation: '', notes: '' }),
  ).rejects.toThrow('only the business owner');
});
