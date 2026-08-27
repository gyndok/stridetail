import { useState } from 'react';
import { Image, Platform, Text, View } from 'react-native';

import type { ReportPayload } from '@/src/features/report/api';
import { distanceText } from '@/src/features/report/view';
import { routeSvgPath } from '@/src/lib/schedule/polyline';
import { Card } from '@/src/ui/Card';
import { useTheme } from '@/src/ui/theme';

// Route card for the public report page (Plan 4 Task 7, upgraded Plan 7b
// Task 2). Preference order:
//   1. The pre-rendered static map (payload `mapUrl` — a short-lived signed
//      URL minted by report-public when reports/<visit_id>/map.png exists).
//      Rendered with the Mapbox attribution line required by their ToS.
//   2. The original SVG route sketch, web only (react-native-svg was not a
//      dependency when this shipped; the raw DOM <svg> works because
//      react-native-web renders through react-dom).
//   3. "Route: X mi recorded" text on native.
// The image is 700x400 at source (staticMap.ts renders 2x retina of 700x400),
// so the box keeps that aspect ratio. A runtime load failure (expired signed
// URL, storage hiccup) flips state to the sketch — the route points already
// ride on the same payload, so no refetch is needed.

const SVG_W = 320;
const SVG_H = 180;
const MAP_ASPECT = 700 / 400;

export function RouteCard({ report }: { report: ReportPayload }) {
  const t = useTheme();
  const [mapFailed, setMapFailed] = useState(false);
  const showMap = !!report.mapUrl && !mapFailed;
  const path = Platform.OS === 'web' ? routeSvgPath(report.route, SVG_W, SVG_H, 12) : null;
  const distance = distanceText(report.summary.distanceM);
  if (!showMap && !path && !distance) return null;
  return (
    <Card style={{ gap: t.space.sm }}>
      <Text style={[t.type.label, { color: t.colors.inkMuted }]}>Route</Text>
      {showMap ? (
        <View style={{ gap: t.space.xs }}>
          <Image
            testID="report-map"
            source={{ uri: report.mapUrl! }}
            style={{ width: '100%', aspectRatio: MAP_ASPECT, borderRadius: t.radius.input }}
            resizeMode="cover"
            accessibilityLabel="Map of the walk route"
            onError={() => setMapFailed(true)}
          />
          <Text style={{ fontSize: t.type.label.fontSize, color: t.colors.inkMuted }}>
            {report.mapAttribution ?? '© Mapbox © OpenStreetMap'}
          </Text>
        </View>
      ) : path ? (
        <View style={{ width: '100%', aspectRatio: SVG_W / SVG_H }}>
          <svg
            viewBox={`0 0 ${SVG_W} ${SVG_H}`}
            width="100%"
            height="100%"
            preserveAspectRatio="xMidYMid meet"
            role="img"
            aria-label="Route sketch"
          >
            <path
              d={path}
              fill="none"
              stroke={report.business.brandColor}
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </View>
      ) : (
        <Text style={{ color: t.colors.ink }}>Route: {distance} recorded</Text>
      )}
    </Card>
  );
}
