import {
  buildVisitRoute,
  cleanTrack,
  isPinEventType,
  nearestPointByTime,
  pinsForEvents,
  regionForTrack,
} from '../walkMapData';

// Plan 7b Task 3: pure geometry/data helpers behind WalkMap. The event-pin
// placement mirrors supabase/functions/_shared/staticMap.ts — visit_events
// carry no coordinates, so a pin sits on the track point nearest in time.

const pt = (t: number, lat: number, lng: number, acc?: number) => ({
  t,
  lat,
  lng,
  ...(acc !== undefined && { acc }),
});

// ---- cleanTrack ----

test('cleanTrack drops fixes with accuracy worse than 50 m and keeps unknown accuracy', () => {
  const track = [pt(0, 29.76, -95.36, 10), pt(1000, 29.761, -95.361, 80), pt(2000, 29.762, -95.362)];
  expect(cleanTrack(track)).toEqual([pt(0, 29.76, -95.36, 10), pt(2000, 29.762, -95.362)]);
});

test('cleanTrack drops non-finite coordinates', () => {
  const track = [pt(0, 29.76, -95.36), pt(1000, Number.NaN, -95.361), pt(2000, 29.762, Number.POSITIVE_INFINITY)];
  expect(cleanTrack(track)).toEqual([pt(0, 29.76, -95.36)]);
});

// ---- regionForTrack ----

test('regionForTrack centres on the bbox and pads the spans', () => {
  const region = regionForTrack([pt(0, 29.7, -95.4), pt(1000, 29.8, -95.3)]);
  expect(region).not.toBeNull();
  expect(region!.latitude).toBeCloseTo(29.75, 10);
  expect(region!.longitude).toBeCloseTo(-95.35, 10);
  // 0.1 span * 1.4 padding
  expect(region!.latitudeDelta).toBeCloseTo(0.14, 10);
  expect(region!.longitudeDelta).toBeCloseTo(0.14, 10);
});

test('regionForTrack applies a minimum delta so a stationary walk still shows a map', () => {
  const region = regionForTrack([pt(0, 29.76, -95.36)]);
  expect(region).not.toBeNull();
  expect(region!.latitude).toBeCloseTo(29.76, 10);
  expect(region!.longitudeDelta).toBeGreaterThanOrEqual(0.002);
  expect(region!.latitudeDelta).toBeGreaterThanOrEqual(0.002);
});

test('regionForTrack returns null for an empty track', () => {
  expect(regionForTrack([])).toBeNull();
});

// ---- nearestPointByTime ----

const track = [pt(0, 29.76, -95.36), pt(10_000, 29.761, -95.361), pt(20_000, 29.762, -95.362)];

test('nearestPointByTime picks the closest fix in time', () => {
  expect(nearestPointByTime(track, 10_500)).toEqual(pt(10_000, 29.761, -95.361));
  expect(nearestPointByTime(track, 16_000)).toEqual(pt(20_000, 29.762, -95.362));
});

test('nearestPointByTime clamps to the track ends', () => {
  expect(nearestPointByTime(track, -5_000)).toEqual(pt(0, 29.76, -95.36));
  expect(nearestPointByTime(track, 99_000)).toEqual(pt(20_000, 29.762, -95.362));
});

test('nearestPointByTime returns null on an empty track', () => {
  expect(nearestPointByTime([], 0)).toBeNull();
});

// ---- pinsForEvents ----

test('pinsForEvents places each pee/poop/photo event on the nearest track point', () => {
  const pins = pinsForEvents(track, [
    { type: 'pee', atMs: 1_000 },
    { type: 'photo', atMs: 19_000 },
  ]);
  expect(pins).toEqual([
    { type: 'pee', lat: 29.76, lng: -95.36, atMs: 1_000 },
    { type: 'photo', lat: 29.762, lng: -95.362, atMs: 19_000 },
  ]);
});

test('pinsForEvents returns no pins when there is no track to place them on', () => {
  expect(pinsForEvents([], [{ type: 'poop', atMs: 1_000 }])).toEqual([]);
});

// ---- buildVisitRoute (completed visits: visit_tracks + visit_events rows) ----

test('buildVisitRoute flattens segments in order, cleans fixes, and converts events', () => {
  const route = buildVisitRoute(
    [
      { points: [pt(0, 29.76, -95.36), pt(5_000, 29.761, -95.361, 90)] },
      { points: [pt(10_000, 29.762, -95.362)] },
    ],
    [
      { type: 'pee', occurred_at: '1970-01-01T00:00:09.000Z' },
      { type: 'note', occurred_at: '1970-01-01T00:00:01.000Z' },
    ],
  );
  expect(route.track).toEqual([pt(0, 29.76, -95.36), pt(10_000, 29.762, -95.362)]);
  // note is not a pin type; pee lands at t=9000 -> nearest fix t=10000
  expect(route.events).toEqual([{ type: 'pee', atMs: 9_000 }]);
});

test('buildVisitRoute ignores malformed points and unparsable timestamps', () => {
  const route = buildVisitRoute(
    [{ points: [{ lat: 29.76, lng: -95.36 }, 'garbage', pt(1_000, 29.761, -95.361)] }],
    [{ type: 'photo', occurred_at: 'not-a-date' }],
  );
  expect(route.track).toEqual([pt(1_000, 29.761, -95.361)]);
  expect(route.events).toEqual([]);
});

test('mark is a pin type (wish list #1) and rides buildVisitRoute', () => {
  expect(isPinEventType('mark')).toBe(true);
  const route = buildVisitRoute(
    [{ points: [{ t: 1_000, lat: 29.76, lng: -95.36 }] }],
    [{ type: 'mark', occurred_at: new Date(1_500).toISOString() }],
  );
  expect(route.events).toEqual([{ type: 'mark', atMs: 1_500 }]);
});
