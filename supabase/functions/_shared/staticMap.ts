// Plan 7b Task 1 — pure, dependency-free URL builder for the Mapbox Static
// Images API. The ONLY file that knows the map provider: a MapTiler/Geoapify
// swap rewrites this module and nothing else. No Deno globals, no imports —
// callers (send-email) pass the token; it is NEVER hardcoded or read here.
//
// Overlay pieces:
// - the track as a Mapbox `path` overlay carrying a standard Google
//   polyline-encoded (precision 5) string, downsampled evenly when the final
//   URL would exceed ~8k chars (Mapbox rejects longer request URLs);
// - start/finish pins and pee/poop/photo event pins as CUSTOM `url-` markers:
//   64px white-disc PNGs served from the product web host's public/markers/
//   (green flag start, chequered flag finish, droplet pee, poop, camera —
//   built from Twemoji artwork, CC-BY 4.0 © Twitter/X contributors; generator
//   recorded in DEVIATIONS.md). Mapbox fetches and caches marker images by
//   URL, so the files must be publicly reachable and are versioned by path.
// - style mapbox/outdoors-v12 (warm, streets visible), auto bbox with
//   padding, @2x retina, default 700x400.
//
// Also carries the track-flattening and event->position helpers the sender
// needs (visit_events rows have no coordinates; a pin's position is the
// nearest-in-time track point), so send-email imports exactly one module.

export type LatLng = { lat: number; lng: number };

/** Raw ingest-track point shape: t is epoch ms, acc is meters. */
export type TimedPoint = { t: number; lat: number; lng: number; acc?: number };

export type EventPinType = 'pee' | 'poop' | 'photo' | 'mark';

export type EventPin = { lat: number; lng: number; type: EventPinType };

export type StaticMapOptions = {
  width?: number;
  height?: number;
  /** Mapbox style path, e.g. 'mapbox/outdoors-v12'. */
  style?: string;
  padding?: number;
  maxUrlChars?: number;
  /** Base URL of the marker PNG dir (no trailing slash). */
  markerBaseUrl?: string;
};

export const DEFAULT_WIDTH = 700;
export const DEFAULT_HEIGHT = 400;
export const DEFAULT_STYLE = 'mapbox/outdoors-v12';
export const DEFAULT_PADDING = 40;
/** Mapbox caps request URLs at 8192 chars; stay comfortably under. */
export const MAX_URL_CHARS = 8000;

/** GPS fixes worse than this are dropped (mirror of geo.ts / SQL recompute). */
export const MAX_ACCURACY_M = 50;

// Colors from src/ui/tokens.ts with the '#' stripped — change both together.
const PATH_COLOR = 'E8642C'; // primary

/** Where the marker discs live: public/markers/ of the product web app. */
export const DEFAULT_MARKER_BASE_URL = 'https://stridetail.app/markers';

// Marker PNG basenames under markerBaseUrl (public/markers/<name>.png).
const START_MARKER = 'start'; // green flag
const FINISH_MARKER = 'finish'; // chequered flag
const EVENT_MARKERS: Record<EventPinType, string> = {
  pee: 'pee', // droplet
  poop: 'poop', // pile of poo
  photo: 'photo', // camera
  mark: 'mark', // round pushpin
};

/** Mapbox custom-marker overlay: url-<encoded image url>(lng,lat). */
function urlMarker(base: string, name: string, at: LatLng): string {
  return `url-${encodeURIComponent(`${base}/${name}.png`)}(${coord(at)})`;
}

/** Standard Google polyline encoding of one signed value (precision-scaled). */
function encodeSigned(value: number, out: string[]): void {
  let v = value < 0 ? ~(value << 1) : value << 1;
  while (v >= 0x20) {
    out.push(String.fromCharCode((0x20 | (v & 0x1f)) + 63));
    v >>= 5;
  }
  out.push(String.fromCharCode(v + 63));
}

/** Standard Google polyline encoding, precision 5 (Mapbox path overlay). */
export function encodePolyline(points: LatLng[]): string {
  const out: string[] = [];
  let prevLat = 0;
  let prevLng = 0;
  for (const p of points) {
    const lat = Math.round(p.lat * 1e5);
    const lng = Math.round(p.lng * 1e5);
    encodeSigned(lat - prevLat, out);
    encodeSigned(lng - prevLng, out);
    prevLat = lat;
    prevLng = lng;
  }
  return out.join('');
}

