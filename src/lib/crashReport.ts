import { Platform } from 'react-native';

import { getDb } from '@/src/lib/offline/db';

/**
 * Tier-1 crash telemetry (2026-09-05 — Alexandra's build-8 startup crash
 * arrived as an expo-updates ErrorRecovery abort with NO JS error attached,
 * leaving us guessing). No SDK, no native module, OTA-safe on every deployed
 * binary: hook RN's global fatal handler, persist the error to SQLite FIRST
 * (a boot crash may never get a network tick), then best-effort POST to
 * Sentry's envelope API with plain fetch; stored reports flush on the next
 * healthy launch. Tier 2 (@sentry/react-native with native crash handling)
 * rides the next binary — see BETA-NOTES.
 *
 * Native only: web has devtools and its errors don't kill the app; the
 * testers' phones are the blind spot.
 */

const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN ?? '';

/** https://<key>@<host>/<projectId> -> the envelope ingest URL (query auth). */
export function envelopeUrlFromDsn(dsn: string): string | null {
  const m = /^https:\/\/([^@]+)@([^/]+)\/(\d+)$/.exec(dsn.trim());
  if (!m) return null;
  const [, key, host, project] = m;
  return `https://${host}/api/${project}/envelope/?sentry_key=${key}&sentry_version=7`;
}

export type CrashContext = {
  release: string;
  dist: string;
  updateId: string | null;
  isEmbeddedLaunch: boolean;
};

/** 32 lowercase hex chars without dashes — Sentry's event_id shape. */
function eventId(): string {
  let out = '';
  for (let i = 0; i < 32; i++) out += Math.floor(Math.random() * 16).toString(16);
  return out;
}

/**
 * A Sentry envelope: header line, item header line, event line. The stack
 * rides as a raw string (no frame parsing client-side — the message and the
 * hermes stack are what we need to stop guessing).
 */
export function buildEnvelope(
  error: { name?: string; message?: string; stack?: string },
  fatal: boolean,
  ctx: CrashContext,
): string {
  const id = eventId();
  const event = {
    event_id: id,
    timestamp: Date.now() / 1000,
    platform: 'javascript',
    level: fatal ? 'fatal' : 'error',
    release: ctx.release,
    dist: ctx.dist,
    tags: {
      update_id: ctx.updateId ?? 'embedded',
      embedded_launch: String(ctx.isEmbeddedLaunch),
      os: Platform.OS,
    },
    exception: {
      values: [
        {
          type: error.name || 'Error',
          value: error.message || String(error),
        },
      ],
    },
    extra: { stack: error.stack ?? null },
  };
  const eventJson = JSON.stringify(event);
  return (
    JSON.stringify({ event_id: id, sent_at: new Date().toISOString() }) +
    '\n' +
    JSON.stringify({ type: 'event', length: eventJson.length }) +
    '\n' +
    eventJson
  );
}

async function post(url: string, envelope: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/x-sentry-envelope' },
      body: envelope,
    });
    return res.ok;
  } catch {
    return false;
  }
}

function runtimeContext(): CrashContext {
  // Lazy require: expo-updates and expo-application exist in every deployed
  // binary, but keep the reporter unable to crash the app it watches.
  try {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const Updates = require('expo-updates') as typeof import('expo-updates');
    const Application = require('expo-application') as {
      nativeApplicationVersion: string | null;
      nativeBuildVersion: string | null;
    };
    /* eslint-enable @typescript-eslint/no-require-imports */
    return {
      release: `stridetail@${Application.nativeApplicationVersion ?? '0.0.0'}`,
      dist: Application.nativeBuildVersion ?? '0',
      updateId: Updates.updateId ?? null,
      isEmbeddedLaunch: Updates.isEmbeddedLaunch,
    };
  } catch {
    return { release: 'stridetail@unknown', dist: '0', updateId: null, isEmbeddedLaunch: true };
  }
}

function storeReport(envelope: string): void {
  try {
    getDb().runSync(
      'INSERT INTO crash_reports (id, created_at, payload) VALUES ($id, $t, $p)',
      { $id: eventId(), $t: Date.now(), $p: envelope },
    );
  } catch {
    // Storage is best-effort; never let the reporter add a second failure.
  }
}

/** Send everything stored by earlier (possibly fatal) launches, then clear. */
export async function flushCrashReports(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    // Reports nobody collected within two weeks are stale — prune even while
    // no DSN is configured, so the table can never grow without bound.
    await getDb().runAsync('DELETE FROM crash_reports WHERE created_at < $t', {
      $t: Date.now() - 14 * 86_400_000,
    });
  } catch {
    // Best-effort.
  }
  const url = envelopeUrlFromDsn(DSN);
  if (!url) return;
  try {
    const db = getDb();
    const rows = await db.getAllAsync<{ id: string; payload: string }>(
      'SELECT id, payload FROM crash_reports ORDER BY created_at LIMIT 20',
    );
    for (const row of rows) {
      if (await post(url, row.payload)) {
        await db.runAsync('DELETE FROM crash_reports WHERE id = $id', { $id: row.id });
      }
    }
  } catch {
    // Next launch retries.
  }
}

type GlobalHandler = (error: unknown, isFatal?: boolean) => void;
type ErrorUtilsShape = {
  getGlobalHandler?: () => GlobalHandler;
  setGlobalHandler?: (h: GlobalHandler) => void;
};

let installed = false;

/**
 * Wrap RN's global fatal handler: persist + fire-and-forget send, then hand
 * the error to the original handler (dev redbox / prod crash) untouched.
 */
export function installCrashReporter(): void {
  if (installed || Platform.OS === 'web') return;
  const utils = (globalThis as { ErrorUtils?: ErrorUtilsShape }).ErrorUtils;
  if (!utils?.getGlobalHandler || !utils.setGlobalHandler) return;
  installed = true;
  const previous = utils.getGlobalHandler();
  const ctx = runtimeContext();
  utils.setGlobalHandler((error, isFatal) => {
    try {
      const e = (error ?? {}) as { name?: string; message?: string; stack?: string };
      const envelope = buildEnvelope(e, isFatal !== false, ctx);
      storeReport(envelope);
      const url = envelopeUrlFromDsn(DSN);
      // Also try to get it out right now — the process may have a tick left.
      if (url) void post(url, envelope);
    } catch {
      // Never shadow the real error with a reporter error.
    }
    previous(error, isFatal);
  });
}
