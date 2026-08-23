import { LargeSecureStore } from '../secure-session-storage';

test('values round-trip and are not stored in plaintext', async () => {
  const secure = new Map<string, string>();
  const kv = new Map<string, string>();
  const store = new LargeSecureStore({
    secureGet: async (k) => secure.get(k) ?? null,
    secureSet: async (k, v) => {
      secure.set(k, v);
    },
    kvGet: async (k) => kv.get(k) ?? null,
    kvSet: async (k, v) => {
      kv.set(k, v);
    },
    kvRemove: async (k) => {
      kv.delete(k);
    },
    randomBytes: (n) => new Uint8Array(Array.from({ length: n }, (_, i) => (i * 7) % 256)),
  });
  await store.setItem('session', '{"access_token":"abc"}');
  expect(kv.get('session')).not.toContain('abc');
  expect(await store.getItem('session')).toBe('{"access_token":"abc"}');
  await store.removeItem('session');
  expect(await store.getItem('session')).toBeNull();
});
