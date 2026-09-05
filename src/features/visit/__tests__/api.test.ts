import { MemoryOutbox } from '@/src/lib/offline/outbox';
import { supabase } from '@/src/lib/supabase';

import { appendVisitEvent, appendVisitFinish, appendVisitStart, deleteVisitEvent } from '../api';

jest.mock('@/src/lib/supabase', () => ({ supabase: {} }));

function setup() {
  let t = 1000;
  const outbox = new MemoryOutbox(() => t++);
  const kick = jest.fn();
  return { outbox, kick, deps: { outbox, kick } };
}

test('appendVisitStart enqueues visit.start with the device instant and kicks the sync worker', async () => {
  const { outbox, kick, deps } = setup();
  await appendVisitStart('v1', deps);
  const [item] = await outbox.nextPending();
  expect(item!.kind).toBe('visit.start');
  const payload = item!.payload as { visitId: string; startedAt: string };
  expect(payload.visitId).toBe('v1');
  // Review fix #4: the real tap instant rides the payload for delayed uploads.
  expect(Number.isFinite(Date.parse(payload.startedAt))).toBe(true);
  expect(kick).toHaveBeenCalledTimes(1);
});

test('appendVisitEvent stamps a fresh clientUuid and an ISO occurredAt', async () => {
  const { outbox, kick, deps } = setup();
  const payload = await appendVisitEvent(
    { visitId: 'v1', businessId: 'b1', type: 'poop', petId: 'p1', text: 'twice' },
    deps,
  );
  expect(payload.clientUuid).toBeTruthy();
  expect(Number.isFinite(Date.parse(payload.occurredAt))).toBe(true);
  const [item] = await outbox.nextPending();
  expect(item!.kind).toBe('visit.event');
  expect(item!.payload).toEqual({
    visitId: 'v1',
    businessId: 'b1',
    clientUuid: payload.clientUuid,
    type: 'poop',
    occurredAt: payload.occurredAt,
    petId: 'p1',
    text: 'twice',
  });
  expect(kick).toHaveBeenCalledTimes(1);
});

test('two events get distinct clientUuids; optional fields are omitted when absent', async () => {
  const { outbox, deps } = setup();
  const a = await appendVisitEvent({ visitId: 'v1', businessId: 'b1', type: 'pee' }, deps);
  const b = await appendVisitEvent(
    { visitId: 'v1', businessId: 'b1', type: 'photo', photoLocalUri: 'file:///p.jpg' },
    deps,
  );
  expect(a.clientUuid).not.toBe(b.clientUuid);
  const items = await outbox.nextPending();
  expect(Object.keys(items[0]!.payload as object).sort()).toEqual([
    'businessId',
    'clientUuid',
    'occurredAt',
    'type',
    'visitId',
  ]);
  expect((items[1]!.payload as { photoLocalUri: string }).photoLocalUri).toBe('file:///p.jpg');
});

test('appendVisitFinish stamps the finish instant and carries notes only when given', async () => {
  const { outbox, kick, deps } = setup();
  await appendVisitFinish('v1', 'left the key under the mat', deps);
  await appendVisitFinish('v2', undefined, deps);
  const items = await outbox.nextPending();
  expect(items[0]!.kind).toBe('visit.finish');
  const first = items[0]!.payload as { visitId: string; privateNotes: string; finishedAt: string };
  expect(first.visitId).toBe('v1');
  expect(first.privateNotes).toBe('left the key under the mat');
  expect(Number.isFinite(Date.parse(first.finishedAt))).toBe(true);
  expect(items[1]!.payload as object).not.toHaveProperty('privateNotes');
  expect(kick).toHaveBeenCalledTimes(2);
});

test('mutations preserve insertion order in the outbox', async () => {
  const { outbox, deps } = setup();
  await appendVisitStart('v1', deps);
  await appendVisitEvent({ visitId: 'v1', businessId: 'b1', type: 'pee' }, deps);
  await appendVisitFinish('v1', undefined, deps);
  expect((await outbox.nextPending()).map((i) => i.kind)).toEqual([
    'visit.start',
    'visit.event',
    'visit.finish',
  ]);
});

// ---- deleteVisitEvent (wish list #2) ----

function mockDeleteChain(result: { data: unknown; error: unknown }) {
  const calls: Record<string, unknown[][]> = { delete: [], eq: [], select: [] };
  const chain = {
    delete: (...a: unknown[]) => (calls.delete!.push(a), chain),
    eq: (...a: unknown[]) => (calls.eq!.push(a), chain),
    select: (...a: unknown[]) => (calls.select!.push(a), Promise.resolve(result)),
  };
  (supabase as unknown as { from: unknown }).from = jest.fn(() => chain);
  return calls;
}

test('deleteVisitEvent dequeues a still-pending event locally and queues a tombstone', async () => {
  const { outbox, deps } = setup();
  const payload = await appendVisitEvent({ visitId: 'v1', businessId: 'b1', type: 'pee' }, deps);
  (supabase as unknown as { from: unknown }).from = jest.fn(() => {
    throw new Error('server must not be called synchronously');
  });
  await expect(
    deleteVisitEvent({ clientUuid: payload.clientUuid, visitId: 'v1' }, deps),
  ).resolves.toBe('local');
  // Review fix #5: the pending insert is gone, replaced by a queued server-side
  // delete that drains AFTER any copy a running drain may still upload.
  const pending = await outbox.nextPending();
  expect(pending.map((i) => i.kind)).toEqual(['visit.event.delete']);
  expect(pending[0]!.payload).toEqual({ visitId: 'v1', clientUuid: payload.clientUuid });
});

test('deleteVisitEvent falls through to a server delete scoped by client_uuid and visit', async () => {
  const { deps } = setup();
  const calls = mockDeleteChain({ data: [{ id: 'e1' }], error: null });
  await expect(deleteVisitEvent({ clientUuid: 'cu-1', visitId: 'v1' }, deps)).resolves.toBe(
    'server',
  );
  expect(calls.eq).toEqual([
    ['client_uuid', 'cu-1'],
    ['visit_id', 'v1'],
  ]);
});

test('deleteVisitEvent surfaces a mid-flight item as a retryable error', async () => {
  const { deps } = setup();
  mockDeleteChain({ data: [], error: null });
  await expect(deleteVisitEvent({ clientUuid: 'cu-gone', visitId: 'v1' }, deps)).rejects.toThrow(
    /still syncing/i,
  );
});
