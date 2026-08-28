import {
  estimateTravelMinutes,
  tightTransfer,
  type TravelVisit,
} from '../travel';

// ---- estimateTravelMinutes ----
//
// Heuristic (see travel.ts): straight-line metres x 1.4 road factor at an
// effective 30 km/h, plus a 5 min parking/leash-up constant; distances under
// 250 m count as "same place" (0 min); anything farther is at least 5 min.
// minutes = round(d * 1.4 / 30_000 * 60 + 5) = round(d * 0.0028 + 5).

test.each([
  [0, 0], // same doorstep
  [100, 0], // same block — under the 250 m same-place radius
  [249, 0], // just inside the radius
  [250, 6], // 250 * 0.0028 + 5 = 5.7 -> 6
  [1_000, 8], // 2.8 + 5 = 7.8 -> 8
  [2_500, 12], // 7 + 5 = 12
  [5_000, 19], // 14 + 5 = 19
  [10_000, 33], // 28 + 5 = 33
])('estimateTravelMinutes(%i m) = %i min', (meters, expected) => {
  expect(estimateTravelMinutes(meters)).toBe(expected);
});

test('estimateTravelMinutes never returns less than 5 min beyond the same-place radius', () => {
  for (const d of [251, 300, 500]) {
    expect(estimateTravelMinutes(d)).toBeGreaterThanOrEqual(5);
  }
});

// ---- tightTransfer ----

// Two Houston-ish homes ~5.5 km apart: drive estimate ~20-21 min.
const HOME_A = { lat: 29.75, lng: -95.36 };
const HOME_B = { lat: 29.80, lng: -95.36 }; // ~5.56 km due north
const NEARBY_A = { lat: 29.7501, lng: -95.36 }; // ~11 m from HOME_A

const slotClientA = { id: 'client-a', ...HOME_A };

const T = (iso: string) => new Date(iso);
// The slot under evaluation: 10:00–10:30Z.
const SLOT_START = T('2026-06-10T10:00:00Z');
const SLOT_END = T('2026-06-10T10:30:00Z');

const visit = (over: Partial<TravelVisit> & Pick<TravelVisit, 'id' | 'scheduled_start' | 'scheduled_end'>): TravelVisit => ({
  walker_id: 'w1',
  client_id: 'client-b',
  client: HOME_B,
  ...over,
});

test('tight from previous: gap smaller than the drive estimate', () => {
  // Previous visit ends 09:48Z -> 12 min gap; ~5.56 km drive ~ 21 min.
  const prev = visit({ id: 'p', scheduled_start: '2026-06-10T09:18:00Z', scheduled_end: '2026-06-10T09:48:00Z' });
  const res = tightTransfer('w1', SLOT_START, SLOT_END, slotClientA, [prev]);
  expect(res).toEqual({ direction: 'from_prev', driveMin: 21, gapMin: 12 });
});

test('tight to next: slot end -> next start gap smaller than the drive', () => {
  const next = visit({ id: 'n', scheduled_start: '2026-06-10T10:40:00Z', scheduled_end: '2026-06-10T11:10:00Z' });
  const res = tightTransfer('w1', SLOT_START, SLOT_END, slotClientA, [next]);
  expect(res).toEqual({ direction: 'to_next', driveMin: 21, gapMin: 10 });
});

test('not tight: the gap comfortably covers the drive', () => {
  const prev = visit({ id: 'p', scheduled_start: '2026-06-10T08:30:00Z', scheduled_end: '2026-06-10T09:00:00Z' }); // 60 min gap
  expect(tightTransfer('w1', SLOT_START, SLOT_END, slotClientA, [prev])).toBeNull();
});

test('nearest neighbour wins: only the closest preceding visit is measured', () => {
  // A far-earlier visit (huge gap) plus a back-to-back one (0 gap): the
  // back-to-back visit is the nearest preceding and drives the verdict.
  const early = visit({ id: 'e', scheduled_start: '2026-06-10T06:00:00Z', scheduled_end: '2026-06-10T06:30:00Z' });
  const nearest = visit({ id: 'p', scheduled_start: '2026-06-10T09:30:00Z', scheduled_end: '2026-06-10T10:00:00Z' });
  const res = tightTransfer('w1', SLOT_START, SLOT_END, slotClientA, [early, nearest]);
  expect(res).toEqual({ direction: 'from_prev', driveMin: 21, gapMin: 0 });
});

