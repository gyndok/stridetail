import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatInTimeZone } from 'date-fns-tz';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Linking, Share, Text } from 'react-native';

import { useActiveBusiness } from '@/src/features/business/active';
import { useMemberships } from '@/src/features/business/useMemberships';
import { joinPetNames, reportSmsBody, smsUrl } from '@/src/features/report/deviceSms';
import {
  cancelVisit,
  getVisit,
  listActiveMembers,
  memberName,
  offerVisit,
  pickerContext,
} from '@/src/features/schedule/api';
import {
  getVisitReport,
  listPetNames,
  reportLink,
  reportStatusLine,
  resendReport,
  revokeReport,
} from '@/src/features/schedule/report';
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

/**
 * Report card for a completed visit (Plan 4 Task 7): SMS delivery line,
 * Share link (the native share sheet includes Copy on both platforms —
 * expo-clipboard is not a dependency, so there is no separate Copy button;
 * recorded in DEVIATIONS.md), Resend and Revoke through the audited Task-1
 * owner RPCs, both behind Alert confirms.
 */
function ReportSection({
  businessId,
  visitId,
  tz,
  clientPhone,
  petIds,
  serviceName,
  businessName,
}: {
  businessId: string;
  visitId: string;
  tz: string;
  clientPhone: string | null;
  petIds: string[];
  serviceName: string | null;
  businessName: string;
}) {
  const t = useTheme();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const report = useQuery({
    queryKey: ['visitReport', businessId, visitId],
    queryFn: () => getVisitReport(businessId, visitId),
  });
  // Pet names for the device-composed SMS body (send-sms context parity).
  const petNames = useQuery({
    queryKey: ['reportPetNames', businessId, visitId],
    queryFn: () => listPetNames(petIds),
  });
  const refresh = () => {
    setError(null);
    void queryClient.invalidateQueries({ queryKey: ['visitReport', businessId, visitId] });
  };
  const fail = (e: unknown) => setError(e instanceof Error ? e.message : String(e));
  const resendMut = useMutation({ mutationFn: () => resendReport(visitId), onSuccess: refresh, onError: fail });
  const revokeMut = useMutation({ mutationFn: () => revokeReport(visitId), onSuccess: refresh, onError: fail });

  const r = report.data ?? null;
  if (!r) {
    return (
      <Card style={{ gap: t.space.xs }}>
        <Text style={[t.type.label, { color: t.colors.inkMuted }]}>Report</Text>
        <Text style={{ color: t.colors.inkMuted }}>
          {report.isPending ? 'Loading…' : 'No report for this visit.'}
        </Text>
      </Card>
    );
  }

  function confirmResend() {
    Alert.alert('Resend report', 'Send the report link to the client again by SMS?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Resend', onPress: () => resendMut.mutate() },
    ]);
  }
  function confirmRevoke() {
    Alert.alert(
      'Revoke report link',
      'The link stops working immediately for anyone who has it. This cannot be undone.',
      [
        { text: 'Keep link', style: 'cancel' },
        { text: 'Revoke', style: 'destructive', onPress: () => revokeMut.mutate() },
      ],
    );
  }

  return (
    <>
      <Card style={{ gap: t.space.xs }}>
        <Text style={[t.type.label, { color: t.colors.inkMuted }]}>Report</Text>
        {r.revoked_at ? (
          <Text style={{ color: t.colors.danger }}>
            Report link revoked {formatInTimeZone(new Date(r.revoked_at), tz, 'MMM d, HH:mm')}
          </Text>
        ) : (
          <Text style={{ color: t.colors.inkMuted }}>{reportStatusLine(r, tz)}</Text>
        )}
        {error ? <Text style={{ color: t.colors.danger }}>{error}</Text> : null}
      </Card>
      {!r.revoked_at ? (
        <>
          <Button
            title="Share link"
            variant="secondary"
            onPress={() => void Share.share({ message: reportLink(r.public_token) })}
          />
          {clientPhone ? (
            <Button
              title="Text the client"
              variant="secondary"
              onPress={() =>
                void Linking.openURL(
                  smsUrl(
                    clientPhone,
                    reportSmsBody(
                      businessName,
                      joinPetNames(petNames.data ?? []),
                      serviceName ?? 'scheduled',
                      reportLink(r.public_token),
                    ),
                  ),
                )
              }
            />
          ) : null}
          <Button title="Resend SMS" variant="secondary" onPress={confirmResend} loading={resendMut.isPending} />
          <Button title="Revoke link" variant="ghost" onPress={confirmRevoke} loading={revokeMut.isPending} />
        </>
      ) : null}
    </>
  );
}

export default function VisitDetail() {
  const t = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { businessId } = useActiveBusiness();
  const memberships = useMemberships();
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

      {v.status === 'completed' && businessId ? (
        <ReportSection
          businessId={businessId}
          visitId={v.id}
          tz={v.business_tz}
          clientPhone={v.client?.phones?.[0] ?? null}
          petIds={v.pet_ids}
          serviceName={v.service?.name ?? null}
          businessName={
            memberships.data?.find((m) => m.business_id === businessId)?.business.name ??
            'Your pet care team'
          }
        />
      ) : null}

      {error ? <Text style={{ color: t.colors.danger }}>{error}</Text> : null}
      {canCancel ? (
        <Button title="Cancel visit" variant="ghost" onPress={confirmCancel} loading={cancelMut.isPending} />
      ) : null}
    </Screen>
  );
}