/**
 * Every-Nth downsample to at most maxPoints, always keeping the first and
 * last point (same shape as report-public/polyline.ts downsamplePolyline).
 */
export function downsampleEvenly<T>(points: T[], maxPoints: number): T[] {
  if (!Number.isInteger(maxPoints) || maxPoints < 2) {
    throw new Error(`maxPoints must be an integer >= 2, got ${maxPoints}`);
  }
  const n = points.length;
  if (n <= maxPoints) return points.slice();
  const stride = Math.ceil((n - 1) / (maxPoints - 1));
  const out: T[] = [];
  for (let i = 0; i < n - 1; i += stride) out.push(points[i]!);
  out.push(points[n - 1]!);
  return out;
}

/**
 * Flatten ordered visit_tracks segments into one timed polyline, dropping
 * malformed points and fixes with acc > 50 m (mirror of
 * report-public/polyline.ts flattenTrackPoints, keeping t for event pins).
 * Callers pass segments already ordered by segment_no.
 */
export function flattenTrack(segments: { points: TimedPoint[] }[]): TimedPoint[] {
  const out: TimedPoint[] = [];
  for (const seg of segments) {
    if (!Array.isArray(seg?.points)) continue;
    for (const p of seg.points) {
      if (typeof p?.lat !== 'number' || typeof p?.lng !== 'number' || typeof p?.t !== 'number') continue;
      if (p.acc !== undefined && p.acc > MAX_ACCURACY_M) continue;
      out.push(p);
    }
  }
  return out;
}

/**
 * The track point nearest in time to tMs — the pin position for a visit_events
 * row (events carry no coordinates; occurred_at is correlated with point t).
 */
export function nearestTrackPoint(points: TimedPoint[], tMs: number): TimedPoint | null {
  let best: TimedPoint | null = null;
  let bestDelta = Infinity;
  for (const p of points) {
    const delta = Math.abs(p.t - tMs);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = p;
    }
  }
  return best;
}

/** Marker coordinates: 5 decimals (~1 m) keeps pins exact and URLs short. */
function coord(p: LatLng): string {
  const r = (v: number) => (Math.round(v * 1e5) / 1e5).toString();
  return `${r(p.lng)},${r(p.lat)}`;
}

function assembleUrl(
  track: LatLng[],
  events: EventPin[],
  token: string,
  width: number,
  height: number,
  style: string,
  padding: number,
  markerBase: string,
): string {
  // Overlays draw in listed order: path underneath, pins on top,
  // start/finish above event pins.
  const overlays: string[] = [`path-4+${PATH_COLOR}-0.9(${encodeURIComponent(encodePolyline(track))})`];
  for (const e of events) {
    const name = EVENT_MARKERS[e.type];
    if (name) overlays.push(urlMarker(markerBase, name, e));
  }
  overlays.push(urlMarker(markerBase, START_MARKER, track[0]!));
  overlays.push(urlMarker(markerBase, FINISH_MARKER, track[track.length - 1]!));
  return (
    `https://api.mapbox.com/styles/v1/${style}/static/${overlays.join(',')}` +
    `/auto/${width}x${height}@2x?padding=${padding}&access_token=${token}`
  );
}

/**
 * Build the one static-map URL for a finished walk. Returns null when the
 * track has fewer than 2 points (nothing to draw). The token is the caller's
 * (send-email reads the MAPBOX_TOKEN secret) — never hardcoded here.
 */
export function buildStaticMapUrl(
  track: LatLng[],
  events: EventPin[],
  token: string,
  options: StaticMapOptions = {},
): string | null {
  if (track.length < 2) return null;
  const width = options.width ?? DEFAULT_WIDTH;
  const height = options.height ?? DEFAULT_HEIGHT;
  const style = options.style ?? DEFAULT_STYLE;
  const padding = options.padding ?? DEFAULT_PADDING;
  const maxUrlChars = options.maxUrlChars ?? MAX_URL_CHARS;
  const markerBase = options.markerBaseUrl ?? DEFAULT_MARKER_BASE_URL;

  let budget = track.length;
  let sampled = track;
  let url = assembleUrl(sampled, events, token, width, height, style, padding, markerBase);
  // Halve the point budget (evenly, first/last kept) until the URL fits.
  while (url.length > maxUrlChars && budget > 2) {
    budget = Math.max(2, Math.ceil(budget / 2));
    sampled = downsampleEvenly(track, budget);
    url = assembleUrl(sampled, events, token, width, height, style, padding, markerBase);
  }
  return url;
}
