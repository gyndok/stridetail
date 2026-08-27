import { useQuery } from '@tanstack/react-query';
import { formatInTimeZone } from 'date-fns-tz';
import { useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, Text, useWindowDimensions, View } from 'react-native';

import { useActiveBusiness } from '@/src/features/business/active';
import { useMemberships } from '@/src/features/business/useMemberships';
import { listPendingBookingRequests } from '@/src/features/portal/requestsApi';
import {
  groupVisitsByLocalDay,
  listActiveMembers,
  listProblemNotifications,
  listVisits,
  memberName,
  needsAttention,
  problemVisitIds,
  visitTimeRange,
  type Visit,
} from '@/src/features/schedule/api';
import { Chip } from '@/src/features/schedule/Chip';
import { WeekGrid } from '@/src/features/schedule/WeekGridView';
import { useRefetchOnFocus } from '@/src/lib/useRefetchOnFocus';
import { Button } from '@/src/ui/Button';
import { Card } from '@/src/ui/Card';
import { Screen } from '@/src/ui/Screen';
import { useTheme } from '@/src/ui/theme';
import { DESKTOP_MIN_WIDTH } from '@/src/ui/web/OwnerRail';

const UPCOMING_DAYS = 14;

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'unassigned', label: 'Unassigned' },
  { key: 'attention', label: 'Needs attention' },
] as const;

type FilterKey = (typeof FILTERS)[number]['key'];

// Suffix on the walker line. accepted/completed are the "covered" states and
// get the green accent (Round 0); everything else stays muted.
const STATUS_SUFFIX: Record<string, string> = {
  offered: ' · offered',
  accepted: ' · accepted',
  in_progress: ' · walking',
  completed: ' · completed',
};
const POSITIVE_STATUSES = new Set(['accepted', 'completed']);

function applyFilter(visits: Visit[], filter: FilterKey): Visit[] {
  if (filter === 'unassigned') return visits.filter((v) => v.status === 'unassigned');
  if (filter === 'attention') return visits.filter(needsAttention);
  return visits;
}

