/**
 * Web stand-in for react-native-maps (Plan 7b Task 3). The library has no web
 * implementation — its module graph reaches for native component registration
 * that react-native-web cannot resolve, which would break the WEB bundle at
 * build time (same failure mode as expo-sqlite's wasm worker — see
 * metro.config.js WEB_STUBS). `src/lib/maps.ts` additionally gates on
 * Platform.OS !== 'web' before requiring, so these values are never actually
 * rendered; the loader's shape check on this empty module returns null and the
 * callers fall back to their non-map UI. The public report page keeps its
 * pre-rendered static map image (Plan 7b Task 2) — no live map on web.
 */
export default undefined;
export const Marker = undefined;
export const Polyline = undefined;
