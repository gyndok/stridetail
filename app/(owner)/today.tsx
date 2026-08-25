import { useQuery } from '@tanstack/react-query';
import { useRouter, type Href } from 'expo-router';
import { Pressable, Text } from 'react-native';

import { useSession } from '@/src/features/auth/session';
import { useActiveBusiness } from '@/src/features/business/active';
import {
  listProblemNotifications,
  listVisits,
  notificationIssueLabel,
  pickUpNext,
  restOfDay,
  visitDayLabel,
  visitTimeRange,
  type Visit,
} from '@/src/features/schedule/api';
import { InlineNextAction, UpNextHero } from '@/src/features/schedule/UpNextHero';
import { VisitCard } from '@/src/features/schedule/VisitCard';
import { useRefetchOnFocus } from '@/src/lib/useRefetchOnFocus';
import { Button } from '@/src/ui/Button';
import { Card } from '@/src/ui/Card';
import { Screen } from '@/src/ui/Screen';
import { useTheme } from '@/src/ui/theme';

// Owner Today (Today/navigation redesign, part B): needs-attention strip only
// when non-empty, then the "Up next" hero for the owner's OWN next visit, then
// the rest of their own day. The business-wide view lives in Schedule — the
// by-walker Team grouping and the "My visits" mode toggle are gone.
//
// One query serves everything: 26h back catches all of today's local day in
// any tz (24h day + DST hour, with margin); 14 days forward matches the
// schedule list's upcoming window for the needs-attention triage, and gives
// the hero its any-day-forward reach.
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
  const { userId } = useSession();
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
  // Undelivered notifications (dormant-sms rows excluded in the query) —
  // owner-select RLS, so this query exists only on the owner Today (walkers
  // would read zero rows anyway).
  const notifications = useQuery({
    queryKey: ['notifications', businessId, 'problems'],
    enabled: !!businessId,
    queryFn: () => listProblemNotifications(businessId!),
  });
  useRefetchOnFocus(visits.refetch);

  const all = visits.data ?? [];
  const unassignedCount = all.filter((v) => v.status === 'unassigned').length;
  const declined = all.filter((v) => v.decline_reason != null && v.status === 'unassigned');
  const notifLabel = notificationIssueLabel(notifications.data ?? []);
  const attention = unassignedCount > 0 || declined.length > 0 || !!notifLabel;

  // Hero + rest-of-day are the owner's OWN visits: the owner query is the
  // business-wide listVisits, filtered client-side to the session user.
  const own = userId ? all.filter((v) => v.walker_id === userId) : [];
  const now = new Date();
  const hero = pickUpNext(own, now);
  const rest = restOfDay(own, now, hero?.id ?? null);

  const openVisit = (v: Visit) => router.push(`/schedule/${v.id}` as Href);

  return (
    <Screen title="Today">
      {visits.isLoading ? <Text style={{ color: t.colors.inkMuted }}>Loading…</Text> : null}

      {/* Needs attention — rendered only when there is something to triage. */}
      {attention ? (
        <>
          <Text style={[t.type.title, { color: t.colors.ink }]}>Needs attention</Text>
          <Card style={{ gap: t.space.sm }}>
            {unassignedCount > 0 || declined.length > 0 ? (
              <Text style={{ color: t.colors.ink, fontWeight: '700' }}>
                {unassignedCount} unassigned visit{unassignedCount === 1 ? '' : 's'} in the next 14 days
              </Text>
            ) : null}
            {notifLabel ? <Text style={{ color: t.colors.warning, fontWeight: '700' }}>{notifLabel}</Text> : null}
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
        </>
      ) : null}

      {/* "Up next" hero — the owner's own next visit, any day forward. */}
      {hero ? (
        <UpNextHero
          visit={hero}
          userId={userId}
          isOwnerRole
          businessId={businessId}
          detailHref={`/schedule/${hero.id}` as Href}
        />
      ) : !visits.isLoading ? (
        <>
          <Text style={[t.type.title, { color: t.colors.ink }]}>Up next</Text>
          <Text style={{ color: t.colors.inkMuted }}>No upcoming visits of your own.</Text>
        </>
      ) : null}

      <Text style={[t.type.title, { color: t.colors.ink }]}>Rest of your day</Text>
      {visits.isLoading ? (
        <Text style={{ color: t.colors.inkMuted }}>Loading…</Text>
      ) : rest.length === 0 ? (
        <Text style={{ color: t.colors.inkMuted }}>Nothing else scheduled today.</Text>
      ) : (
        rest.map((v) => (
          <VisitCard
            key={v.id}
            visit={v}
            statusLabel={STATUS_LABELS[v.status] ?? v.status}
            onPress={() => openVisit(v)}
            action={
              <InlineNextAction visit={v} userId={userId} isOwnerRole businessId={businessId} />
            }
          >
            {/* Round 0: the client and pet profile is one tap from Today,
                not only from the visit detail. */}
            <Button
              title="Client & pets"
              variant="ghost"
              onPress={() => router.push(`/clients/${v.client_id}` as Href)}
            />
          </VisitCard>
        ))
      )}
    </Screen>
  );
}
