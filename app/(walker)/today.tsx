import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Platform, Text, View } from 'react-native';

import { useActiveBusiness } from '@/src/features/business/active';
import { useMemberships } from '@/src/features/business/useMemberships';
import {
  acceptVisit,
  declineVisit,
  listMyVisits,
  partitionWalkerDay,
  type Visit,
} from '@/src/features/schedule/api';
import { VisitCard } from '@/src/features/schedule/VisitCard';
import { recoverActiveVisit } from '@/src/lib/gps/controller';
import { useRefetchOnFocus } from '@/src/lib/useRefetchOnFocus';
import { Button } from '@/src/ui/Button';
import { Card } from '@/src/ui/Card';
import { Screen } from '@/src/ui/Screen';
import { TextField } from '@/src/ui/TextField';
import { useTheme } from '@/src/ui/theme';

// Window: 26h back covers "earlier today" in any tz (24h local day + DST
// fall-back hour, with margin); 70 days forward covers the 8-week series
// expansion horizon so every open offer is in view.
const LOOKBACK_MS = 26 * 3_600_000;
const LOOKAHEAD_MS = 70 * 86_400_000;
// How long the green "accepted" confirmation stays up before it clears itself.
const ACCEPTED_BANNER_MS = 5_000;

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export default function Today() {
  const t = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { businessId } = useActiveBusiness();
  const memberships = useMemberships();
  const isOwner =
    memberships.data?.find((m) => m.business_id === businessId)?.role === 'owner';
  const [error, setError] = useState<string | null>(null);
  // Inline decline form (works on Android too — Alert.prompt is iOS-only).
  const [decliningId, setDecliningId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  // Green confirmation after an accept (Round 0) — the accepted offer vanishes
  // from the list, so without this nothing tells the walker it landed.
  const [accepted, setAccepted] = useState<string | null>(null);
  useEffect(() => {
    if (!accepted) return;
    const timer = setTimeout(() => setAccepted(null), ACCEPTED_BANNER_MS);
    return () => clearTimeout(timer);
  }, [accepted]);

  // Recovery (Plan 4 Task 5): a locally in_progress visit (active_visit row)
  // re-registers its GPS task and surfaces a resume banner here — never an
  // auto-navigation from the root layout (recorded in DEVIATIONS). Re-checked
  // on every focus so the banner clears once the visit finishes.
  const [activeVisitId, setActiveVisitId] = useState<string | null>(null);
  useFocusEffect(
    useCallback(() => {
      if (Platform.OS === 'web') return;
      recoverActiveVisit()
        .then((r) => setActiveVisitId(r?.visitId ?? null))
        .catch(() => setActiveVisitId(null));
    }, []),
  );

  const visits = useQuery({
    queryKey: ['myVisits', businessId],
    enabled: !!businessId,
    queryFn: () =>
      listMyVisits(businessId!, new Date(Date.now() - LOOKBACK_MS), new Date(Date.now() + LOOKAHEAD_MS)),
  });
  useRefetchOnFocus(visits.refetch);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['myVisits', businessId] });
    void queryClient.invalidateQueries({ queryKey: ['visits', businessId] });
  };
  const acceptMut = useMutation({
    // The whole visit goes in so the confirmation can name the client — the
    // row leaves the offers list as soon as the queries invalidate.
    mutationFn: (v: Visit) => acceptVisit(v.id).then(() => v),
    onSuccess: (v) => {
      setError(null);
      setAccepted(v.client?.name ?? 'The visit');
      invalidate();
    },
    onError: (e) => setError(errorText(e)),
  });
  const declineMut = useMutation({
    mutationFn: (input: { id: string; reason: string }) => declineVisit(input.id, input.reason),
    onSuccess: () => {
      setError(null);
      setDecliningId(null);
      setReason('');
      invalidate();
    },
    onError: (e) => setError(errorText(e)),
  });

  const { offers, today } = partitionWalkerDay(visits.data ?? [], new Date());
  const busy = acceptMut.isPending || declineMut.isPending;

  return (
    <Screen title="Today">
      {isOwner ? (
        <Button
          title="Owner view"
          variant="secondary"
          onPress={() => router.push('/(owner)/today' as Href)}
        />
      ) : null}
      {error ? <Text style={{ color: t.colors.danger }}>{error}</Text> : null}

      {accepted ? (
        <Card style={{ backgroundColor: t.colors.greenSoft }}>
          <Text style={{ color: t.colors.green, fontWeight: '800' }}>
            Accepted — {accepted} is on your schedule.
          </Text>
        </Card>
      ) : null}

      {activeVisitId ? (
        <Card style={{ gap: t.space.sm }}>
          <Text style={{ color: t.colors.ink, fontWeight: '700' }}>
            A visit is still in progress.
          </Text>
          <Button
            title="Resume active visit"
            onPress={() => router.push(`/visit/${activeVisitId}/active` as Href)}
          />
        </Card>
      ) : null}

      <Text style={[t.type.title, { color: t.colors.ink }]}>Offers</Text>
      {visits.isLoading ? (
        <Text style={{ color: t.colors.inkMuted }}>Loading…</Text>
      ) : offers.length === 0 ? (
        <Text style={{ color: t.colors.inkMuted }}>No offers right now.</Text>
      ) : (
        offers.map((v) => (
          <VisitCard key={v.id} visit={v} showDay>
            {decliningId === v.id ? (
              <View style={{ gap: t.space.sm }}>
                <TextField
                  label="Reason"
                  value={reason}
                  onChangeText={setReason}
                  placeholder="Why can't you take this visit?"
                  autoFocus
                />
                <Button
                  title="Confirm decline"
                  onPress={() => declineMut.mutate({ id: v.id, reason: reason.trim() })}
                  disabled={!reason.trim() || busy}
                  loading={declineMut.isPending}
                />
                <Button
                  title="Keep offer"
                  variant="ghost"
                  onPress={() => {
                    setDecliningId(null);
                    setReason('');
                  }}
                />
              </View>
            ) : (
              <View style={{ gap: t.space.sm }}>
                {/* Round 0: every Today card reaches the visit — an offer card
                    carries its own link rather than a card-wide press, so the
                    Accept/Decline taps below are never ambiguous. */}
                <Button
                  title="View details"
                  variant="secondary"
                  onPress={() => router.push(`/visit/${v.id}` as Href)}
                />
                <Button
                  title="Accept"
                  onPress={() => acceptMut.mutate(v)}
                  disabled={busy}
                  loading={acceptMut.isPending && acceptMut.variables?.id === v.id}
                />
                <Button
                  title="Decline"
                  variant="ghost"
                  onPress={() => {
                    setDecliningId(v.id);
                    setReason('');
                  }}
                  disabled={busy}
                />
              </View>
            )}
          </VisitCard>
        ))
      )}

      <Text style={[t.type.title, { color: t.colors.ink }]}>Today</Text>
      {visits.isLoading ? (
        <Text style={{ color: t.colors.inkMuted }}>Loading…</Text>
      ) : today.length === 0 ? (
        <Text style={{ color: t.colors.inkMuted }}>Nothing scheduled today.</Text>
      ) : (
        today.map((v) => (
          <VisitCard
            key={v.id}
            visit={v}
            onPress={() => router.push(`/visit/${v.id}` as Href)}
          />
        ))
      )}
    </Screen>
  );
}
