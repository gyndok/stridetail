export type Pt = { t: number; lat: number; lng: number; acc?: number };

const R = 6371008.8;
const rad = (d: number) => (d * Math.PI) / 180;

export function haversineMeters(a: Pt, b: Pt): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function trackDistanceMeters(
  points: Pt[],
  opts: { maxAccuracyM?: number } = {},
): number {
  const max = opts.maxAccuracyM ?? 50;
  let prev: Pt | undefined;
  let total = 0;
  for (const pt of points) {
    if (pt.acc !== undefined && pt.acc > max) continue;
    if (prev) total += haversineMeters(prev, pt);
    prev = pt;
  }
  return total;
}

export function shouldKeep(
  prev: Pt | undefined,
  next: Pt,
  opts: { minMeters?: number; minMs?: number } = {},
): boolean {
  if (!prev) return true;
  const minMeters = opts.minMeters ?? 5;
  const minMs = opts.minMs ?? 5000;
  return haversineMeters(prev, next) >= minMeters || next.t - prev.t >= minMs;
}
