// Route-sketch helpers for the public visit report (Plan 4 Task 7).
//
// CANONICAL implementation. supabase/functions/report-public/polyline.ts is a
// dependency-free COPY of the downsample/flatten half (the expand.ts pattern:
// the edge runtime cannot import from src/), with the same test vectors pinned
// in src/lib/schedule/__tests__/polyline.test.ts and
// supabase/functions/report-public/polyline.test.ts. Change both together.

export type LatLng = { lat: number; lng: number };

export type TrackPoint = { lat: number; lng: number; acc?: number };

export const MAX_ROUTE_POINTS = 200;

/** GPS fixes worse than this accuracy are dropped (mirror of geo.ts / SQL). */
export const MAX_ACCURACY_M = 50;

/**
 * Flatten ordered track segments into one lat/lng-only polyline, dropping
 * points with acc > 50 m (same filter as trackDistanceMeters and the SQL
 * recompute_visit_distance). Callers pass segments already ordered by
 * segment_no; segment boundaries are joined by a straight line, which is fine
 * for a sketch.
 */
export function flattenTrackPoints(segments: { points: TrackPoint[] }[]): LatLng[] {
  const out: LatLng[] = [];
  for (const seg of segments) {
    for (const p of seg.points) {
      if (typeof p?.lat !== 'number' || typeof p?.lng !== 'number') continue;
      if (p.acc !== undefined && p.acc > MAX_ACCURACY_M) continue;
      out.push({ lat: p.lat, lng: p.lng });
    }
  }
  return out;
}

/**
 * Every-Nth downsample to at most maxPoints, always keeping the first and last
 * point (chosen over Douglas-Peucker per the plan's "or simple every-Nth" —
 * deterministic, O(n), and plenty for a small route sketch). Points at indices
 * 0, stride, 2*stride, ... survive, plus the final point; the stride is the
 * smallest that fits the budget, so short polylines pass through unchanged.
 */
export function downsamplePolyline(points: LatLng[], maxPoints = MAX_ROUTE_POINTS): LatLng[] {
  if (!Number.isInteger(maxPoints) || maxPoints < 2) {
    throw new Error(`maxPoints must be an integer >= 2, got ${maxPoints}`);
  }
  const n = points.length;
  if (n <= maxPoints) return points.map((p) => ({ lat: p.lat, lng: p.lng }));
  const stride = Math.ceil((n - 1) / (maxPoints - 1));
  const out: LatLng[] = [];
  for (let i = 0; i < n - 1; i += stride) {
    const p = points[i]!;
    out.push({ lat: p.lat, lng: p.lng });
  }
  const last = points[n - 1]!;
  out.push({ lat: last.lat, lng: last.lng });
  return out;
}

/**
 * Project a lat/lng polyline into an SVG path for a width x height viewBox.
 * Longitude is scaled by cos(mid latitude) so the sketch is roughly
 * proportion-true; one uniform scale fits the larger span, and the route is
 * centred in the remaining axis. Returns null when there is nothing drawable
 * (fewer than 2 points, or zero geographic extent).
 */
export function routeSvgPath(
  points: LatLng[],
  width: number,
  height: number,
  pad = 8,
): string | null {
  if (points.length < 2) return null;
  const first = points[0]!;
  let minLat = first.lat;
  let maxLat = first.lat;
  let minLng = first.lng;
  let maxLng = first.lng;
  for (const p of points) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lng < minLng) minLng = p.lng;
    if (p.lng > maxLng) maxLng = p.lng;
  }
  const midLat = (minLat + maxLat) / 2;
  const lngScale = Math.cos((midLat * Math.PI) / 180);
  const spanX = (maxLng - minLng) * lngScale;
  const spanY = maxLat - minLat;
  if (spanX === 0 && spanY === 0) return null;
  const availW = width - pad * 2;
  const availH = height - pad * 2;
  const scale = Math.min(
    spanX > 0 ? availW / spanX : Number.POSITIVE_INFINITY,
    spanY > 0 ? availH / spanY : Number.POSITIVE_INFINITY,
  );
  const drawnW = spanX * scale;
  const drawnH = spanY * scale;
  const offsetX = pad + (availW - drawnW) / 2;
  const offsetY = pad + (availH - drawnH) / 2;
  const coords = points.map((p) => {
    const x = offsetX + (p.lng - minLng) * lngScale * scale;
    // SVG y grows downward; latitude grows upward.
    const y = offsetY + (maxLat - p.lat) * scale;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return `M ${coords[0]} L ${coords.slice(1).join(' ')}`;
}
