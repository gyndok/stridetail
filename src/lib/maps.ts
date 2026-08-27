import { Platform } from 'react-native';

/**
 * Safe loader for react-native-maps (Plan 7b Task 3).
 *
 * The native module ships in the Sep 1 build; the JS reaches OLDER binaries
 * first via OTA/Metro. A static top-level `import 'react-native-maps'` would
 * therefore crash bundle evaluation on every installed binary — so nothing in
 * the app may import it directly. This module is the single doorway:
 *
 *  - web: always null (no web support; metro also stubs the package —
 *    see metro.config.js WEB_STUBS — so the web bundle still resolves).
 *  - native binary WITHOUT the module: the lazy require throws at native
 *    component registration -> caught -> null. Callers keep today's UI.
 *  - native binary WITH the module (Sep 1+): the real exports.
 *
 * The result is cached: a binary cannot gain or lose a native module
 * mid-session, so one probe answers for the whole app run.
 *
 * Type-only imports below are erased at compile time — they never require the
 * package at runtime.
 */

export type MapsModule = {
  MapView: typeof import('react-native-maps').default;
  Marker: typeof import('react-native-maps').Marker;
  Polyline: typeof import('react-native-maps').Polyline;
};

type RequireMaps = () => unknown;

let cache: { value: MapsModule | null } | null = null;

/* eslint-disable @typescript-eslint/no-require-imports -- the lazy require IS
   the mechanism: it defers native-module evaluation to first use, inside the
   try/catch below. */
const defaultRequire: RequireMaps = () => require('react-native-maps');
/* eslint-enable @typescript-eslint/no-require-imports */

function probe(requireMaps: RequireMaps): MapsModule | null {
  if (Platform.OS === 'web') return null;
  try {
    const mod = requireMaps() as
      | { default?: unknown; Marker?: unknown; Polyline?: unknown }
      | null
      | undefined;
    if (!mod?.default || !mod.Marker || !mod.Polyline) return null;
    return {
      MapView: mod.default,
      Marker: mod.Marker,
      Polyline: mod.Polyline,
    } as MapsModule;
  } catch {
    return null;
  }
}

/** The react-native-maps exports, or null when this binary/platform has none. */
export function loadMaps(requireMaps: RequireMaps = defaultRequire): MapsModule | null {
  if (cache) return cache.value;
  cache = { value: probe(requireMaps) };
  return cache.value;
}

/** Test seam: clears the probe cache so each test starts cold. */
export function resetMapsCacheForTests(): void {
  cache = null;
}
