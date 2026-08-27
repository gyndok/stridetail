import { useQuery } from '@tanstack/react-query';
import { Link, useLocalSearchParams, type Href } from 'expo-router';
import { ActivityIndicator, Image, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fetchPublicReport, ReportUnavailableError, type ReportPayload } from '@/src/features/report/api';
import { RouteCard } from '@/src/features/report/RouteCard';
import {
  localTime,
  petsServiceLine,
  photoUrls,
  reportDateLine,
  statItems,
  timelineLabel,
} from '@/src/features/report/view';
import { Card } from '@/src/ui/Card';
import { useTheme } from '@/src/ui/theme';

// Public visit report page (Plan 4 Task 7). Direct-linked from the client's
// SMS — this route lives OUTSIDE the auth gate (app/index.tsx only redirects
// its own '/' route; like /invite/[token], the root Stack hosts this straight
// from the URL) and fetches report-public with a PLAIN fetch: no session, no
// JWT (the function has verify_jwt off; the token is the credential).
//
// Route card: lives in src/features/report/RouteCard.tsx (Plan 7b Task 2) —
// static map image when the payload carries mapUrl, the original SVG sketch
// (web) / "Route: X mi recorded" text (native) otherwise.

// Plan 6 Task 3: when the payload carries an invoice token, one card links to
// the public invoice page. Nothing extra is fetched here — the report payload
// holds the TOKEN only. Built with expo-router's Link: on web it renders a
// RELATIVE <a href="/invoice/<token>"> (same origin as this report page), and
// on native it is an in-app navigation to the same /invoice/[token] route —
// both routes live in this app, so no external URL is needed.
function InvoiceCard({ token }: { token: string }) {
  const t = useTheme();
  return (
    <Link href={`/invoice/${token}` as Href} asChild>
      <Pressable accessibilityRole="link">
        <Card style={{ gap: t.space.xs }}>
          <Text style={[t.type.label, { color: t.colors.inkMuted }]}>Billing</Text>
          <Text style={[t.type.title, { color: t.colors.ink }]}>{'Invoice & payment →'}</Text>
        </Card>
      </Pressable>
    </Link>
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

        {report.invoice ? <InvoiceCard token={report.invoice.token} /> : null}

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

        <RouteCard report={report} />

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
