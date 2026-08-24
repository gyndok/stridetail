import * as Crypto from 'expo-crypto';

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
