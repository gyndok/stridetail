import { hydrateActiveBusiness, useActiveBusinessStore } from '../active';

test('active business persists through the injected storage', async () => {
  const mem = new Map<string, string>();
  const storage = {
    getItem: async (k: string) => mem.get(k) ?? null,
    setItem: async (k: string, v: string) => {
      mem.set(k, v);
    },
    removeItem: async (k: string) => {
      mem.delete(k);
    },
  };
  await hydrateActiveBusiness(storage);
  expect(useActiveBusinessStore.getState().businessId).toBeNull();
  expect(useActiveBusinessStore.getState().hydrated).toBe(true);
  await useActiveBusinessStore.getState().setBusinessId('b1', storage);
  expect(mem.get('activeBusinessId')).toBe('b1');
  useActiveBusinessStore.setState({ businessId: null, hydrated: false });
  await hydrateActiveBusiness(storage);
  expect(useActiveBusinessStore.getState().businessId).toBe('b1');
});

test('clearing the active business removes the persisted key', async () => {
  const mem = new Map<string, string>([['activeBusinessId', 'b1']]);
  const storage = {
    getItem: async (k: string) => mem.get(k) ?? null,
    setItem: async (k: string, v: string) => {
      mem.set(k, v);
    },
    removeItem: async (k: string) => {
      mem.delete(k);
    },
  };
  await hydrateActiveBusiness(storage);
  expect(useActiveBusinessStore.getState().businessId).toBe('b1');
  await useActiveBusinessStore.getState().setBusinessId(null, storage);
  expect(mem.has('activeBusinessId')).toBe(false);
  expect(useActiveBusinessStore.getState().businessId).toBeNull();
});
