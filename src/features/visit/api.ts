import * as Crypto from 'expo-crypto';

import { supabase } from '@/src/lib/supabase';
import { getDb } from '@/src/lib/offline/db';
import { SqliteOutbox, type OutboxItem, type OutboxStore } from '@/src/lib/offline/outbox';
import {
  kickSync,
  type VisitEventPayload,
  type VisitEventType,
  type VisitFinishPayload,
  type VisitStartPayload,
} from '@/src/lib/offline/sync';

/**
 * Outbox-first visit mutations (Plan 4 Task 3, spec §8): every field-side
 * mutation lands in the local outbox first and the sync worker uploads it in
 * order. Callers update local UI optimistically; the server catches up.
 */

export type VisitOutboxDeps = { outbox?: OutboxStore; kick?: () => void };

const resolve = (deps: VisitOutboxDeps) => ({
  outbox: deps.outbox ?? new SqliteOutbox(getDb()),
  kick: deps.kick ?? kickSync,
});

export async function appendVisitStart(
  visitId: string,
  deps: VisitOutboxDeps = {},
): Promise<OutboxItem> {
  const { outbox, kick } = resolve(deps);
  const payload: VisitStartPayload = { visitId };
  const item = await outbox.enqueue('visit.start', payload);
  kick();
  return item;
}

export type VisitEventInput = {
  visitId: string;
  businessId: string;
  type: VisitEventType;
  petId?: string;
  text?: string;
  photoLocalUri?: string;
  /** ISO instant; defaults to now. */
  occurredAt?: string;
};

export async function appendVisitEvent(
  input: VisitEventInput,
  deps: VisitOutboxDeps = {},
): Promise<VisitEventPayload> {
  const { outbox, kick } = resolve(deps);
  const payload: VisitEventPayload = {
    visitId: input.visitId,
    businessId: input.businessId,
    clientUuid: Crypto.randomUUID(),
    type: input.type,
    occurredAt: input.occurredAt ?? new Date().toISOString(),
    ...(input.petId !== undefined && { petId: input.petId }),
    ...(input.text !== undefined && { text: input.text }),
    ...(input.photoLocalUri !== undefined && { photoLocalUri: input.photoLocalUri }),
  };
  await outbox.enqueue('visit.event', payload);
  kick();
  return payload;
}

/**
 * Delete a mis-logged event (wish list #2). Outbox first: a still-pending item
 * is simply dequeued (the server never saw it). Otherwise delete the server
 * row by client_uuid under the walker's delete policy (own running visit,
 * non-structural types). Zero rows deleted with nothing in the outbox means
 * the item is mid-flight or the visit already finished — surface it honestly.
 * A deleted photo event leaves its stored object orphaned on purpose: the
 * report reads events rows, never the bucket, and storage delete rights don't
 * extend to walkers.
 */
export async function deleteVisitEvent(
  args: { clientUuid: string; visitId: string },
  deps: VisitOutboxDeps = {},
): Promise<'local' | 'server'> {
  const { outbox } = resolve(deps);
  if (await outbox.removePendingEvent(args.clientUuid)) return 'local';
  const { data, error } = await supabase
    .from('visit_events')
    .delete()
    .eq('client_uuid', args.clientUuid)
    .eq('visit_id', args.visitId)
    .select('id');
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error('Could not remove it yet — still syncing. Try again in a moment.');
  }
  return 'server';
}

export async function appendVisitFinish(
  visitId: string,
  privateNotes?: string,
  deps: VisitOutboxDeps = {},
): Promise<OutboxItem> {
  const { outbox, kick } = resolve(deps);
  const payload: VisitFinishPayload = {
    visitId,
    ...(privateNotes !== undefined && { privateNotes }),
  };
  const item = await outbox.enqueue('visit.finish', payload);
  kick();
  return item;
}
