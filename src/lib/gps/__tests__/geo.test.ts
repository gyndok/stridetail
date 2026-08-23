import { haversineMeters, shouldKeep, trackDistanceMeters } from '../geo';

const p = (lat: number, lng: number, t = 0, acc?: number) => ({ lat, lng, t, acc });

test('haversine of ~111m northward step', () => {
  const d = haversineMeters(p(30.0, -95.0), p(30.001, -95.0));
  expect(d).toBeGreaterThan(110);
  expect(d).toBeLessThan(112);
});

test('track distance sums legs and ignores inaccurate points', () => {
  const pts = [p(30, -95, 0, 5), p(30.001, -95, 1, 5), p(30.5, -95, 2, 500), p(30.002, -95, 3, 5)];
  const d = trackDistanceMeters(pts);
  expect(d).toBeGreaterThan(220);
  expect(d).toBeLessThan(224);
});

test('shouldKeep drops jitter closer than 5 m within 5 s', () => {
  const a = p(30, -95, 0);
  expect(shouldKeep(undefined, a)).toBe(true);
  expect(shouldKeep(a, p(30.00001, -95, 1000))).toBe(false);
  expect(shouldKeep(a, p(30.00001, -95, 6000))).toBe(true);
  expect(shouldKeep(a, p(30.0001, -95, 1000))).toBe(true);
});
