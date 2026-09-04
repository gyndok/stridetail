import * as Updates from 'expo-updates';
import { Platform } from 'react-native';

/**
 * Self-serve OTA updates (2026-09-04, sponsor's "is it there yet?" while
 * debugging a stuck update): Settings shows WHICH bundle is running and a
 * check-now button that downloads and applies in one tap — no more
 * force-quit-twice folklore. Pure helpers here; the card wires them to UI.
 */

export type UpdateInfo = {
  /** 'embedded' when running the bundle compiled into the binary. */
  kind: 'embedded' | 'downloaded' | 'unavailable';
  /** Short id fragment for support conversations ("update 01a06e6c"). */
  shortId: string | null;
  /** When the running update was PUBLISHED (not installed); null for embedded. */
  publishedAt: Date | null;
  runtimeVersion: string | null;
};

export function currentUpdateInfo(): UpdateInfo {
  if (Platform.OS === 'web' || !Updates.isEnabled) {
    return { kind: 'unavailable', shortId: null, publishedAt: null, runtimeVersion: null };
  }
  if (Updates.isEmbeddedLaunch) {
    return {
      kind: 'embedded',
      shortId: null,
      publishedAt: null,
      runtimeVersion: Updates.runtimeVersion ?? null,
    };
  }
  return {
    kind: 'downloaded',
    shortId: Updates.updateId ? Updates.updateId.slice(0, 8) : null,
    publishedAt: Updates.createdAt ?? null,
    runtimeVersion: Updates.runtimeVersion ?? null,
  };
}

/** "Built-in bundle (app 0.2.2)" / "Update 01a06e6c · Sep 4, 5:12 PM". */
export function updateLine(info: UpdateInfo, appVersion: string | null): string {
  if (info.kind === 'unavailable') return appVersion ? `App ${appVersion}` : 'App';
  if (info.kind === 'embedded') {
    return `Built-in bundle${info.runtimeVersion ? ` (app ${info.runtimeVersion})` : ''}`;
  }
  const when = info.publishedAt
    ? new Date(info.publishedAt).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : null;
  return ['Update', info.shortId, when ? `· ${when}` : null].filter(Boolean).join(' ');
}

export type CheckOutcome =
  | { status: 'up-to-date' }
  | { status: 'ready-to-restart' }
  | { status: 'unavailable' }
  | { status: 'error'; message: string };

/** Check + download in one step; caller offers the restart. */
export async function checkAndFetchUpdate(): Promise<CheckOutcome> {
  if (Platform.OS === 'web' || !Updates.isEnabled) return { status: 'unavailable' };
  try {
    const check = await Updates.checkForUpdateAsync();
    if (!check.isAvailable) return { status: 'up-to-date' };
    await Updates.fetchUpdateAsync();
    return { status: 'ready-to-restart' };
  } catch (e) {
    return {
      status: 'error',
      message: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function applyUpdate(): Promise<void> {
  await Updates.reloadAsync();
}
