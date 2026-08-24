import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatInTimeZone } from 'date-fns-tz';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Text } from 'react-native';

import { useActiveBusiness } from '@/src/features/business/active';
import {
  cancelVisit,
  getVisit,
  listActiveMembers,
  memberName,
  offerVisit,
  pickerContext,
} from '@/src/features/schedule/api';
import { WalkerPicker } from '@/src/features/schedule/WalkerPicker';
import { useRefetchOnFocus } from '@/src/lib/useRefetchOnFocus';
import { canTransition } from '@/src/lib/schedule/machine';
import { Button } from '@/src/ui/Button';
import { Card } from '@/src/ui/Card';
import { Screen } from '@/src/ui/Screen';
import { useTheme } from '@/src/ui/theme';

const STATUS_LABELS: Record<string, string> = {
  unassigned: 'Unassigned',
  offered: 'Offered',
  accepted: 'Accepted',
  in_progress: 'In progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export default function VisitDetail() {
  const t = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { businessId } = useActiveBusiness();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [pickedWalker, setPickedWalker] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const visit = useQuery({
    queryKey: ['visit', businessId, id],
    enabled: !!businessId && !!id,
    queryFn: () => getVisit(businessId!, id!),
  });
  const members = useQuery({
    queryKey: ['scheduleMembers', businessId],
    enabled: !!businessId,
    queryFn: () => listActiveMembers(businessId!),
  });
  const v = visit.data ?? null;
  const ctx = useQuery({
    queryKey: ['pickerCtx', businessId, v?.scheduled_start, v?.scheduled_end],
    enabled: !!businessId && !!v,
    queryFn: () => pickerContext(businessId!, new Date(v!.scheduled_start), new Date(v!.scheduled_end)),
  });
  useRefetchOnFocus(visit.refetch);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['visit', businessId, id] });
    void queryClient.invalidateQueries({ queryKey: ['visits', businessId] });
  };
  const offerMut = useMutation({
    mutationFn: (walkerId: string) => offerVisit(id!, walkerId),
    onSuccess: () => {
      setPickedWalker(null);
      setError(null);
      invalidate();
    },
    onError: (e) => setError(e instanceof Error ? e.message : String(e)),
  });
  const cancelMut = useMutation({
    mutationFn: () => cancelVisit(id!),
    onSuccess: () => {
      invalidate();
      router.back();
    },
    onError: (e) => setError(e instanceof Error ? e.message : String(e)),
  });

  if (!v) {
    return (
      <Screen title="Visit">
        {visit.error ? (
          <Text style={{ color: t.colors.danger }}>
            {visit.error instanceof Error ? visit.error.message : String(visit.error)}
          </Text>
        ) : (
          <Text style={{ color: t.colors.inkMuted }}>Loading…</Text>
        )}
      </Screen>
    );
  }

  // Owner-side gates from the shared machine mirror (isAssignee is irrelevant
  // to the owner-guarded edges used here).
  const owner = { role: 'owner' as const, isAssignee: false };
  const canOffer = canTransition(v.status, 'offered', owner);
  const canCancel = canTransition(v.status, 'cancelled', owner);

  const day = formatInTimeZone(new Date(v.scheduled_start), v.business_tz, 'EEEE, MMM d, yyyy');
  const start = formatInTimeZone(new Date(v.scheduled_start), v.business_tz, 'HH:mm');
  const end = formatInTimeZone(new Date(v.scheduled_end), v.business_tz, 'HH:mm');

  function confirmCancel() {
    Alert.alert('Cancel visit', 'Cancel this visit? The walker will no longer see it.', [
      { text: 'Keep visit', style: 'cancel' },
      { text: 'Cancel visit', style: 'destructive', onPress: () => cancelMut.mutate() },
    ]);
  }

  return (
    <Screen title={v.client?.name ?? 'Visit'}>
      <Card style={{ gap: t.space.xs }}>
        <Text style={[t.type.body, { color: t.colors.ink, fontWeight: '700' }]}>{day}</Text>
        <Text style={{ color: t.colors.ink }}>
          {start} – {end} ({v.business_tz})
        </Text>
        <Text style={{ color: t.colors.inkMuted }}>
          {v.service?.name ?? 'Service'}
          {v.service ? ` · ${v.service.duration_min} min` : ''}
        </Text>
        <Text style={{ color: t.colors.inkMuted }}>Status: {STATUS_LABELS[v.status] ?? v.status}</Text>
        <Text style={{ color: t.colors.inkMuted }}>
          Walker: {v.walker_id ? memberName(members.data ?? [], v.walker_id) : 'Unassigned'}
        </Text>
        {v.decline_reason ? (
          <Text style={{ color: t.colors.danger }}>Declined: {v.decline_reason}</Text>
        ) : null}
        {v.owner_notes_md ? <Text style={{ color: t.colors.ink }}>{v.owner_notes_md}</Text> : null}
      </Card>

      {canOffer ? (
        <>
          <Text style={[t.type.title, { color: t.colors.ink }]}>
            {v.decline_reason ? 'Reassign' : 'Offer to a walker'}
          </Text>
          <WalkerPicker
            members={members.data ?? []}
            ctx={ctx.data ?? null}
            window={{ startUtc: new Date(v.scheduled_start), endUtc: new Date(v.scheduled_end) }}
            tz={v.business_tz}
            selectedId={pickedWalker}
            onSelect={setPickedWalker}
            excludeVisitId={v.id}
          />
          {pickedWalker ? (
            <Button
              title="Send offer"
              onPress={() => offerMut.mutate(pickedWalker)}
              loading={offerMut.isPending}
            />
          ) : null}
        </>
      ) : null}

      {error ? <Text style={{ color: t.colors.danger }}>{error}</Text> : null}
      {canCancel ? (
        <Button title="Cancel visit" variant="ghost" onPress={confirmCancel} loading={cancelMut.isPending} />
      ) : null}
    </Screen>
  );
}
