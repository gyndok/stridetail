// Dependency-free COPY of the downsample/flatten half of
// src/lib/schedule/polyline.ts (the expand.ts pattern: the edge runtime cannot
// import from src/). The canonical implementation and rationale live there;
// the shared test vectors are pinned in
// src/lib/schedule/__tests__/polyline.test.ts and ./polyline.test.ts.
// Change both files together.

export type LatLng = { lat: number; lng: number };

export type TrackPoint = { lat: number; lng: number; acc?: number };

export const MAX_ROUTE_POINTS = 200;

/** GPS fixes worse than this accuracy are dropped (mirror of geo.ts / SQL). */
export const MAX_ACCURACY_M = 50;

/**
 * Flatten ordered track segments into one lat/lng-only polyline, dropping
 * points with acc > 50 m (same filter as trackDistanceMeters and the SQL
 * recompute_visit_distance). Callers pass segments already ordered by
 * segment_no.
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
 * point. Points at indices 0, stride, 2*stride, ... survive, plus the final
 * point; the stride is the smallest that fits the budget, so short polylines
 * pass through unchanged.
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
