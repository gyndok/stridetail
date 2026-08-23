import * as Location from 'expo-location';
import { Platform } from 'react-native';

export type GeocodeResult = { lat: number; lng: number };

/**
 * Forward-geocode an address on-device via expo-location `geocodeAsync`
 * (verified against the v57 docs; no API key involved).
 *
 * - Blank / null address → null without calling the SDK.
 * - iOS needs no location permission for forward geocoding.
 * - Android requires foreground location permission before geocoding
 *   (per the v57 docs); asked for once here, denied → null.
 * - Never throws: any SDK failure (rate limit, no network, no match)
 *   resolves to null so a save is never blocked on geocoding.
 */
export async function geocodeAddress(
  address: string | null | undefined,
): Promise<GeocodeResult | null> {
  const trimmed = address?.trim();
  if (!trimmed) return null;
  try {
    if (Platform.OS === 'android') {
      const current = await Location.getForegroundPermissionsAsync();
      if (!current.granted) {
        const asked = await Location.requestForegroundPermissionsAsync();
        if (!asked.granted) return null;
      }
    }
    const results = await Location.geocodeAsync(trimmed);
    const first = results?.[0];
    if (!first || typeof first.latitude !== 'number' || typeof first.longitude !== 'number') {
      return null;
    }
    return { lat: first.latitude, lng: first.longitude };
  } catch {
    return null;
  }
}
