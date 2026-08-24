import { supabase } from '@/src/lib/supabase';
import { pushTrackSegments, uploadVisitPhoto, type TrackPoint } from '@/src/features/visit/upload';

import { getDb } from './db';
import { SqliteOutbox, type OutboxItem, type OutboxKind, type OutboxStore } from './outbox';

/**
 * Ordered outbox sync worker (Plan 4 Task 3, spec §8).
 *
 * Visit mutations append to the SQLite outbox first (visit.start, visit.event,
 * visit.track, visit.finish — see src/features/visit/api.ts) and this worker
 * uploads them strictly in insertion order, one at a time:
 *   visit.start  → start_visit RPC
 *   visit.event  → photo upload first (when a local URI is attached), then a
 *                  direct visit_events upsert (ignoreDuplicates on client_uuid)
 *   visit.track  → ingest-track edge function (idempotent by client_uuid)
 *   visit.finish → finish_visit RPC
 *
 * Failure policy:
 *  - Retryable (network/no status, 5xx, 401/408/429): attempts++, stop the
 *    drain (order must hold), retry after an attempts-based backoff.
 *  - Permanent (other 4xx): park the item with state 'error' and continue —
 *    the Today badge surfaces parked items (Task 4/5 UI).
 *  - RPC "state conflict" errors whose message shows the target state was
 *    already reached (start → in_progress/completed, finish → completed) are
 *    treated as success: the mutation already happened on a previous attempt.
 */

// ===== payloads =====

export type VisitEventType =
  | 'arrived'
  | 'started'
  | 'pee'
  | 'poop'
  | 'ate'
  | 'drank'
  | 'meds'
  | 'note'
  | 'photo'
  | 'finished';

export type VisitStartPayload = { visitId: string };
export type VisitEventPayload = {
  visitId: string;
  businessId: string;
  /** Server-side idempotency key for the visit_events row (uuid). */
  clientUuid: string;
  type: VisitEventType;
  /** ISO instant the event happened (device clock). */
  occurredAt: string;
  petId?: string;
  text?: string;
  /** Local file uri of a photo to upload before inserting the event row. */
  photoLocalUri?: string;
};
/**
 * Plan-1 GPS controller shape, unchanged: { visitId, segmentNo, points }.
 * clientUuid is optional — items enqueued by rollSegmentWith carry none, and
 * the worker falls back to the outbox item id (already a uuid, stable across
 * re-drains) as the server-side idempotency key.
 */
export type VisitTrackPayload = {
  visitId: string;
  segmentNo: number;
  points: TrackPoint[];
  clientUuid?: string;
};
export type VisitFinishPayload = { visitId: string; privateNotes?: string };

// ===== errors and classification =====

/** Error with the HTTP status attached when the server produced one. */
export class SyncError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message);
    this.name = 'SyncError';
  }
}

/** Normalize supabase-js error shapes (postgrest/storage/functions) to SyncError. */
export function toSyncError(e: unknown, status?: number): SyncError {
  if (e instanceof SyncError) return e;
  const err = e as { message?: string; status?: number; context?: { status?: number } } | null;
  const s =
    status ??
    (typeof err?.status === 'number'
      ? err.status
      : typeof err?.context?.status === 'number'
        ? err.context.status
        : undefined);
  const message = typeof err?.message === 'string' ? err.message : String(e);
  // postgrest-js reports network failures as status 0 — no server verdict.
  return new SyncError(message, s === 0 ? undefined : s);
}

export type SyncErrorClass = 'retryable' | 'permanent' | 'already-done';

/** RPC state-conflict messages that mean the target state was already reached. */
const ALREADY_STARTED = /visit is not accepted \(status: (in_progress|completed)\)/;
const ALREADY_FINISHED = /visit is not in progress \(status: completed\)/;

export function classifySyncError(e: unknown, kind: OutboxKind): SyncErrorClass {
  const err = toSyncError(e);
  if (kind === 'visit.start' && ALREADY_STARTED.test(err.message)) return 'already-done';
  if (kind === 'visit.finish' && ALREADY_FINISHED.test(err.message)) return 'already-done';
  if (err.status === undefined) return 'retryable'; // network / unknown
  if (err.status === 401 || err.status === 408 || err.status === 429) return 'retryable';
  if (err.status >= 400 && err.status < 500) return 'permanent';
  return 'retryable'; // 5xx and anything else
}

/** Exponential-ish backoff: 2 s, 4 s, 8 s … capped at 5 min. */
export function backoffMs(attempts: number): number {
  return Math.min(5 * 60_000, 1000 * 2 ** Math.min(attempts, 10));
}

// ===== server API (injected for tests) =====

export type VisitEventRow = {
  business_id: string;
  visit_id: string;
  pet_id: string | null;
  type: VisitEventType;
  occurred_at: string;
  text: string | null;
  photo_path: string | null;
  client_uuid: string;
};

export type SyncApi = {
  startVisit(visitId: string): Promise<void>;
  finishVisit(visitId: string, privateNotes?: string): Promise<void>;
  insertEvent(row: VisitEventRow): Promise<void>;
  pushTrack(
    visitId: string,
    segments: { segmentNo: number; points: TrackPoint[]; clientUuid: string }[],
  ): Promise<void>;
  uploadPhoto(
    businessId: string,
    visitId: string,
    clientUuid: string,
    uri: string,
  ): Promise<string>;
};

