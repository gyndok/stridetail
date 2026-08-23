import type { KV } from '../active';
import { clearPendingInvite, getPendingInvite, setPendingInvite } from '../pendingInvite';

function memoryKV(): KV {
  const m = new Map<string, string>();
  return {
    getItem: async (k) => m.get(k) ?? null,
    setItem: async (k, v) => void m.set(k, v),
    removeItem: async (k) => void m.delete(k),
  };
}

test('pending invite persists until cleared', async () => {
  const kv = memoryKV();
  expect(await getPendingInvite(kv)).toBeNull();
  await setPendingInvite('tok', kv);
  expect(await getPendingInvite(kv)).toBe('tok');
  await clearPendingInvite(kv);
  expect(await getPendingInvite(kv)).toBeNull();
});
