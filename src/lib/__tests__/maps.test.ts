import { Platform } from 'react-native';

import { loadMaps, resetMapsCacheForTests } from '../maps';

// Plan 7b Task 3: react-native-maps is a NATIVE module that does not exist in
// any binary cut before Sep 1. The JS ships OTA to those binaries first, so
// the loader must never let a missing native module crash bundle evaluation:
// it lazily requires inside try/catch and returns null, and callers render
// their existing non-map UI. Web is gated off entirely (no web support).

const FakeMapView = () => null;
const FakeMarker = () => null;
const FakePolyline = () => null;

const fakeModule = {
  default: FakeMapView,
  Marker: FakeMarker,
  Polyline: FakePolyline,
};

beforeEach(() => resetMapsCacheForTests());
afterEach(() => resetMapsCacheForTests());

test('returns MapView, Marker and Polyline when the module loads', () => {
  const maps = loadMaps(() => fakeModule);
  expect(maps).not.toBeNull();
  expect(maps!.MapView).toBe(FakeMapView);
  expect(maps!.Marker).toBe(FakeMarker);
  expect(maps!.Polyline).toBe(FakePolyline);
});

test('returns null when the require throws (old binary without the native module)', () => {
  const maps = loadMaps(() => {
    throw new Error('Native module RNMapsAirModule not found');
  });
  expect(maps).toBeNull();
});

test('returns null when the module is present but missing its exports (web stub)', () => {
  expect(loadMaps(() => ({ default: undefined, Marker: undefined, Polyline: undefined }))).toBeNull();
  expect(loadMaps(() => ({}))).toBeNull();
  expect(loadMaps(() => null)).toBeNull();
});

test('returns null on web without requiring the module at all', () => {
  const os = jest.replaceProperty(Platform, 'OS', 'web');
  const req = jest.fn(() => fakeModule);
  try {
    expect(loadMaps(req)).toBeNull();
    expect(req).not.toHaveBeenCalled();
  } finally {
    os.restore();
  }
});

test('caches the first load result — later calls never re-require', () => {
  expect(loadMaps(() => fakeModule)).not.toBeNull();
  const req = jest.fn(() => {
    throw new Error('should not be called');
  });
  const again = loadMaps(req);
  expect(again).not.toBeNull();
  expect(again!.MapView).toBe(FakeMapView);
  expect(req).not.toHaveBeenCalled();
});

test('caches a null result too (a binary does not grow the module mid-session)', () => {
  expect(
    loadMaps(() => {
      throw new Error('missing');
    }),
  ).toBeNull();
  const req = jest.fn(() => fakeModule);
  expect(loadMaps(req)).toBeNull();
  expect(req).not.toHaveBeenCalled();
});