export default function ScheduleIndex() {
  const t = useTheme();
  const router = useRouter();
  const { businessId } = useActiveBusiness();
  const memberships = useMemberships();
  const { width } = useWindowDimensions();
  const [filter, setFilter] = useState<FilterKey>('all');
  // Desktop web (Plan 4 Task 8): a List | Week toggle; Week renders the grid
  // in the business tz. Below 900 px and on native the list is all there is.
  const desktop = Platform.OS === 'web' && width >= DESKTOP_MIN_WIDTH;
  const [view, setView] = useState<'list' | 'week'>('list');
  const businessTz =
    memberships.data?.find((m) => m.business_id === businessId)?.business.time_zone ?? null;
  const weekMode = desktop && view === 'week';

  const visits = useQuery({
    queryKey: ['visits', businessId, 'upcoming'],
    enabled: !!businessId,
    queryFn: () =>
      listVisits(businessId!, {
        fromUtc: new Date(),
        toUtc: new Date(Date.now() + UPCOMING_DAYS * 86_400_000),
      }),
  });
  const members = useQuery({
    queryKey: ['scheduleMembers', businessId],
    enabled: !!businessId,
    queryFn: () => listActiveMembers(businessId!),
  });
  // "Report not sent" badges: visits referenced by undelivered notification
  // rows (dormant-sms rows excluded in the query; owner-select RLS — owner
  // screen only).
  const notifications = useQuery({
    queryKey: ['notifications', businessId, 'problems'],
    enabled: !!businessId,
    queryFn: () => listProblemNotifications(businessId!),
  });
  // Plan 8 Task 7: pending booking requests get an entry point next to
  // "New visit" (count > 0 only — quiet otherwise).
  const bookingRequests = useQuery({
    queryKey: ['booking-requests', businessId, 'pending'],
    enabled: !!businessId,
    queryFn: () => listPendingBookingRequests(businessId!),
  });
  useRefetchOnFocus(visits.refetch);

  const filtered = applyFilter(visits.data ?? [], filter);
  const groups = groupVisitsByLocalDay(filtered);
  const problemVisits = problemVisitIds(notifications.data ?? []);
  const pendingRequests = bookingRequests.data?.length ?? 0;
  const requestsEntry =
    pendingRequests > 0 ? (
      <Button
        title={`Requests (${pendingRequests})`}
        variant="ghost"
        onPress={() => router.push('/requests' as Href)}
      />
    ) : null;

  if (weekMode) {
    return (
      <Screen title="Schedule">
        <Button title="New visit" onPress={() => router.push('/schedule/new' as Href)} />
        {requestsEntry}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space.sm }}>
          <Chip label="List" selected={false} onPress={() => setView('list')} />
          <Chip label="Week" selected onPress={() => setView('week')} />
        </View>
        {businessId && businessTz ? (
          <WeekGrid businessId={businessId} tz={businessTz} />
        ) : (
          <Text style={{ color: t.colors.inkMuted }}>Loading…</Text>
        )}
      </Screen>
    );
  }

  return (
    <Screen title="Schedule">
      <Button title="New visit" onPress={() => router.push('/schedule/new' as Href)} />
      {requestsEntry}
      {desktop ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space.sm }}>
          <Chip label="List" selected onPress={() => setView('list')} />
          <Chip label="Week" selected={false} onPress={() => setView('week')} />
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space.sm }}>
        {FILTERS.map((f) => (
          <Chip key={f.key} label={f.label} selected={filter === f.key} onPress={() => setFilter(f.key)} />
        ))}
      </View>
      {visits.error ? (
        <Text style={{ color: t.colors.danger }}>
          {visits.error instanceof Error ? visits.error.message : String(visits.error)}
        </Text>
      ) : null}
      {groups.map((g) => (
        <View key={g.day} style={{ gap: t.space.sm }}>
          <Text style={[t.type.label, { color: t.colors.inkMuted }]}>
            {formatInTimeZone(
              new Date(g.visits[0]!.scheduled_start),
              g.visits[0]!.business_tz,
              'EEEE, MMM d',
            )}
          </Text>
          {g.visits.map((v) => (
            <Pressable key={v.id} onPress={() => router.push(`/schedule/${v.id}` as Href)}>
              <Card style={{ gap: t.space.xs }}>
                <View
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: t.space.sm }}
                >
                  <Text style={[t.type.body, { color: t.colors.ink, fontWeight: '700' }]}>{visitTimeRange(v)}</Text>
                  {v.walker_id ? (
                    <Text
                      style={{
                        color: POSITIVE_STATUSES.has(v.status) ? t.colors.green : t.colors.inkMuted,
                        fontSize: 12,
                        fontWeight: '700',
                      }}
                    >
                      {memberName(members.data ?? [], v.walker_id)}
                      {STATUS_SUFFIX[v.status] ?? ''}
                    </Text>
                  ) : (
                    <View
                      style={{ borderWidth: 1, borderColor: t.colors.warning, borderRadius: t.radius.pill,
                        paddingHorizontal: t.space.sm, paddingVertical: t.space.xs / 2 }}
                    >
                      <Text style={{ color: t.colors.warning, fontSize: 12, fontWeight: '700' }}>Unassigned</Text>
                    </View>
                  )}
                </View>
                <Text style={{ color: t.colors.ink }}>{v.client?.name ?? 'Client'}</Text>
                <Text style={{ color: t.colors.inkMuted }}>{v.service?.name ?? 'Service'}</Text>
                {v.decline_reason ? (
                  <Text style={{ color: t.colors.danger, fontSize: 12 }}>
                    Declined: {v.decline_reason}
                  </Text>
                ) : null}
                {problemVisits.has(v.id) ? (
                  <View
                    style={{ alignSelf: 'flex-start', borderWidth: 1, borderColor: t.colors.warning,
                      borderRadius: t.radius.pill, paddingHorizontal: t.space.sm, paddingVertical: t.space.xs / 2 }}
                  >
                    <Text style={{ color: t.colors.warning, fontSize: 12, fontWeight: '700' }}>Report not sent</Text>
                  </View>
                ) : null}
              </Card>
            </Pressable>
          ))}
        </View>
      ))}
      {visits.isSuccess && filtered.length === 0 ? (
        <Text style={{ color: t.colors.inkMuted }}>
          {filter === 'all'
            ? `Nothing scheduled in the next ${UPCOMING_DAYS} days.`
            : 'No visits match this filter.'}
        </Text>
      ) : null}
    </Screen>
  );
}
