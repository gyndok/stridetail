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

test('failed items retry until ten attempts then stop', async () => {
  const box = new MemoryOutbox(() => 1);
  const a = await box.enqueue('visit.finish', {});
  for (let i = 0; i < 9; i++) await box.markFailed(a.id);
  expect(await box.countPending()).toBe(1);
  await box.markFailed(a.id);
  expect(await box.countPending()).toBe(0);
  expect((await box.nextPending()).length).toBe(0);
});

test('enqueue accepts a caller-supplied id for idempotency', async () => {
  const box = new MemoryOutbox(() => 1);
  const a = await box.enqueue('visit.event', {}, 'fixed-id');
  expect(a.id).toBe('fixed-id');
});
