import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { View } from 'react-native';
import type MapViewType from 'react-native-maps';

import type { Pt } from '@/src/lib/gps/geo';
import { loadMaps } from '@/src/lib/maps';
import { useTheme } from '@/src/ui/theme';

import {
  cleanTrack,
  pinsForEvents,
  regionForTrack,
  type PinEventType,
  type WalkMapEvent,
} from './walkMapData';

/**
 * The ONE walk map card (Plan 7b Task 3), shared by the active-walk screen
 * (mode="live") and the completed visit detail (mode="completed").
 *
 * Apple Maps via react-native-maps — lazily loaded through src/lib/maps so a
 * binary without the native module (anything cut before Sep 1, and web)
 * renders `fallback` instead of crashing. Same visual language as the static
 * report map: identical marker discs (assets/markers mirrors public/markers),
 * brand-primary route stroke. Live walks show start + event pins and follow
 * the walker; completed walks add the finish flag.
 */

// Same Twemoji disc art the server-side static map uses (DEVIATIONS 2026-08-26);
// assets/ copies of public/markers/ because public/ only ships to web.
const MARKER_IMAGE: Record<PinEventType | 'start' | 'finish', number> = {
  start: require('../../../assets/markers/start.png'),
  finish: require('../../../assets/markers/finish.png'),
  pee: require('../../../assets/markers/pee.png'),
  poop: require('../../../assets/markers/poop.png'),
  photo: require('../../../assets/markers/photo.png'),
  mark: require('../../../assets/markers/mark.png'),
};

/** Marker art is a centred disc, not a bottom-tipped pin. anchor is the
 * Google-Maps spelling, centerOffset the Apple-Maps one (0,0 = centred). */
const DISC_ANCHOR = { anchor: { x: 0.5, y: 0.5 }, centerOffset: { x: 0, y: 0 } };

const FIT_PADDING = { top: 48, right: 48, bottom: 48, left: 48 };

export type WalkMapProps = {
  /** Raw track fixes in order (cleaned internally: acc > 50 m dropped). */
  track: Pt[];
  /** Pin-worthy events this visit (pee/poop/photo with epoch-ms times). */
  events: WalkMapEvent[];
  mode: 'live' | 'completed';
  /** Walk-screen appearance; maps to Apple Maps userInterfaceStyle. */
  appearance?: 'warm' | 'dark';
  /** Rendered when the maps module or the track is unavailable — pass exactly
   * what the screen showed before this card existed (usually nothing). */
  fallback?: ReactNode;
  height?: number;
};

export function WalkMap({
  track,
  events,
  mode,
  appearance = 'warm',
  fallback = null,
  height = 220,
}: WalkMapProps) {
  const t = useTheme();
  const maps = loadMaps();
  const mapRef = useRef<MapViewType | null>(null);

  const clean = useMemo(() => cleanTrack(track), [track]);
  const coords = useMemo(
    () => clean.map((p) => ({ latitude: p.lat, longitude: p.lng })),
    [clean],
  );
  const pins = useMemo(() => pinsForEvents(clean, events), [clean, events]);
  const region = useMemo(() => regionForTrack(clean), [clean]);

  // Live walks: keep the whole route (walker included — they are at its end)
  // in frame as new fixes arrive. initialRegion only applies on mount.
  const pointCount = coords.length;
  useEffect(() => {
    if (mode !== 'live' || pointCount < 2) return;
    mapRef.current?.fitToCoordinates?.(coords, {
      edgePadding: FIT_PADDING,
      animated: true,
    });
    // coords identity changes every poll; pointCount only when the track grows.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, pointCount]);

  if (!maps || !region) return <>{fallback}</>;
  const { MapView, Marker, Polyline } = maps;
  const start = coords[0]!;
  const finish = coords[coords.length - 1]!;

  return (
    <View
      testID="walk-map"
      style={{ height, borderRadius: t.radius.card, overflow: 'hidden' }}
    >
      <MapView
        ref={mapRef}
        testID="walk-map-view"
        style={{ flex: 1 }}
        initialRegion={region}
        userInterfaceStyle={appearance === 'dark' ? 'dark' : 'light'}
        showsUserLocation={mode === 'live'}
        pitchEnabled={false}
        toolbarEnabled={false}
      >
        {coords.length >= 2 ? (
          <Polyline
            testID="walk-map-route"
            coordinates={coords}
            strokeColor={t.colors.primary}
            strokeWidth={4}
            lineCap="round"
            lineJoin="round"
          />
        ) : null}
        <Marker
          testID="walk-map-start"
          coordinate={start}
          image={MARKER_IMAGE.start}
          {...DISC_ANCHOR}
          accessibilityLabel="Walk start"
        />
        {mode === 'completed' && coords.length >= 2 ? (
          <Marker
            testID="walk-map-finish"
            coordinate={finish}
            image={MARKER_IMAGE.finish}
            {...DISC_ANCHOR}
            accessibilityLabel="Walk finish"
          />
        ) : null}
        {pins.map((p, i) => (
          <Marker
            key={`${p.type}-${p.atMs}-${i}`}
            testID={`walk-map-pin-${p.type}-${i}`}
            coordinate={{ latitude: p.lat, longitude: p.lng }}
            image={MARKER_IMAGE[p.type]}
            {...DISC_ANCHOR}
            accessibilityLabel={`${p.type} event`}
          />
        ))}
      </MapView>
    </View>
  );
}
