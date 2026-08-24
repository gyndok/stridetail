import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Image, Platform, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fetchPublicReport, ReportUnavailableError, type ReportPayload } from '@/src/features/report/api';
import {
  distanceText,
  localTime,
  petsServiceLine,
  photoUrls,
  reportDateLine,
  statItems,
  timelineLabel,
} from '@/src/features/report/view';
import { routeSvgPath } from '@/src/lib/schedule/polyline';
import { Card } from '@/src/ui/Card';
import { useTheme } from '@/src/ui/theme';

// Public visit report page (Plan 4 Task 7). Direct-linked from the client's
// SMS — this route lives OUTSIDE the auth gate (app/index.tsx only redirects
// its own '/' route; like /invite/[token], the root Stack hosts this straight
// from the URL) and fetches report-public with a PLAIN fetch: no session, no
// JWT (the function has verify_jwt off; the token is the credential).
//
// Route sketch: react-native-svg is NOT a dependency and adding a native
// module for one sketch is not worth it, so the polyline renders as a raw DOM
// <svg> on web only (react-native-web renders through react-dom, so plain DOM
// elements are fine there); native gets a "Route: X mi recorded" card
// (recorded in DEVIATIONS.md — native in-app render is text-mode).

const SVG_W = 320;
const SVG_H = 180;

function RouteSketch({ report }: { report: ReportPayload }) {
  const t = useTheme();
  const path = Platform.OS === 'web' ? routeSvgPath(report.route, SVG_W, SVG_H, 12) : null;
  const distance = distanceText(report.summary.distanceM);
  if (!path && !distance) return null;
  return (
    <Card style={{ gap: t.space.sm }}>
      <Text style={[t.type.label, { color: t.colors.inkMuted }]}>Route</Text>
      {path ? (
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

function ReportBody({ report }: { report: ReportPayload }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const stats = statItems(report.summary);
  const photos = photoUrls(report.timeline);
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: t.colors.surface }}
      contentContainerStyle={{ paddingBottom: insets.bottom + t.space.xxl }}
    >
      <View
        style={{
          // The business's own brand color — server data, not a literal.
          backgroundColor: report.business.brandColor,
          paddingTop: insets.top + t.space.xl,
          paddingBottom: t.space.xl,
          paddingHorizontal: t.space.lg,
          gap: t.space.sm,
        }}
      >
        {report.business.logoUrl ? (
          <Image
            source={{ uri: report.business.logoUrl }}
            style={{ width: 56, height: 56, borderRadius: t.radius.input }}
            resizeMode="cover"
          />
        ) : null}
        <Text style={[t.type.hero, { color: t.colors.onPrimary }]}>{report.business.name}</Text>
        <Text style={[t.type.body, { color: t.colors.onPrimary, opacity: 0.9 }]}>Visit report</Text>
      </View>

      <View style={{ padding: t.space.lg, gap: t.space.md }}>
        <Card style={{ gap: t.space.xs }}>
          <Text style={[t.type.title, { color: t.colors.ink }]}>
            {reportDateLine(report.summary, report.businessTz)}
          </Text>
          <Text style={{ color: t.colors.inkMuted }}>{petsServiceLine(report.summary)}</Text>
        </Card>

        {stats.length > 0 ? (
          <View style={{ flexDirection: 'row', gap: t.space.md }}>
            {stats.map((s) => (
              <Card key={s.label} style={{ flex: 1, gap: t.space.xs }}>
                <Text style={[t.type.label, { color: t.colors.inkMuted }]}>{s.label}</Text>
                <Text style={[t.type.title, { color: t.colors.ink }]}>{s.value}</Text>
              </Card>
            ))}
          </View>
        ) : null}

        <RouteSketch report={report} />

        {report.timeline.length > 0 ? (
          <Card style={{ gap: t.space.sm }}>
            <Text style={[t.type.label, { color: t.colors.inkMuted }]}>Timeline</Text>
            {report.timeline.map((e, i) => (
              <View key={`${e.occurredAt}-${i}`} style={{ flexDirection: 'row', gap: t.space.sm }}>
                <Text style={{ color: t.colors.inkMuted, width: 72 }}>
                  {localTime(e.occurredAt, report.businessTz)}
                </Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: t.colors.ink, fontWeight: '600' }}>{timelineLabel(e.type)}</Text>
                  {e.text ? <Text style={{ color: t.colors.inkMuted }}>{e.text}</Text> : null}
                </View>
              </View>
            ))}
          </Card>
        ) : null}

        {photos.length > 0 ? (
          <Card style={{ gap: t.space.sm }}>
            <Text style={[t.type.label, { color: t.colors.inkMuted }]}>Photos</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space.sm }}>
              {photos.map((uri) => (
                <Image
                  key={uri}
                  source={{ uri }}
                  style={{ width: '48%', aspectRatio: 1, borderRadius: t.radius.input }}
                  resizeMode="cover"
                />
              ))}
            </View>
          </Card>
        ) : null}
      </View>
    </ScrollView>
  );
}

function CenteredNote({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: t.colors.surface,
        alignItems: 'center',
        justifyContent: 'center',
        padding: t.space.xl,
      }}
    >
      {children}
    </View>
  );
}

export default function PublicReport() {
  const t = useTheme();
  const { token } = useLocalSearchParams<{ token: string }>();
  const report = useQuery({
    queryKey: ['publicReport', token],
    enabled: !!token,
    retry: (count, err) => !(err instanceof ReportUnavailableError) && count < 2,
    queryFn: () => fetchPublicReport(token!),
  });

  if (report.data) return <ReportBody report={report.data} />;
  if (report.error) {
    const gone = report.error instanceof ReportUnavailableError;
    return (
      <CenteredNote>
        <Text style={[t.type.title, { color: t.colors.ink, textAlign: 'center' }]}>
          {gone ? 'This report is no longer available.' : 'Something went wrong.'}
        </Text>
        {!gone ? (
          <Text style={{ color: t.colors.inkMuted, textAlign: 'center', marginTop: t.space.sm }}>
            {report.error instanceof Error ? report.error.message : String(report.error)}
          </Text>
        ) : null}
      </CenteredNote>
    );
  }
  return (
    <CenteredNote>
      <ActivityIndicator color={t.colors.primary} />
    </CenteredNote>
  );
}
