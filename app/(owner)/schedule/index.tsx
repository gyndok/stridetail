import { useQuery } from '@tanstack/react-query';
import { formatInTimeZone } from 'date-fns-tz';
import { useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useActiveBusiness } from '@/src/features/business/active';
import {
  groupVisitsByLocalDay,
  listActiveMembers,
  listVisits,
  memberName,
  needsAttention,
  visitTimeRange,
  type Visit,
} from '@/src/features/schedule/api';
import { Chip } from '@/src/features/schedule/Chip';
import { useRefetchOnFocus } from '@/src/lib/useRefetchOnFocus';
import { Button } from '@/src/ui/Button';
import { Card } from '@/src/ui/Card';
import { Screen } from '@/src/ui/Screen';
import { useTheme } from '@/src/ui/theme';

const UPCOMING_DAYS = 14;

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'unassigned', label: 'Unassigned' },
  { key: 'attention', label: 'Needs attention' },
] as const;

type FilterKey = (typeof FILTERS)[number]['key'];

function applyFilter(visits: Visit[], filter: FilterKey): Visit[] {
  if (filter === 'unassigned') return visits.filter((v) => v.status === 'unassigned');
  if (filter === 'attention') return visits.filter(needsAttention);
  return visits;
}

export default function ScheduleIndex() {
  const t = useTheme();
  const router = useRouter();
  const { businessId } = useActiveBusiness();
  const [filter, setFilter] = useState<FilterKey>('all');

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
  useRefetchOnFocus(visits.refetch);

  const filtered = applyFilter(visits.data ?? [], filter);
  const groups = groupVisitsByLocalDay(filtered);

  return (
    <Screen title="Schedule">
      <Button title="New visit" onPress={() => router.push('/schedule/new' as Href)} />
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
                    <Text style={{ color: t.colors.inkMuted, fontSize: 12, fontWeight: '700' }}>
                      {memberName(members.data ?? [], v.walker_id)}
                      {v.status === 'offered' ? ' · offered' : ''}
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
