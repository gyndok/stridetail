import {
  downsamplePolyline,
  flattenTrackPoints,
  MAX_ROUTE_POINTS,
  routeSvgPath,
  type LatLng,
} from '@/src/lib/schedule/polyline';

// VECTOR TABLE — pinned identically in
// supabase/functions/report-public/polyline.test.ts (deno). Change both files
// together.
//
//  V1: []                          -> []
//  V2: 1 point                     -> same point
//  V3: 200 points (== max)         -> unchanged, same order
//  V4: 201 points, max 200         -> stride 2: indices 0,2,...,198 + 200 = 101 points
//  V5: 1000 points, max 200        -> stride 6: 167 + last = 168 points, first/last kept
//  V6: 10 points, max 4            -> stride 3: indices 0,3,6 + 9 = 4 points
//  V7: flatten drops acc > 50, keeps acc-less, joins segments in order

const line = (n: number): LatLng[] =>
  Array.from({ length: n }, (_, i) => ({ lat: 29 + i * 0.001, lng: -95 - i * 0.001 }));

test('V1: empty input returns empty output', () => {
  expect(downsamplePolyline([])).toEqual([]);
});

test('V2: single point passes through', () => {
  expect(downsamplePolyline([{ lat: 29.7, lng: -95.4 }])).toEqual([{ lat: 29.7, lng: -95.4 }]);
});

test('V3: exactly max points is unchanged and order-preserving', () => {
  const pts = line(MAX_ROUTE_POINTS);
  expect(downsamplePolyline(pts)).toEqual(pts);
});

test('V4: 201 points downsample to 101 (stride 2), endpoints kept', () => {
  const pts = line(201);
  const out = downsamplePolyline(pts);
  expect(out).toHaveLength(101);
  expect(out[0]).toEqual(pts[0]);
  expect(out[out.length - 1]).toEqual(pts[200]);
  expect(out[1]).toEqual(pts[2]);
});

test('V5: 1000 points downsample to 168 (stride 6), endpoints kept, order kept', () => {
  const pts = line(1000);
  const out = downsamplePolyline(pts);
  expect(out).toHaveLength(168);
  expect(out.length).toBeLessThanOrEqual(MAX_ROUTE_POINTS);
  expect(out[0]).toEqual(pts[0]);
  expect(out[out.length - 1]).toEqual(pts[999]);
  const lats = out.map((p) => p.lat);
  expect([...lats].sort((a, b) => a - b)).toEqual(lats);
});

test('V6: 10 points with max 4 keep indices 0,3,6,9', () => {
  const pts = line(10);
  const out = downsamplePolyline(pts, 4);
  expect(out).toEqual([pts[0], pts[3], pts[6], pts[9]]);
});

test('V7: flatten drops acc > 50, keeps acc-less points, joins segments', () => {
  const segments = [
    { points: [{ lat: 1, lng: 1, acc: 10 }, { lat: 2, lng: 2, acc: 51 }] },
    { points: [{ lat: 3, lng: 3 }, { lat: 4, lng: 4, acc: 50 }] },
  ];
  expect(flattenTrackPoints(segments)).toEqual([
    { lat: 1, lng: 1 },
    { lat: 3, lng: 3 },
    { lat: 4, lng: 4 },
  ]);
});

test('downsample rejects a budget below 2', () => {
  expect(() => downsamplePolyline(line(5), 1)).toThrow('maxPoints');
});

// ---- routeSvgPath (client-only, not mirrored in the function) ----

test('routeSvgPath returns null for fewer than 2 points or zero extent', () => {
  expect(routeSvgPath([], 320, 180)).toBeNull();
  expect(routeSvgPath([{ lat: 1, lng: 1 }], 320, 180)).toBeNull();
  expect(
    routeSvgPath(
      [
        { lat: 1, lng: 1 },
        { lat: 1, lng: 1 },
      ],
      320,
      180,
    ),
  ).toBeNull();
});

test('routeSvgPath maps a simple north-going segment to a centred vertical line', () => {
  // Two points on the same meridian at the equator: spanX 0, spanY 0.001.
  const path = routeSvgPath(
    [
      { lat: 0, lng: 10 },
      { lat: 0.001, lng: 10 },
    ],
    100,
    100,
    10,
  );
  // Vertical line centred at x=50: south point at the bottom (y=90), north at the top (y=10).
  expect(path).toBe('M 50.0,90.0 L 50.0,10.0');
});

test('routeSvgPath starts with M and has one coordinate pair per point', () => {
  const pts = line(5);
  const path = routeSvgPath(pts, 320, 180)!;
  expect(path.startsWith('M ')).toBe(true);
  expect(path.match(/-?\d+\.\d,-?\d+\.\d/g)).toHaveLength(5);
});
