import Storage from 'expo-sqlite/kv-store';
import { create } from 'zustand';

import type { KV } from '@/src/features/business/active';

import type { ClientLink } from './api';

/**
 * Portal scope (Plan 8 Task 4): which client_users link the portal is showing.
 * Multi-business clients are rare — v1 scopes every tab to ONE selected link
 * (a plain switcher row on Home), persisted like activeBusinessId. Recorded in
 * DEVIATIONS.md.
 */

const KEY = 'portalLinkId';

const defaultKV: KV = {
  getItem: (k) => Storage.getItem(k),
  setItem: (k, v) => Storage.setItem(k, v),
  removeItem: (k) => Storage.removeItem(k),
};

type State = {
  linkId: string | null;
  hydrated: boolean;
  setLinkId: (id: string | null, kv?: KV) => Promise<void>;
};

export const usePortalScopeStore = create<State>((set) => ({
  linkId: null,
  hydrated: false,
  setLinkId: async (id, kv = defaultKV) => {
    if (id) await kv.setItem(KEY, id);
    else await kv.removeItem(KEY);
    set({ linkId: id });
  },
}));

export async function hydratePortalScope(kv: KV = defaultKV) {
  const id = await kv.getItem(KEY);
  usePortalScopeStore.setState({ linkId: id, hydrated: true });
}

/**
 * The link the portal renders: the selected one when it still exists, else the
 * first (stable order comes from the query), else null (unlinked user).
 */
export function resolvePortalLink(links: ClientLink[], selectedId: string | null): ClientLink | null {
  if (!links.length) return null;
  return links.find((l) => l.id === selectedId) ?? links[0] ?? null;
}