test('both sides tight: reports the side with the worse shortfall', () => {
  const prev = visit({ id: 'p', scheduled_start: '2026-06-10T09:15:00Z', scheduled_end: '2026-06-10T09:45:00Z' }); // 15 min gap
  const next = visit({ id: 'n', scheduled_start: '2026-06-10T10:35:00Z', scheduled_end: '2026-06-10T11:05:00Z' }); // 5 min gap
  const res = tightTransfer('w1', SLOT_START, SLOT_END, slotClientA, [prev, next]);
  expect(res).toEqual({ direction: 'to_next', driveMin: 21, gapMin: 5 });
});

test('same client on either side is never tight (no travel between the same home)', () => {
  const prev = visit({
    id: 'p',
    client_id: 'client-a', // same client as the slot
    client: HOME_A,
    scheduled_start: '2026-06-10T09:30:00Z',
    scheduled_end: '2026-06-10T10:00:00Z', // back-to-back, 0 gap
  });
  expect(tightTransfer('w1', SLOT_START, SLOT_END, slotClientA, [prev])).toBeNull();
});

test('different client under 250 m away counts as the same place', () => {
  const prev = visit({
    id: 'p',
    client: NEARBY_A,
    scheduled_start: '2026-06-10T09:30:00Z',
    scheduled_end: '2026-06-10T10:00:00Z',
  });
  expect(tightTransfer('w1', SLOT_START, SLOT_END, slotClientA, [prev])).toBeNull();
});

test('missing coordinates skip that side silently', () => {
  const noCoords = visit({
    id: 'p',
    client: { lat: null, lng: null },
    scheduled_start: '2026-06-10T09:50:00Z',
    scheduled_end: '2026-06-10T10:00:00Z',
  });
  expect(tightTransfer('w1', SLOT_START, SLOT_END, slotClientA, [noCoords])).toBeNull();

  // ... but a measurable other side still warns.
  const next = visit({ id: 'n', scheduled_start: '2026-06-10T10:40:00Z', scheduled_end: '2026-06-10T11:10:00Z' });
  expect(tightTransfer('w1', SLOT_START, SLOT_END, slotClientA, [noCoords, next])).toEqual({
    direction: 'to_next',
    driveMin: 21,
    gapMin: 10,
  });
});

test('missing slot-client coordinates disable the check entirely', () => {
  const prev = visit({ id: 'p', scheduled_start: '2026-06-10T09:50:00Z', scheduled_end: '2026-06-10T10:00:00Z' });
  expect(tightTransfer('w1', SLOT_START, SLOT_END, { id: 'client-a', lat: null, lng: null }, [prev])).toBeNull();
  expect(tightTransfer('w1', SLOT_START, SLOT_END, null, [prev])).toBeNull();
});

test("another walker's visits and the excluded visit do not count", () => {
  const other = visit({ id: 'p', walker_id: 'somebody-else', scheduled_start: '2026-06-10T09:50:00Z', scheduled_end: '2026-06-10T10:00:00Z' });
  expect(tightTransfer('w1', SLOT_START, SLOT_END, slotClientA, [other])).toBeNull();

  const self = visit({ id: 'v-being-moved', scheduled_start: '2026-06-10T09:50:00Z', scheduled_end: '2026-06-10T10:00:00Z' });
  expect(
    tightTransfer('w1', SLOT_START, SLOT_END, slotClientA, [self], { excludeVisitId: 'v-being-moved' }),
  ).toBeNull();
});

test('overlapping visits are ignored — that is busy, not a tight transfer', () => {
  const overlapping = visit({ id: 'p', scheduled_start: '2026-06-10T09:50:00Z', scheduled_end: '2026-06-10T10:10:00Z' });
  expect(tightTransfer('w1', SLOT_START, SLOT_END, slotClientA, [overlapping])).toBeNull();
});
