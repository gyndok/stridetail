import { useRouter, type Href } from 'expo-router';
import { Pressable, Text, View, type ViewStyle } from 'react-native';

import { useActiveBusiness } from '@/src/features/business/active';
import { useMemberships } from '@/src/features/business/useMemberships';
import { RequestCard, useRequestActions } from '@/src/features/schedule/RequestCard';
import {
  memberName,
  missedVisits,
  notificationIssueLabel,
  visitDayLabel,
  visitTimeRange,
  type Visit,
} from '@/src/features/schedule/api';
import { useRefetchOnFocus } from '@/src/lib/useRefetchOnFocus';
import { useTheme } from '@/src/ui/theme';

import { PanelCard } from './PanelCard';
import { PanelSkeleton } from './PanelSkeleton';
import {
  declinedOffers,
  outOnWalks,
  petNamesLabel,
  startedAgoLabel,
  unassignedVisits,
  UNASSIGNED_PREVIEW_COUNT,
  useOperationsData,
  useWalkPetNames,
  visitHref,
} from './operationsData';

// Plan 8b Task 2 — the dashboard's operations column: three stacked cards.
//
// 1. Pending requests — the SAME approve/decline card as the Requests screen
//    (shared RequestCard, start-time picker and walker chips included), inline.
// 2. Needs attention — mobile Today's triage set, panelized: unassigned visits
//    (count + preview rows), missed visits, undelivered notifications,
//    declined offers. Same queries, same categories, nothing invented.
// 3. Out on walks now — visits currently in_progress (state-derived only, no
//    presence field): walker, client + pets, "started X min ago", refetched
//    every minute.
//
// Task 5: `columns` lays the three cards out as the mockup's operations ROW
// (three across on wide desktop, two + a full-width third in the 1024-1279
// band); the default single column keeps the panel self-contained for tests.

export function OperationsPanel({ columns = 1 }: { columns?: 1 | 2 | 3 }) {
  const t = useTheme();
  const router = useRouter();
  const { businessId } = useActiveBusiness();
  const memberships = useMemberships();
  const tz =
    memberships.data?.find((m) => m.business_id === businessId)?.business.time_zone ?? null;

  const { visits, notifications, requests, members } = useOperationsData(businessId);
  const { busyId, error, approve, decline } = useRequestActions(businessId);
  useRefetchOnFocus(requests.refetch);

  const all = visits.data ?? [];
  const now = new Date();
  const unassigned = unassignedVisits(all);
  const declined = declinedOffers(all);
  const missed = missedVisits(all, now);
  const notifLabel = notificationIssueLabel(notifications.data ?? []);
  const walks = outOnWalks(all);
  const petNames = useWalkPetNames(businessId, walks);

  const openVisit = (v: Visit) => router.push(visitHref(v) as Href);
  const rowPress = ({ pressed }: { pressed: boolean }): ViewStyle => ({
    opacity: pressed ? 0.7 : 1,
  });
  const attentionEmpty =
    unassigned.length === 0 && declined.length === 0 && missed.length === 0 && !notifLabel;

  // Row layout: the cards themselves are grow/basis flex items, so three (or
  // two) share a row, a short last row still spans the width, and stretch
  // keeps cards on one row the same height; minWidth 0 lets content truncate.
  const row = columns > 1;
  const card = row
    ? { flexGrow: 1, flexBasis: (columns === 3 ? '31%' : '48%') as `${number}%`, minWidth: 0 }
    : undefined;

  return (
    <View
      style={
        row
          ? { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.md, alignItems: 'stretch' }
          : { gap: t.space.md }
      }
    >
      <PanelCard
        title="Pending requests"
        action={{ label: 'View all', onPress: () => router.push('/requests' as Href) }}
        style={card}
      >
        {error ? <Text style={{ color: t.colors.danger }}>{error}</Text> : null}
        {requests.isLoading ? <PanelSkeleton /> : null}
        {requests.isSuccess && (requests.data ?? []).length === 0 ? (
          <Text style={{ color: t.colors.inkMuted }}>No requests waiting.</Text>
        ) : null}
        {(requests.data ?? []).map((r) => (
          <RequestCard
            key={r.id}
            request={r}
            tz={tz}
            members={members.data ?? []}
            busy={busyId === r.id}
            onApprove={(walkerId, startUtc) => void approve(r, walkerId, startUtc)}
            onDecline={(reason) => void decline(r, reason)}
          />
        ))}
      </PanelCard>

      <PanelCard title="Needs attention" style={card}>
        {visits.isLoading ? <PanelSkeleton /> : null}
        {attentionEmpty && !visits.isLoading ? (
          <Text style={{ color: t.colors.inkMuted }}>Nothing needs attention.</Text>
        ) : null}
        {unassigned.length > 0 ? (
          <Text style={{ color: t.colors.ink, fontWeight: '700' }}>
            {unassigned.length} unassigned visit{unassigned.length === 1 ? '' : 's'} in the next 14
            days
          </Text>
        ) : null}
        {unassigned.slice(0, UNASSIGNED_PREVIEW_COUNT).map((v) => (
          <Pressable
            key={v.id}
            accessibilityRole="button"
            onPress={() => openVisit(v)}
            style={rowPress}
          >
            <Text style={{ color: t.colors.ink }}>
              {visitDayLabel(v)} · {v.client?.name ?? 'Client'} · {v.service?.name ?? 'Service'}
            </Text>
          </Pressable>
        ))}
        {missed.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/schedule' as Href)}
            style={rowPress}
          >
            <Text style={{ color: t.colors.danger, fontWeight: '700' }}>
              {missed.length} visit{missed.length === 1 ? '' : 's'} missed — review in Schedule
            </Text>
          </Pressable>
        ) : null}
        {notifLabel ? (
          <Text style={{ color: t.colors.warning, fontWeight: '700' }}>{notifLabel}</Text>
        ) : null}
        {declined.map((v) => (
          <Pressable
            key={`declined-${v.id}`}
            accessibilityRole="button"
            onPress={() => openVisit(v)}
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1, gap: 2 })}
          >
            <Text style={{ color: t.colors.ink }}>
              {v.client?.name ?? 'Client'} · {visitDayLabel(v)} · {visitTimeRange(v)}
            </Text>
            <Text style={{ color: t.colors.danger, fontSize: 12 }}>
              Declined: {v.decline_reason}
            </Text>
          </Pressable>
        ))}
      </PanelCard>

      <PanelCard title="Out on walks now" style={card}>
        {visits.isLoading ? <PanelSkeleton /> : null}
        {walks.length === 0 && !visits.isLoading ? (
          <Text style={{ color: t.colors.inkMuted }}>No one is out right now.</Text>
        ) : null}
        {walks.map((v) => {
          const pets = petNamesLabel(v.pet_ids, petNames.data);
          return (
            <Pressable
              key={v.id}
              accessibilityRole="button"
              onPress={() => openVisit(v)}
              style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1, gap: 2 })}
            >
              <Text style={{ color: t.colors.ink, fontWeight: '700' }}>
                {v.walker_id ? memberName(members.data ?? [], v.walker_id) : 'Team member'}
              </Text>
              <Text style={{ color: t.colors.inkMuted }}>
                {v.client?.name ?? 'Client'}
                {pets ? ` · ${pets}` : ''}
              </Text>
              <Text style={{ color: t.colors.inkMuted, fontSize: 12 }}>
                {startedAgoLabel(v.started_at, now)}
              </Text>
            </Pressable>
          );
        })}
      </PanelCard>
    </View>
  );
}
