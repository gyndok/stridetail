import Storage from 'expo-sqlite/kv-store';

import type { KV } from '@/src/features/business/active';

const KEY = 'portalEntry';

const defaultKV: KV = {
  getItem: (k) => Storage.getItem(k),
  setItem: (k, v) => Storage.setItem(k, v),
  removeItem: (k) => Storage.removeItem(k),
};

/**
 * Remembers which door the user last signed in through (Plan 8 Task 2).
 * Set when a pet parent requests an OTP code on /portal-login, cleared by the
 * staff password sign-in/sign-up paths. A signed-in user with neither
 * memberships nor client links routes to the portal's "no account found"
 * state when this flag is set (they are a client whose provider has not
 * invited them yet), and to business onboarding otherwise (they are a new
 * staff user). Persisted so a web reload keeps the decision.
 */
export const getPortalEntry = async (kv: KV = defaultKV) => (await kv.getItem(KEY)) != null;
export const setPortalEntry = (kv: KV = defaultKV) => kv.setItem(KEY, '1');
export const clearPortalEntry = (kv: KV = defaultKV) => kv.removeItem(KEY);
