import Storage from 'expo-sqlite/kv-store';

import { supabase } from '@/src/lib/supabase';

import { requestPortalOtp, signIn, verifyPortalOtp } from '../session';

jest.mock('@/src/lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithOtp: jest.fn(async () => ({ error: null })),
      verifyOtp: jest.fn(async () => ({ data: {}, error: null })),
      signInWithPassword: jest.fn(async () => ({ error: null })),
    },
    rpc: jest.fn(async () => ({ data: { linked: 0, links: [] }, error: null })),
  },
}));

const auth = supabase.auth as unknown as {
  signInWithOtp: jest.Mock;
  verifyOtp: jest.Mock;
  signInWithPassword: jest.Mock;
};
const rpc = (supabase as unknown as { rpc: jest.Mock }).rpc;

beforeEach(() => jest.clearAllMocks());

test('requestPortalOtp trims the email, allows sign-up, and marks the portal door', async () => {
  await requestPortalOtp('  pet.parent@example.com ');
  expect(auth.signInWithOtp).toHaveBeenCalledWith({
    email: 'pet.parent@example.com',
    options: { shouldCreateUser: true },
  });
  expect(Storage.setItem).toHaveBeenCalledWith('portalEntry', '1');
});

test('requestPortalOtp surfaces the error and does not mark the door', async () => {
  auth.signInWithOtp.mockResolvedValueOnce({ error: new Error('rate limited') });
  await expect(requestPortalOtp('a@b.com')).rejects.toThrow('rate limited');
  expect(Storage.setItem).not.toHaveBeenCalled();
});

test('verifyPortalOtp exchanges the typed code as an email otp, then claims links', async () => {
  await verifyPortalOtp('pet.parent@example.com', ' 123456 ');
  expect(auth.verifyOtp).toHaveBeenCalledWith({
    email: 'pet.parent@example.com',
    token: '123456',
    type: 'email',
  });
  // Task 3: every portal login runs the idempotent claim (new invites land).
  expect(rpc).toHaveBeenCalledWith('claim_client_links');
});

test('verifyPortalOtp never fails the login on a claim error (home retries)', async () => {
  rpc.mockResolvedValueOnce({ data: null, error: new Error('boom') });
  await expect(verifyPortalOtp('pet.parent@example.com', '123456')).resolves.toBeUndefined();
});

test('verifyPortalOtp does not claim when the code was wrong', async () => {
  auth.verifyOtp.mockResolvedValueOnce({ data: {}, error: new Error('invalid code') });
  await expect(verifyPortalOtp('pet.parent@example.com', '000000')).rejects.toThrow(
    'invalid code',
  );
  expect(rpc).not.toHaveBeenCalled();
});

test('staff password sign-in clears the portal door flag', async () => {
  await signIn('owner@example.com', 'hunter2');
  expect(Storage.removeItem).toHaveBeenCalledWith('portalEntry');
});
