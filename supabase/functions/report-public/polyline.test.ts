// Deno tests for the report-public downsample copy. VECTOR TABLE pinned
// identically in src/lib/schedule/__tests__/polyline.test.ts (jest). Change
// both files together.
//
//  V1: []                          -> []
//  V2: 1 point                     -> same point
//  V3: 200 points (== max)         -> unchanged, same order
//  V4: 201 points, max 200         -> stride 2: indices 0,2,...,198 + 200 = 101 points
//  V5: 1000 points, max 200        -> stride 6: 167 + last = 168 points, first/last kept
//  V6: 10 points, max 4            -> stride 3: indices 0,3,6 + 9 = 4 points
//  V7: flatten drops acc > 50, keeps acc-less, joins segments in order
import { assertEquals, assertThrows } from 'jsr:@std/assert@1';

import { downsamplePolyline, flattenTrackPoints, MAX_ROUTE_POINTS, type LatLng } from './polyline.ts';

const line = (n: number): LatLng[] =>
  Array.from({ length: n }, (_, i) => ({ lat: 29 + i * 0.001, lng: -95 - i * 0.001 }));

Deno.test('V1: empty input returns empty output', () => {
  assertEquals(downsamplePolyline([]), []);
});

Deno.test('V2: single point passes through', () => {
  assertEquals(downsamplePolyline([{ lat: 29.7, lng: -95.4 }]), [{ lat: 29.7, lng: -95.4 }]);
});

Deno.test('V3: exactly max points is unchanged and order-preserving', () => {
  const pts = line(MAX_ROUTE_POINTS);
  assertEquals(downsamplePolyline(pts), pts);
});

Deno.test('V4: 201 points downsample to 101 (stride 2), endpoints kept', () => {
  const pts = line(201);
  const out = downsamplePolyline(pts);
  assertEquals(out.length, 101);
  assertEquals(out[0], pts[0]);
  assertEquals(out[out.length - 1], pts[200]);
  assertEquals(out[1], pts[2]);
});

Deno.test('V5: 1000 points downsample to 168 (stride 6), endpoints kept, order kept', () => {
  const pts = line(1000);
  const out = downsamplePolyline(pts);
  assertEquals(out.length, 168);
  assertEquals(out.length <= MAX_ROUTE_POINTS, true);
  assertEquals(out[0], pts[0]);
  assertEquals(out[out.length - 1], pts[999]);
  const lats = out.map((p) => p.lat);
  assertEquals([...lats].sort((a, b) => a - b), lats);
});

Deno.test('V6: 10 points with max 4 keep indices 0,3,6,9', () => {
  const pts = line(10);
  assertEquals(downsamplePolyline(pts, 4), [pts[0], pts[3], pts[6], pts[9]]);
});

Deno.test('V7: flatten drops acc > 50, keeps acc-less points, joins segments', () => {
  const segments = [
    { points: [{ lat: 1, lng: 1, acc: 10 }, { lat: 2, lng: 2, acc: 51 }] },
    { points: [{ lat: 3, lng: 3 }, { lat: 4, lng: 4, acc: 50 }] },
  ];
  assertEquals(flattenTrackPoints(segments), [
    { lat: 1, lng: 1 },
    { lat: 3, lng: 3 },
    { lat: 4, lng: 4 },
  ]);
});

Deno.test('downsample rejects a budget below 2', () => {
  assertThrows(() => downsamplePolyline(line(5), 1), Error, 'maxPoints');
});
