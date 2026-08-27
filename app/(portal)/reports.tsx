import { router, type Href } from 'expo-router';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { StatusBadge } from '@/src/features/billing/StatusBadge';
import { petNamesLabel, visitWhenLabel } from '@/src/features/portal/home';
import { usePortalPets, usePortalScope } from '@/src/features/portal/hooks';
import { PortalScreen } from '@/src/features/portal/PortalScreen';
import {
  groupReportsByMonth,
  reportHref,
  useReportArchive,
  type PortalReportCard,
} from '@/src/features/portal/reportsApi';
import { Card } from '@/src/ui/Card';
import { useTheme } from '@/src/ui/theme';

/**
 * Portal reports tab (Plan 8 Task 5): the client's full report-card archive,
 * grouped by month (business zone). A row deep-links to the public report
 * page /report/<token> — the token comes from the client's own RLS read, the
 * public page does the rendering (map, timeline, photos). Revoked links keep
 * their row, marked unavailable (DEVIATIONS.md).
 */
export default function PortalReports() {
  const t = useTheme();
  const { link } = usePortalScope();
  const clientId = link?.client_id ?? null;
  const reports = useReportArchive(clientId);
  const pets = usePortalPets(clientId);
  const petList = pets.data ?? [];
  const groups = groupReportsByMonth(reports.data ?? []);

  return (
    <PortalScreen title="Report cards">
      {groups.map((g) => (
        <View key={g.key} style={{ gap: t.space.sm }}>
          <Text style={[t.type.label, { color: t.colors.inkMuted }]}>{g.label}</Text>
          {g.reports.map((r) => (
            <ReportRow key={r.id} report={r} petList={petList} />
          ))}
        </View>
      ))}
      {!groups.length && reports.isSuccess ? (
        <Card>
          <Text style={[t.type.body, { color: t.colors.inkMuted }]}>
            No report cards yet — they appear here after each visit.
          </Text>
        </Card>
      ) : null}
      {!reports.isSuccess && !reports.isError ? (
        <ActivityIndicator color={t.colors.primary} />
      ) : null}
      {reports.isError ? (
        <Card>
          <Text style={[t.type.body, { color: t.colors.inkMuted }]}>
            Could not load your report cards. Please try again.
          </Text>
        </Card>
      ) : null}
    </PortalScreen>
  );
}

function ReportRow({
  report,
  petList,
}: {
  report: PortalReportCard;
  petList: { id: string; name: string }[];
}) {
  const t = useTheme();
  const href = reportHref(report);
  const when = visitWhenLabel(report.visit.scheduled_start, report.visit.business_tz);
  const body = (
    <Card style={{ gap: t.space.xs }}>
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: t.space.sm,
        }}
      >
        <Text style={{ color: t.colors.ink, fontWeight: '700', flexShrink: 1 }}>{when}</Text>
        {href ? null : <StatusBadge label="Unavailable" tone="muted" />}
      </View>
      <Text style={[t.type.body, { color: t.colors.inkMuted }]}>
        {[report.visit.service?.name ?? 'Visit', petNamesLabel(report.visit.pet_ids, petList)]
          .filter(Boolean)
          .join(' · ')}
      </Text>
      {href ? (
        <Text style={[t.type.body, { color: t.colors.primary }]}>View report card →</Text>
      ) : null}
    </Card>
  );
  if (!href) return body;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open report card ${when}`}
      onPress={() => router.push(href as Href)}
    >
      {body}
    </Pressable>
  );
}
