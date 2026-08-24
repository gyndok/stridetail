import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { defaultShouldDehydrateQuery } from '@tanstack/react-query';
import type { PersistQueryClientProviderProps } from '@tanstack/react-query-persist-client';
import Storage from 'expo-sqlite/kv-store';
import { Platform } from 'react-native';

/**
 * TanStack Query cache persistence (Plan 4 Task 3, spec §8): the day's data
 * survives an offline relaunch via `expo-sqlite/kv-store`, but ONLY whitelisted
 * query-key prefixes are dehydrated — access codes and reveal results must
 * never touch disk (they are kept out of react-query entirely; the whitelist
 * is defense in depth).
 */

/** Query-key prefixes that may be persisted. Everything else stays memory-only. */
export const PERSIST_KEY_PREFIXES: readonly string[] = [
  'visits',
  'myVisits',
  'clients',
  'pets',
  'memberships',
  'services_public',
];

export function shouldPersistQuery(queryKey: readonly unknown[]): boolean {
  const head = queryKey[0];
  return typeof head === 'string' && PERSIST_KEY_PREFIXES.includes(head);
}

/** 48 h (spec §8): older persisted data is dropped on restore. */
export const PERSIST_MAX_AGE_MS = 48 * 60 * 60 * 1000;

type StringStorage = {
  getItem(key: string): Promise<string | null> | string | null;
  setItem(key: string, value: string): Promise<void> | void;
  removeItem(key: string): Promise<void> | void;
};

/**
 * Tiny async-storage adapter over expo-sqlite/kv-store (native). On web the
 * kv-store would need the sqlite wasm setup, and desktop owners are online by
 * design (spec §8 is field-side) — so web gets a memory map (no persistence).
 */
function memoryStorage(): StringStorage {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => {
      m.set(k, v);
    },
    removeItem: (k) => {
      m.delete(k);
    },
  };
}

const kvStorage: StringStorage = {
  getItem: (k) => Storage.getItem(k),
  setItem: (k, v) => Storage.setItem(k, v),
  removeItem: (k) => Storage.removeItem(k),
};

export const queryPersister = createAsyncStoragePersister({
  storage: Platform.OS === 'web' ? memoryStorage() : kvStorage,
  key: 'stridetail-query-cache',
  throttleTime: 1000,
});

export const persistOptions: PersistQueryClientProviderProps['persistOptions'] = {
  persister: queryPersister,
  maxAge: PERSIST_MAX_AGE_MS,
  dehydrateOptions: {
    shouldDehydrateQuery: (query) =>
      defaultShouldDehydrateQuery(query) && shouldPersistQuery(query.queryKey),
  },
};
