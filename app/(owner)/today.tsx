import { useQuery } from '@tanstack/react-query';
import { useRouter, type Href } from 'expo-router';
import { Platform, Pressable, Text, useWindowDimensions } from 'react-native';

import { useSession } from '@/src/features/auth/session';
import { decideTodayVariant } from '@/src/features/dashboard/gate';
import { OwnerDashboard } from '@/src/features/dashboard/OwnerDashboard';
import { useActiveBusiness } from '@/src/features/business/active';
import {
  listProblemNotifications,
  listVisits,
  missedVisits,
  notificationIssueLabel,
  pickUpNext,
  restOfDay,
  visitDayLabel,
  visitTimeRange,
  type Visit,
} from '@/src/features/schedule/api';
import { listPendingBookingRequests } from '@/src/features/portal/requestsApi';
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

// Plan 8b Task 1: on desktop web the owner Today IS the dashboard. The gate
// is live-responsive (useWindowDimensions) and pure (gate.ts); below 1024 and
// on native, MobileToday below renders exactly as before.
export default function Today() {
  const { width } = useWindowDimensions();
  if (decideTodayVariant(Platform.OS, width) === 'dashboard') return <OwnerDashboard />;
  return <MobileToday />;
}

function MobileToday() {
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
  // Plan 8 Task 7: pending booking requests join the needs-attention triage.
  const bookingRequests = useQuery({
    queryKey: ['booking-requests', businessId, 'pending'],
    enabled: !!businessId,
    queryFn: () => listPendingBookingRequests(businessId!),
  });
  useRefetchOnFocus(visits.refetch);

  const all = visits.data ?? [];
  const now = new Date();
  const unassignedCount = all.filter((v) => v.status === 'unassigned').length;
  const declined = all.filter((v) => v.decline_reason != null && v.status === 'unassigned');
  // Missed = accepted/offered whose window passed > 1 h ago without a start
  // (Plan 6 Task 4 backlog item); bounded by the query's 26 h lookback.
  const missed = missedVisits(all, now);
  const notifLabel = notificationIssueLabel(notifications.data ?? []);
  const pendingRequests = bookingRequests.data?.length ?? 0;
  const attention =
    unassignedCount > 0 ||
    declined.length > 0 ||
    missed.length > 0 ||
    !!notifLabel ||
    pendingRequests > 0;

  // Hero + rest-of-day are the owner's OWN visits: the owner query is the
  // business-wide listVisits, filtered client-side to the session user.
  const own = userId ? all.filter((v) => v.walker_id === userId) : [];
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
            {missed.length > 0 ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push('/schedule' as Href)}
                style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
              >
                <Text style={{ color: t.colors.danger, fontWeight: '700' }}>
                  {missed.length} visit{missed.length === 1 ? '' : 's'} missed — review in Schedule
                </Text>
              </Pressable>
            ) : null}
            {notifLabel ? <Text style={{ color: t.colors.warning, fontWeight: '700' }}>{notifLabel}</Text> : null}
            {pendingRequests > 0 ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push('/requests' as Href)}
                style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
              >
                <Text style={{ color: t.colors.warning, fontWeight: '700' }}>
                  {pendingRequests} service request{pendingRequests === 1 ? '' : 's'} awaiting review
                </Text>
              </Pressable>
            ) : null}
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
