import Storage from 'expo-sqlite/kv-store';

import type { KV } from './active';

const KEY = 'pendingInvite';

const defaultKV: KV = {
  getItem: (k) => Storage.getItem(k),
  setItem: (k, v) => Storage.setItem(k, v),
  removeItem: (k) => Storage.removeItem(k),
};

/** Remembers an invite token across the sign-up detour so the user lands back on the invite. */
export const getPendingInvite = (kv: KV = defaultKV) => kv.getItem(KEY);
export const setPendingInvite = (token: string, kv: KV = defaultKV) => kv.setItem(KEY, token);
export const clearPendingInvite = (kv: KV = defaultKV) => kv.removeItem(KEY);
