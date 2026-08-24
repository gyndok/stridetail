import Storage from 'expo-sqlite/kv-store';
import { create } from 'zustand';

import type { KV } from '@/src/features/business/active';
import type { FieldMode } from '@/src/ui/theme';

/**
 * Persisted walk-screen appearance (Round 0): the active-visit screen is WARM
 * by default — overriding spec §9's dark-by-default field mode — and a walker
 * who prefers the dark field palette flips it in Settings. Same persisted-store
 * shape as `src/features/business/active.ts` (zustand + expo-sqlite/kv-store,
 * injectable KV so the round-trip is unit-testable).
 */
export type WalkTheme = FieldMode;

const KEY = 'walkTheme';
const DEFAULT: WalkTheme = 'warm';

const defaultKV: KV = {
  getItem: (k) => Storage.getItem(k),
  setItem: (k, v) => Storage.setItem(k, v),
  removeItem: (k) => Storage.removeItem(k),
};

/** Anything that is not a known value (absent key, stale write) reads as warm. */
export function parseWalkTheme(raw: string | null): WalkTheme {
  return raw === 'dark' || raw === 'warm' ? raw : DEFAULT;
}

type State = {
  walkTheme: WalkTheme;
  hydrated: boolean;
  setWalkTheme: (mode: WalkTheme, kv?: KV) => Promise<void>;
};

export const useWalkThemeStore = create<State>((set) => ({
  walkTheme: DEFAULT,
  hydrated: false,
  setWalkTheme: async (mode, kv = defaultKV) => {
    await kv.setItem(KEY, mode);
    set({ walkTheme: mode });
  },
}));

export async function hydrateWalkTheme(kv: KV = defaultKV) {
  const raw = await kv.getItem(KEY);
  useWalkThemeStore.setState({ walkTheme: parseWalkTheme(raw), hydrated: true });
}

export const useWalkTheme = () => useWalkThemeStore();