export const defaultSyncApi: SyncApi = {
  async startVisit(visitId) {
    const { error, status } = await supabase.rpc('start_visit', { p_visit: visitId });
    if (error) throw toSyncError(error, status);
  },
  async finishVisit(visitId, privateNotes) {
    const { error, status } = await supabase.rpc('finish_visit', {
      p_visit: visitId,
      p_private_notes: privateNotes ?? null,
    });
    if (error) throw toSyncError(error, status);
  },
  async insertEvent(row) {
    const { error, status } = await supabase
      .from('visit_events')
      .upsert(row, { onConflict: 'client_uuid', ignoreDuplicates: true });
    if (error) throw toSyncError(error, status);
  },
  async pushTrack(visitId, segments) {
    try {
      await pushTrackSegments(visitId, segments);
    } catch (e) {
      throw toSyncError(e);
    }
  },
  async uploadPhoto(businessId, visitId, clientUuid, uri) {
    try {
      return await uploadVisitPhoto(businessId, visitId, clientUuid, uri);
    } catch (e) {
      throw toSyncError(e);
    }
  },
};

// ===== the drain =====

async function performItem(item: OutboxItem, api: SyncApi): Promise<void> {
  switch (item.kind) {
    case 'visit.start': {
      const p = item.payload as VisitStartPayload;
      await api.startVisit(p.visitId);
      return;
    }
    case 'visit.finish': {
      const p = item.payload as VisitFinishPayload;
      await api.finishVisit(p.visitId, p.privateNotes);
      return;
    }
    case 'visit.track': {
      const p = item.payload as VisitTrackPayload;
      await api.pushTrack(p.visitId, [
        { segmentNo: p.segmentNo, points: p.points, clientUuid: p.clientUuid ?? item.id },
      ]);
      return;
    }
    case 'visit.event': {
      const p = item.payload as VisitEventPayload;
      let photoPath: string | null = null;
      if (p.photoLocalUri) {
        // Photo first; the upload is upsert:true so a retry re-uploads safely.
        photoPath = await api.uploadPhoto(p.businessId, p.visitId, p.clientUuid, p.photoLocalUri);
      }
      await api.insertEvent({
        business_id: p.businessId,
        visit_id: p.visitId,
        pet_id: p.petId ?? null,
        type: p.type,
        occurred_at: p.occurredAt,
        text: p.text ?? null,
        photo_path: photoPath,
        client_uuid: p.clientUuid,
      });
      return;
    }
  }
}

export type DrainDeps = {
  outbox: OutboxStore;
  api: SyncApi;
  /** When provided and false, the drain returns immediately. */
  isOnline?: () => boolean | Promise<boolean>;
  now?: () => number;
  /** item id → epoch ms before which it must not be retried (in-memory; resets on relaunch). */
  retrySchedule?: Map<string, number>;
};

export type DrainResult = {
  sent: number;
  errored: number;
  stopped: 'empty' | 'retryable' | 'backoff' | 'offline';
};

const defaultRetrySchedule = new Map<string, number>();

export async function drainOutbox(deps: DrainDeps): Promise<DrainResult> {
  const now = deps.now ?? Date.now;
  const schedule = deps.retrySchedule ?? defaultRetrySchedule;
  let sent = 0;
  let errored = 0;
  if (deps.isOnline && !(await deps.isOnline())) return { sent, errored, stopped: 'offline' };
  for (;;) {
    const batch = await deps.outbox.nextPending(25);
    if (!batch.length) return { sent, errored, stopped: 'empty' };
    for (const item of batch) {
      // Strict order: a head item still inside its backoff window blocks the drain.
      if ((schedule.get(item.id) ?? 0) > now()) return { sent, errored, stopped: 'backoff' };
      try {
        await performItem(item, deps.api);
        await deps.outbox.markSent(item.id);
        schedule.delete(item.id);
        sent += 1;
      } catch (e) {
        const kind = classifySyncError(e, item.kind);
        if (kind === 'already-done') {
          await deps.outbox.markSent(item.id);
          schedule.delete(item.id);
          sent += 1;
        } else if (kind === 'permanent') {
          await deps.outbox.markError(item.id);
          schedule.delete(item.id);
          errored += 1;
        } else {
          // Read attempts before markFailed: stores may return live references.
          const nextAttempts = item.attempts + 1;
          await deps.outbox.markFailed(item.id);
          schedule.set(item.id, now() + backoffMs(nextAttempts));
          return { sent, errored, stopped: 'retryable' };
        }
      }
    }
  }
}

// ===== trigger plumbing =====

/**
 * Debounced, non-reentrant kicker around a drain fn. Multiple kicks inside the
 * debounce window coalesce into one drain; a kick that lands while a drain is
 * running schedules exactly one follow-up drain.
 */
export function createKicker(drain: () => Promise<unknown>, delayMs = 300): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running = false;
  let queued = false;
  const run = async () => {
    if (running) {
      queued = true;
      return;
    }
    running = true;
    try {
      await drain();
    } catch {
      // drainOutbox never throws by design; belt and braces.
    } finally {
      running = false;
      if (queued) {
        queued = false;
        schedule();
      }
    }
  };
  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void run();
    }, delayMs);
  };
  return schedule;
}

/** Kick the real outbox drain (debounced). Wire to AppState/segment-roll/interval. */
export const kickSync: () => void = createKicker(() =>
  drainOutbox({ outbox: new SqliteOutbox(getDb()), api: defaultSyncApi }),
);

/** Read-only check of the Plan-1 active_visit table (drives the 30 s sync interval). */
export async function hasActiveVisit(): Promise<boolean> {
  const row = await getDb().getFirstAsync<{ visit_id: string }>(
    'SELECT visit_id FROM active_visit WHERE id = 1',
  );
  return row != null;
}
