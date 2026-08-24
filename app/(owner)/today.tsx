import { useQuery } from '@tanstack/react-query';
import { useRouter, type Href } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { useActiveBusiness } from '@/src/features/business/active';
import {
  groupTodayByWalker,
  listActiveMembers,
  listVisits,
  visitDayLabel,
  visitTimeRange,
  visitsOnLocalDay,
  type Visit,
} from '@/src/features/schedule/api';
import { VisitCard } from '@/src/features/schedule/VisitCard';
import { useRefetchOnFocus } from '@/src/lib/useRefetchOnFocus';
import { Button } from '@/src/ui/Button';
import { Card } from '@/src/ui/Card';
import { Screen } from '@/src/ui/Screen';
import { useTheme } from '@/src/ui/theme';

// One query serves both strips: 26h back catches everything on today's local
// day in any tz (24h day + DST hour, with margin); 14 days forward matches the
// schedule list's upcoming window for the needs-attention triage.
const LOOKBACK_MS = 26 * 3_600_000;
const LOOKAHEAD_MS = 14 * 86_400_000;

const STATUS_LABELS: Record<string, string> = {
  unassigned: 'Unassigned',
  offered: 'Offered',
  accepted: 'Accepted',
  in_progress: 'In progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export default function Today() {
  const t = useTheme();
  const router = useRouter();
  const { businessId } = useActiveBusiness();

  const visits = useQuery({
    queryKey: ['visits', businessId, 'todayPlus'],
    enabled: !!businessId,
    queryFn: () =>
      listVisits(businessId!, {
        fromUtc: new Date(Date.now() - LOOKBACK_MS),
        toUtc: new Date(Date.now() + LOOKAHEAD_MS),
      }),
  });
  const members = useQuery({
    queryKey: ['scheduleMembers', businessId],
    enabled: !!businessId,
    queryFn: () => listActiveMembers(businessId!),
  });
  useRefetchOnFocus(visits.refetch);

  const all = visits.data ?? [];
  const unassignedCount = all.filter((v) => v.status === 'unassigned').length;
  const declined = all.filter((v) => v.decline_reason != null && v.status === 'unassigned');
  const groups = groupTodayByWalker(visitsOnLocalDay(all, new Date()), members.data ?? []);

  const openVisit = (v: Visit) => router.push(`/schedule/${v.id}` as Href);

  return (
    <Screen title="Today">
      <Text style={[t.type.title, { color: t.colors.ink }]}>Needs attention</Text>
      {visits.isLoading ? (
        <Text style={{ color: t.colors.inkMuted }}>Loading…</Text>
      ) : unassignedCount === 0 && declined.length === 0 ? (
        <Text style={{ color: t.colors.inkMuted }}>All visits are covered.</Text>
      ) : (
        <Card style={{ gap: t.space.sm }}>
          <Text style={{ color: t.colors.ink, fontWeight: '700' }}>
            {unassignedCount} unassigned visit{unassignedCount === 1 ? '' : 's'} in the next 14 days
          </Text>
          {declined.map((v) => (
            <Pressable
              key={v.id}
              accessibilityRole="button"
              onPress={() => openVisit(v)}
              style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1, gap: 2 })}
            >
              <Text style={{ color: t.colors.ink }}>
                {v.client?.name ?? 'Client'} · {visitDayLabel(v)} · {visitTimeRange(v)}
              </Text>
              <Text style={{ color: t.colors.danger, fontSize: 12 }}>Declined: {v.decline_reason}</Text>
            </Pressable>
          ))}
          <Button title="Open schedule" variant="ghost" onPress={() => router.push('/schedule' as Href)} />
        </Card>
      )}

      <Text style={[t.type.title, { color: t.colors.ink }]}>Today&apos;s visits</Text>
      {visits.isLoading ? (
        <Text style={{ color: t.colors.inkMuted }}>Loading…</Text>
      ) : groups.length === 0 ? (
        <Text style={{ color: t.colors.inkMuted }}>Nothing scheduled today.</Text>
      ) : (
        groups.map((g) => (
          <View key={g.key} style={{ gap: t.space.sm }}>
            <Text style={[t.type.body, { color: t.colors.ink, fontWeight: '700' }]}>{g.name}</Text>
            {g.visits.map((v) => (
              <VisitCard
                key={v.id}
                visit={v}
                statusLabel={STATUS_LABELS[v.status] ?? v.status}
                onPress={() => openVisit(v)}
              />
            ))}
          </View>
        ))
      )}
    </Screen>
  );
}
