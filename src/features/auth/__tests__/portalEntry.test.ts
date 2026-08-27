import type { KV } from '@/src/features/business/active';

import { clearPortalEntry, getPortalEntry, setPortalEntry } from '../portalEntry';

function memoryKV(): KV {
  const m = new Map<string, string>();
  return {
    getItem: async (k) => m.get(k) ?? null,
    setItem: async (k, v) => void m.set(k, v),
    removeItem: async (k) => void m.delete(k),
  };
}

test('portal door flag persists until cleared', async () => {
  const kv = memoryKV();
  expect(await getPortalEntry(kv)).toBe(false);
  await setPortalEntry(kv);
  expect(await getPortalEntry(kv)).toBe(true);
  await clearPortalEntry(kv);
  expect(await getPortalEntry(kv)).toBe(false);
});
