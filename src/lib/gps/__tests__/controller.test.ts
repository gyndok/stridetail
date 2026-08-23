import { MemoryOutbox } from '../../offline/outbox';
import { MemoryPointStore, rollSegmentWith } from '../controller';

test('rollSegment moves unrolled points into one track item and marks them rolled', async () => {
  const points = new MemoryPointStore();
  const outbox = new MemoryOutbox(() => 1);
  await points.append('v1', { t: 1, lat: 30, lng: -95, acc: 5 });
  await points.append('v1', { t: 2, lat: 30.001, lng: -95, acc: 5 });
  const n = await rollSegmentWith('v1', points, outbox);
  expect(n).toBe(2);
  const items = await outbox.nextPending();
  expect(items).toHaveLength(1);
  expect(items[0]!.kind).toBe('visit.track');
  expect((items[0]!.payload as { points: unknown[] }).points).toHaveLength(2);
  expect(await rollSegmentWith('v1', points, outbox)).toBe(0);
});
