import { MemoryOutbox } from '@/src/lib/offline/outbox';

import { appendVisitEvent, appendVisitFinish, appendVisitStart } from '../api';

jest.mock('@/src/lib/supabase', () => ({ supabase: {} }));

function setup() {
  let t = 1000;
  const outbox = new MemoryOutbox(() => t++);
  const kick = jest.fn();
  return { outbox, kick, deps: { outbox, kick } };
}

test('appendVisitStart enqueues visit.start and kicks the sync worker', async () => {
  const { outbox, kick, deps } = setup();
  await appendVisitStart('v1', deps);
  const [item] = await outbox.nextPending();
  expect(item!.kind).toBe('visit.start');
  expect(item!.payload).toEqual({ visitId: 'v1' });
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

test('appendVisitFinish carries the private notes only when given', async () => {
  const { outbox, kick, deps } = setup();
  await appendVisitFinish('v1', 'left the key under the mat', deps);
  await appendVisitFinish('v2', undefined, deps);
  const items = await outbox.nextPending();
  expect(items[0]!.kind).toBe('visit.finish');
  expect(items[0]!.payload).toEqual({ visitId: 'v1', privateNotes: 'left the key under the mat' });
  expect(items[1]!.payload).toEqual({ visitId: 'v2' });
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
