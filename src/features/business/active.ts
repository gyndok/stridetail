import Storage from 'expo-sqlite/kv-store';
import { create } from 'zustand';

export type KV = {
  getItem(k: string): Promise<string | null>;
  setItem(k: string, v: string): Promise<void>;
  removeItem(k: string): Promise<void>;
};

const KEY = 'activeBusinessId';

const defaultKV: KV = {
  getItem: (k) => Storage.getItem(k),
  setItem: (k, v) => Storage.setItem(k, v),
  removeItem: (k) => Storage.removeItem(k),
};

type State = {
  businessId: string | null;
  hydrated: boolean;
  setBusinessId: (id: string | null, kv?: KV) => Promise<void>;
};

export const useActiveBusinessStore = create<State>((set) => ({
  businessId: null,
  hydrated: false,
  setBusinessId: async (id, kv = defaultKV) => {
    if (id) await kv.setItem(KEY, id);
    else await kv.removeItem(KEY);
    set({ businessId: id });
  },
}));

export async function hydrateActiveBusiness(kv: KV = defaultKV) {
  const id = await kv.getItem(KEY);
  useActiveBusinessStore.setState({ businessId: id, hydrated: true });
}

export const useActiveBusiness = () => useActiveBusinessStore();
