// Deno tests for the static-map URL builder (Plan 7b Task 1). Expected URLs
// are PINNED: any change to overlay order, colors, style, or encoding shows
// up as an exact-string diff here. The polyline vector is the canonical
// Google encoding example, so the encoder is pinned against a published
// reference, not against itself.
import { assert, assertEquals, assertStringIncludes, assertThrows } from 'jsr:@std/assert@1';

import {
  buildStaticMapUrl,
  DEFAULT_STYLE,
  downsampleEvenly,
  encodePolyline,
  flattenTrack,
  MAX_URL_CHARS,
  nearestTrackPoint,
  type EventPin,
  type LatLng,
  type TimedPoint,
} from './staticMap.ts';

// Canonical Google polyline example (precision 5).
const GOOGLE_TRACK: LatLng[] = [
  { lat: 38.5, lng: -120.2 },
  { lat: 40.7, lng: -120.95 },
  { lat: 43.252, lng: -126.453 },
];
const GOOGLE_ENCODED = '_p~iF~ps|U_ulLnnqC_mqNvxq`@';

Deno.test('encodePolyline matches the published Google example', () => {
  assertEquals(encodePolyline(GOOGLE_TRACK), GOOGLE_ENCODED);
});

Deno.test('encodePolyline: empty and single-point inputs', () => {
  assertEquals(encodePolyline([]), '');
  assertEquals(encodePolyline([{ lat: 38.5, lng: -120.2 }]), '_p~iF~ps|U');
});

// url- markers carry the percent-encoded marker-image URL.
const M = (name: string) => encodeURIComponent(`https://stridetail.app/markers/${name}.png`);

Deno.test('buildStaticMapUrl pins the exact URL: path, event marker, start/finish markers', () => {
  const events: EventPin[] = [{ lat: 40.7, lng: -120.95, type: 'pee' }];
  const url = buildStaticMapUrl(GOOGLE_TRACK, events, 'TEST_TOKEN');
  assertEquals(
    url,
    'https://api.mapbox.com/styles/v1/mapbox/outdoors-v12/static/' +
      'path-4+E8642C-0.9(_p~iF~ps%7CU_ulLnnqC_mqNvxq%60%40),' +
      `url-${M('pee')}(-120.95,40.7),` +
      `url-${M('start')}(-120.2,38.5),` +
      `url-${M('finish')}(-126.453,43.252)` +
      '/auto/700x400@2x?padding=40&access_token=TEST_TOKEN',
  );
});

Deno.test('event markers: poop and photo discs placed; unknown types dropped', () => {
  const events = [
    { lat: 40.7, lng: -120.95, type: 'poop' },
    { lat: 40.7, lng: -120.95, type: 'photo' },
    { lat: 40.7, lng: -120.95, type: 'note' },
  ] as EventPin[];
  const url = buildStaticMapUrl(GOOGLE_TRACK, events, 'TEST_TOKEN')!;
  assertStringIncludes(url, `url-${M('poop')}(-120.95,40.7)`);
  assertStringIncludes(url, `url-${M('photo')}(-120.95,40.7)`);
  assert(!url.includes('note'));
});

Deno.test('markerBaseUrl option overrides the marker host', () => {
  const url = buildStaticMapUrl(GOOGLE_TRACK, [], 'TEST_TOKEN', {
    markerBaseUrl: 'https://example.test/m',
  })!;
  assertStringIncludes(url, `url-${encodeURIComponent('https://example.test/m/start.png')}(-120.2,38.5)`);
});

Deno.test('options override size, style, padding; token is only appended, never baked in', () => {
  const url = buildStaticMapUrl(GOOGLE_TRACK, [], 'abc123', {
    width: 500,
    height: 300,
    style: 'mapbox/streets-v12',
    padding: 20,
  })!;
  assertStringIncludes(url, '/styles/v1/mapbox/streets-v12/static/');
  assertStringIncludes(url, '/auto/500x300@2x?padding=20&access_token=abc123');
  assertEquals(DEFAULT_STYLE, 'mapbox/outdoors-v12');
});

Deno.test('fewer than 2 track points returns null', () => {
  assertEquals(buildStaticMapUrl([], [], 'TEST_TOKEN'), null);
  assertEquals(buildStaticMapUrl([{ lat: 1, lng: 2 }], [], 'TEST_TOKEN'), null);
});

Deno.test('long track downsamples until the URL fits under the limit', () => {
  const big: LatLng[] = Array.from({ length: 4000 }, (_, i) => ({
    lat: 29.7 + i * 0.0007,
    lng: -95.4 - i * 0.0007,
  }));
  const capped = buildStaticMapUrl(big, [], 'TEST_TOKEN')!;
  const uncapped = buildStaticMapUrl(big, [], 'TEST_TOKEN', { maxUrlChars: 10_000_000 })!;
  assert(capped.length <= MAX_URL_CHARS, `capped url is ${capped.length} chars`);
  assert(uncapped.length > MAX_URL_CHARS, 'fixture must exceed the limit undownsampled');
  // First/last points survive downsampling: the start/finish markers sit on them.
  assertStringIncludes(capped, `url-${M('start')}(-95.4,29.7)`);
  assertStringIncludes(capped, `url-${M('finish')}(-98.1993,32.4993)`);
});

Deno.test('downsampleEvenly keeps first and last, rejects maxPoints < 2', () => {
  const ten = Array.from({ length: 10 }, (_, i) => i);
  assertEquals(downsampleEvenly(ten, 4), [0, 3, 6, 9]);
  assertEquals(downsampleEvenly(ten, 10), ten);
  assertThrows(() => downsampleEvenly(ten, 1));
});

Deno.test('flattenTrack joins segments in order, drops acc > 50 and malformed points', () => {
  const segs = [
    { points: [{ t: 1, lat: 1, lng: 2 }, { t: 2, lat: 3, lng: 4, acc: 51 }] },
    { points: [{ t: 3, lat: 5, lng: 6, acc: 50 }, { lat: 7, lng: 8 } as unknown as TimedPoint] },
  ];
  assertEquals(flattenTrack(segs), [
    { t: 1, lat: 1, lng: 2 },
    { t: 3, lat: 5, lng: 6, acc: 50 },
  ]);
});

Deno.test('nearestTrackPoint picks the nearest-in-time point (event pin position)', () => {
  const pts: TimedPoint[] = [
    { t: 1000, lat: 1, lng: 1 },
    { t: 2000, lat: 2, lng: 2 },
    { t: 3000, lat: 3, lng: 3 },
  ];
  assertEquals(nearestTrackPoint(pts, 2400)?.lat, 2);
  assertEquals(nearestTrackPoint(pts, 2600)?.lat, 3);
  assertEquals(nearestTrackPoint(pts, 0)?.lat, 1);
  assertEquals(nearestTrackPoint([], 1000), null);
});

Deno.test('mark events place the pushpin disc', () => {
  const events: EventPin[] = [{ lat: 40.7, lng: -120.95, type: 'mark' }];
  const url = buildStaticMapUrl(GOOGLE_TRACK, events, 'tok')!;
  assertStringIncludes(url, `url-${M('mark')}(-120.95,40.7)`);
});
