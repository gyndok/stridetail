import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { useActiveBusiness } from '@/src/features/business/active';
import { acceptVisit, declineVisit, listMyVisits, partitionWalkerDay } from '@/src/features/schedule/api';
import { VisitCard } from '@/src/features/schedule/VisitCard';
import { useRefetchOnFocus } from '@/src/lib/useRefetchOnFocus';
import { Button } from '@/src/ui/Button';
import { Screen } from '@/src/ui/Screen';
import { TextField } from '@/src/ui/TextField';
import { useTheme } from '@/src/ui/theme';

// Window: 26h back covers "earlier today" in any tz (24h local day + DST
// fall-back hour, with margin); 70 days forward covers the 8-week series
// expansion horizon so every open offer is in view.
const LOOKBACK_MS = 26 * 3_600_000;
const LOOKAHEAD_MS = 70 * 86_400_000;

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export default function Today() {
  const t = useTheme();
  const queryClient = useQueryClient();
  const { businessId } = useActiveBusiness();
  const [error, setError] = useState<string | null>(null);
  // Inline decline form (works on Android too — Alert.prompt is iOS-only).
  const [decliningId, setDecliningId] = useState<string | null>(null);
  const [reason, setReason] = useState('');

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
    mutationFn: (id: string) => acceptVisit(id),
    onSuccess: () => {
      setError(null);
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
      {error ? <Text style={{ color: t.colors.danger }}>{error}</Text> : null}

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
                <Button
                  title="Accept"
                  onPress={() => acceptMut.mutate(v.id)}
                  disabled={busy}
                  loading={acceptMut.isPending && acceptMut.variables === v.id}
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
        today.map((v) => <VisitCard key={v.id} visit={v} />)
      )}
    </Screen>
  );
}
