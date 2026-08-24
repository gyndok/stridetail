import * as SecureStore from 'expo-secure-store';

import type { ClientAccessCodes } from '@/src/features/clients/access';

/**
 * Grace-window reveal cache (Plan 4 Task 3, spec §8). Codes are NEVER cached
 * in react-query or plain storage; the single exception is the last successful
 * reveal per client, kept in expo-secure-store for `businesses.access_grace_hours`
 * so a walker standing at the door with no signal can still get in. The loader
 * enforces expiry itself and deletes the entry the moment it is stale.
 */

export type RevealedCodes = {
  values: ClientAccessCodes;
  /** ISO instant of the successful reveal this copy came from. */
  revealedAt: string;
};

// SecureStore keys allow [A-Za-z0-9._-]; client ids are uuids, so this is valid.
const cacheKey = (clientId: string) => `revealed-codes.${clientId}`;

export async function saveRevealedCodes(
  clientId: string,
  values: ClientAccessCodes,
  now: () => Date = () => new Date(),
): Promise<void> {
  const entry: RevealedCodes = { values, revealedAt: now().toISOString() };
  await SecureStore.setItemAsync(cacheKey(clientId), JSON.stringify(entry));
}

/**
 * Returns the cached reveal when it is younger than `graceHours`, else null.
 * Expired or unreadable entries are deleted before returning null.
 */
export async function loadRevealedCodes(
  clientId: string,
  graceHours: number,
  now: () => Date = () => new Date(),
): Promise<RevealedCodes | null> {
  const raw = await SecureStore.getItemAsync(cacheKey(clientId));
  if (!raw) return null;
  let entry: RevealedCodes;
  try {
    entry = JSON.parse(raw) as RevealedCodes;
    if (typeof entry?.revealedAt !== 'string' || typeof entry?.values !== 'object' || !entry.values) {
      throw new Error('bad shape');
    }
  } catch {
    await SecureStore.deleteItemAsync(cacheKey(clientId));
    return null;
  }
  const revealed = Date.parse(entry.revealedAt);
  if (!Number.isFinite(revealed) || now().getTime() - revealed > graceHours * 3_600_000) {
    await SecureStore.deleteItemAsync(cacheKey(clientId));
    return null;
  }
  return entry;
}

export async function clearRevealedCodes(clientId: string): Promise<void> {
  await SecureStore.deleteItemAsync(cacheKey(clientId));
}
