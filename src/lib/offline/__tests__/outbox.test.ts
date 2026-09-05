import { MemoryOutbox } from '../outbox';

test('items come back oldest first and only while pending', async () => {
  const box = new MemoryOutbox(() => 1000);
  const a = await box.enqueue('visit.start', { visitId: 'v1' });
  box.now = () => 2000;
  const b = await box.enqueue('visit.event', { type: 'pee' });
  expect((await box.nextPending()).map((i) => i.id)).toEqual([a.id, b.id]);
  await box.markSent(a.id);
  expect((await box.nextPending()).map((i) => i.id)).toEqual([b.id]);
  expect(await box.countPending()).toBe(1);
});

test('retryable failures count attempts but never remove an item from the queue', async () => {
  // Review fix #2: the old ten-attempt terminal state silently stranded
  // offline walks (not pending, not counted as an error, never retried).
  const box = new MemoryOutbox(() => 1);
  const a = await box.enqueue('visit.finish', {});
  for (let i = 0; i < 25; i++) await box.markFailed(a.id);
  expect(await box.countPending()).toBe(1);
  const [item] = await box.nextPending();
  expect(item!.attempts).toBe(25);
  expect(item!.state).toBe('pending');
});

test('markError parks an item outside the pending queue and counts it', async () => {
  const box = new MemoryOutbox(() => 1);
  const a = await box.enqueue('visit.event', {});
  const b = await box.enqueue('visit.event', {}, 'zz-later');
  await box.markError(a.id);
  expect((await box.nextPending()).map((i) => i.id)).toEqual([b.id]);
  expect(await box.countPending()).toBe(1);
  expect(await box.countErrors()).toBe(1);
});

test('countPending with a visit id counts only that visit (sync badge)', async () => {
  const box = new MemoryOutbox(() => 1);
  await box.enqueue('visit.event', { visitId: 'v1', type: 'pee' });
  await box.enqueue('visit.track', { visitId: 'v1', segmentNo: 1, points: [] });
  await box.enqueue('visit.event', { visitId: 'v2', type: 'poop' });
  const done = await box.enqueue('visit.finish', { visitId: 'v1' });
  await box.markSent(done.id);
  expect(await box.countPending('v1')).toBe(2);
  expect(await box.countPending('v2')).toBe(1);
  expect(await box.countPending('v3')).toBe(0);
  expect(await box.countPending()).toBe(3);
});

test('enqueue accepts a caller-supplied id for idempotency', async () => {
  const box = new MemoryOutbox(() => 1);
  const a = await box.enqueue('visit.event', {}, 'fixed-id');
  expect(a.id).toBe('fixed-id');
});

test('removePendingEvent dequeues a pending visit.event by clientUuid, once', async () => {
  const box = new MemoryOutbox(() => 1);
  await box.enqueue('visit.event', { visitId: 'v1', clientUuid: 'uuid-a', type: 'pee' });
  await box.enqueue('visit.event', { visitId: 'v1', clientUuid: 'uuid-b', type: 'poop' });
  expect(await box.removePendingEvent('uuid-a')).toBe(true);
  expect(await box.removePendingEvent('uuid-a')).toBe(false); // already gone
  expect(await box.countPending('v1')).toBe(1);
});

test('removePendingEvent refuses items past pending and non-event kinds', async () => {
  const box = new MemoryOutbox(() => 1);
  const sent = await box.enqueue('visit.event', { visitId: 'v1', clientUuid: 'uuid-sent' });
  await box.markSent(sent.id);
  await box.enqueue('visit.track', { visitId: 'v1', clientUuid: 'uuid-track' });
  expect(await box.removePendingEvent('uuid-sent')).toBe(false);
  expect(await box.removePendingEvent('uuid-track')).toBe(false);
});
