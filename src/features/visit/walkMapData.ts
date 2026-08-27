import type { Pt } from '@/src/lib/gps/geo';

/**
 * Pure data helpers behind WalkMap (Plan 7b Task 3). No I/O, no react — all
 * unit-tested in __tests__/walkMapData.test.ts.
 *
 * Event pins: visit_events rows carry NO coordinates. A pin's position is the
 * track fix nearest in time to the event — the same correlation the server's
 * static-map renderer uses (supabase/functions/_shared/staticMap.ts
 * nearestPoint). Change the rule in both places together.
 */

/** Mirror of geo.ts / polyline.ts / SQL: fixes worse than this are dropped. */
export const MAX_ACCURACY_M = 50;

export type PinEventType = 'pee' | 'poop' | 'photo';

/** A pin-worthy event: what happened and when (epoch ms). */
export type WalkMapEvent = { type: PinEventType; atMs: number };

/** A placed pin: the event plus the track coordinate it landed on. */
export type WalkMapPin = { type: PinEventType; lat: number; lng: number; atMs: number };

const PIN_EVENT_TYPES: readonly string[] = ['pee', 'poop', 'photo'];

export function isPinEventType(type: string): type is PinEventType {
  return PIN_EVENT_TYPES.includes(type);
}

/** Drop inaccurate (> 50 m) and malformed fixes — same filter as trackDistanceMeters. */
export function cleanTrack(points: Pt[]): Pt[] {
  return points.filter(
    (p) =>
      Number.isFinite(p.lat) &&
      Number.isFinite(p.lng) &&
      (p.acc === undefined || p.acc <= MAX_ACCURACY_M),
  );
}

export type MapRegion = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

/** Padding factor around the track bbox (1.4 = 20% margin each side). */
const REGION_PAD = 1.4;
/** Minimum span (~200 m) so a stationary or just-started walk still shows a map. */
const MIN_DELTA = 0.002;

/** Region centred on the track bbox, padded; null when there is no track. */
export function regionForTrack(points: Pt[], pad = REGION_PAD): MapRegion | null {
  const first = points[0];
  if (!first) return null;
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
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max((maxLat - minLat) * pad, MIN_DELTA),
    longitudeDelta: Math.max((maxLng - minLng) * pad, MIN_DELTA),
  };
}

/** The track fix nearest in time to tMs; null on an empty track. */
export function nearestPointByTime(track: Pt[], tMs: number): Pt | null {
  let best: Pt | null = null;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const p of track) {
    const dist = Math.abs(p.t - tMs);
    if (dist < bestDist) {
      best = p;
      bestDist = dist;
    }
  }
  return best;
}

/** Place each event on its nearest-in-time track fix (no track -> no pins). */
export function pinsForEvents(track: Pt[], events: WalkMapEvent[]): WalkMapPin[] {
  const pins: WalkMapPin[] = [];
  for (const e of events) {
    const p = nearestPointByTime(track, e.atMs);
    if (p) pins.push({ type: e.type, lat: p.lat, lng: p.lng, atMs: e.atMs });
  }
  return pins;
}

export type VisitRoute = { track: Pt[]; events: WalkMapEvent[] };

/**
 * Assemble a completed visit's route from raw visit_tracks segments (caller
 * orders them by segment_no) and visit_events rows. Malformed points and
 * unparsable timestamps are dropped; non-pin event types are ignored.
 */
export function buildVisitRoute(
  segments: { points: unknown }[],
  events: { type: string; occurred_at: string }[],
): VisitRoute {
  const track: Pt[] = [];
  for (const seg of segments) {
    if (!Array.isArray(seg.points)) continue;
    for (const raw of seg.points) {
      const p = raw as { t?: unknown; lat?: unknown; lng?: unknown; acc?: unknown } | null;
      if (
        !p ||
        typeof p.t !== 'number' ||
        typeof p.lat !== 'number' ||
        typeof p.lng !== 'number'
      ) {
        continue;
      }
      track.push({
        t: p.t,
        lat: p.lat,
        lng: p.lng,
        ...(typeof p.acc === 'number' && { acc: p.acc }),
      });
    }
  }
  const mapped: WalkMapEvent[] = [];
  for (const e of events) {
    if (!isPinEventType(e.type)) continue;
    const atMs = Date.parse(e.occurred_at);
    if (Number.isNaN(atMs)) continue;
    mapped.push({ type: e.type, atMs });
  }
  return { track: cleanTrack(track), events: mapped };
}
