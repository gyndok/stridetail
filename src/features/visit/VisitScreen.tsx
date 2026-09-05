import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatInTimeZone } from 'date-fns-tz';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { Alert, Linking, Platform, Pressable, Share, Text, View } from 'react-native';

import { useSession } from '@/src/features/auth/session';
import { isVisitInvoiced } from '@/src/features/billing/api';
import { useActiveBusiness } from '@/src/features/business/active';
import { useMemberships } from '@/src/features/business/useMemberships';
import { marketingPhotosView } from '@/src/features/clients/api';
import { reproLine } from '@/src/features/pets/helpers';
import { telUrl } from '@/src/features/clients/form';
import { petPhotoUrl } from '@/src/features/pets/api';
import { joinPetNames, reportSmsBody, smsUrl } from '@/src/features/report/deviceSms';
import {
  cancelVisit,
  listActiveMembers,
  memberName,
  offerVisit,
  pickerContext,
} from '@/src/features/schedule/api';
import {
  getReportEmailStatus,
  getVisitReport,
  listPetNames,
  reportLink,
  reportStatusLine,
  resendReport,
  revokeReport,
} from '@/src/features/schedule/report';
import { WalkerPicker } from '@/src/features/schedule/WalkerPicker';
import { appendVisitStart } from '@/src/features/visit/api';
import {
  canStart,
  fetchVisitDetail,
  mapsUrl,
  petInstructionRows,
  type VisitDetail,
  type VisitPetInfo,
} from '@/src/features/visit/detail';
import { fetchVisitRoute } from '@/src/features/visit/track';
import { WalkMap } from '@/src/features/visit/WalkMap';
import { startVisitTracking } from '@/src/lib/gps/controller';
import { kickSync } from '@/src/lib/offline/sync';
import { canTransition } from '@/src/lib/schedule/machine';
import { useRefetchOnFocus } from '@/src/lib/useRefetchOnFocus';
import { Button } from '@/src/ui/Button';
import { Card } from '@/src/ui/Card';
import { BillingIcon, LockIcon } from '@/src/ui/icons';
import { Screen } from '@/src/ui/Screen';
import { useTheme } from '@/src/ui/theme';

/**
 * Unified visit screen (Today/navigation redesign, part A). One screen per
 * visit for every user: the execution block renders when the session user IS
 * the visit's assignee, the management block when they hold the owner role in
 * the active business, and an owner-assignee (their own visit) sees both.
 * Mounted from BOTH route groups — app/(walker)/visit/[id]/index.tsx and
 * app/(owner)/schedule/[id].tsx are thin wrappers around this component.
 *
 * Data comes from fetchVisitDetail, which works under both roles' RLS: the
 * visits read names columns (MY_VISIT_COLUMNS — price column grant), clients/
 * pets resolve via the owner policies or the walker visit-visibility policies,
 * and the service comes from the price-free services_public definer view.
 * Owner-only context (roster, picker availability, report) loads
 * conditionally so walker sessions never issue owner-policy queries.
 */

function errorText(e: unknown): string {
  if (e instanceof Error) return e.message;
  // Supabase Postgrest/Storage errors are plain objects with .message — never
  // let them stringify to "[object Object]" (Alexandria's round-5b report).
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message);
  return String(e);
}

const STATUS_LABEL: Record<string, string> = {
  unassigned: 'Unassigned',
  offered: 'Offered',
  accepted: 'Accepted',
  in_progress: 'In progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

/** The active screen exists only in the walker group; the path is absolute so
 * it works from BOTH mount points (the owner group has no active route). */
const activeHref = (visitId: string): Href => `/(walker)/visit/${visitId}/active` as Href;

/**
 * One pet's info, inline on the visit screen (walkers have no pet-profile
 * route — the owner one lives behind the owner-group role guard).
 */
function PetSection({ pet }: { pet: VisitPetInfo }) {
  const t = useTheme();
  const photo = useQuery({
    queryKey: ['pet-photo', pet.photo_path],
    enabled: !!pet.photo_path,
    queryFn: () => petPhotoUrl(pet.photo_path!),
    staleTime: 55 * 60 * 1000, // signed for 1 h; never serve an expired url
  });
  const rows = petInstructionRows(pet);
  const speciesLine = [pet.species, pet.breed].filter(Boolean).join(' · ');
  const repro = reproLine(pet.sex, pet.fixed, pet.last_heat);
  return (
    <Card style={{ gap: t.space.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space.md }}>
        {photo.data ? (
          <Image
            source={{ uri: photo.data }}
            style={{ width: 56, height: 56, borderRadius: 28 }}
            contentFit="cover"
            accessibilityLabel={`Photo of ${pet.name}`}
          />
        ) : null}
        <View style={{ flexShrink: 1 }}>
          <Text style={[t.type.body, { color: t.colors.ink, fontWeight: '700' }]}>{pet.name}</Text>
          {speciesLine ? <Text style={{ color: t.colors.inkMuted }}>{speciesLine}</Text> : null}
          {repro ? (
            <Text
              style={{
                color: repro.intact ? t.colors.warning : t.colors.inkMuted,
                fontWeight: repro.intact ? '700' : '400',
              }}
            >
              {repro.text}
            </Text>
          ) : null}
        </View>
      </View>
      {pet.reactivity_md ? (
        <View
          style={{
            borderWidth: 2,
            borderColor: t.colors.warning,
            borderRadius: t.radius.card,
            padding: t.space.md,
            gap: t.space.xs,
          }}
        >
          <Text style={[t.type.label, { color: t.colors.warning }]}>Reactivity</Text>
          <Text style={{ color: t.colors.ink }}>{pet.reactivity_md}</Text>
        </View>
      ) : null}
      {rows.map((r) => (
        <View key={r.label} style={{ gap: 2 }}>
          <Text style={[t.type.label, { color: t.colors.inkMuted }]}>{r.label}</Text>
          <Text style={{ color: t.colors.ink }}>{r.value}</Text>
        </View>
      ))}
      {rows.length === 0 && !pet.reactivity_md ? (
        <Text style={{ color: t.colors.inkMuted }}>No instructions on file</Text>
      ) : null}
    </Card>
  );
}

/**
 * Report card for a completed visit (moved intact from the old owner
 * schedule/[id].tsx): email delivery line (the live channel — sms is dormant),
 * Share link, device-composed Text, Resend email and Revoke through the
 * audited owner RPCs behind inline web-safe confirms.
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
  // Delivery state of the report EMAIL (latest visit_finished email row).
  const emailStatus = useQuery({
    queryKey: ['visitReportEmail', businessId, visitId],
    queryFn: () => getReportEmailStatus(businessId, visitId),
  });
  // Pet names for the device-composed SMS body (sender context parity).
  const petNames = useQuery({
    queryKey: ['reportPetNames', businessId, visitId],
    queryFn: () => listPetNames(petIds),
  });
  // Alert.alert buttons no-op on web (team.tsx lesson) — confirm inline.
  const [confirming, setConfirming] = useState<'resend' | 'revoke' | null>(null);
  const refresh = () => {
    setError(null);
    setConfirming(null);
    void queryClient.invalidateQueries({ queryKey: ['visitReport', businessId, visitId] });
    void queryClient.invalidateQueries({ queryKey: ['visitReportEmail', businessId, visitId] });
  };
  const fail = (e: unknown) => setError(errorText(e));
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

  return (
    <>
      <Card style={{ gap: t.space.xs }}>
        <Text style={[t.type.label, { color: t.colors.inkMuted }]}>Report</Text>
        {r.revoked_at ? (
          <Text style={{ color: t.colors.danger }}>
            Report link revoked {formatInTimeZone(new Date(r.revoked_at), tz, 'MMM d, HH:mm')}
          </Text>
        ) : emailStatus.isPending ? (
          <Text style={{ color: t.colors.inkMuted }}>Email: checking…</Text>
        ) : (
          <Text style={{ color: t.colors.inkMuted }}>{reportStatusLine(emailStatus.data ?? null, tz)}</Text>
        )}
        {error ? <Text style={{ color: t.colors.danger }}>{error}</Text> : null}
      </Card>
      {!r.revoked_at ? (
        <>
          <Button
            title="View report"
            variant="secondary"
            onPress={() => void Linking.openURL(reportLink(r.public_token))}
          />
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
          {confirming === 'resend' ? (
            <Card style={{ gap: t.space.sm }}>
              <Text style={{ color: t.colors.ink }}>
                Send the report link to the client again by email?
              </Text>
              <Button title="Resend" onPress={() => resendMut.mutate()} loading={resendMut.isPending} />
              <Button title="Cancel" variant="ghost" onPress={() => setConfirming(null)} />
            </Card>
          ) : (
            <Button title="Resend email" variant="secondary" onPress={() => setConfirming('resend')} />
          )}
          {confirming === 'revoke' ? (
            <Card style={{ gap: t.space.sm }}>
              <Text style={{ color: t.colors.ink }}>
                The link stops working immediately for anyone who has it. This cannot be undone.
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => revokeMut.mutate()}
                disabled={revokeMut.isPending}
                hitSlop={8}
                style={{ alignSelf: 'center', paddingVertical: t.space.sm }}
              >
                <Text style={{ color: t.colors.danger, fontWeight: '700' }}>
                  {revokeMut.isPending ? 'Revoking…' : 'Really revoke'}
                </Text>
              </Pressable>
              <Button title="Keep link" variant="ghost" onPress={() => setConfirming(null)} />
            </Card>
          ) : (
            <Button title="Revoke link" variant="ghost" onPress={() => setConfirming('revoke')} />
          )}
        </>
      ) : null}
    </>
  );
}

export default function VisitScreen() {
  const t = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { userId } = useSession();
  const { businessId } = useActiveBusiness();
  const memberships = useMemberships();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [pickedWalker, setPickedWalker] = useState<string | null>(null);
  const [manageError, setManageError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  // Role in the active business decides the management block; being the
  // visit's walker_id decides the execution block. Both may be true.
  const isOwnerRole =
    memberships.data?.find((m) => m.business_id === businessId)?.role === 'owner';

  const detail = useQuery({
    queryKey: ['visitDetail', id],
    enabled: !!id,
    queryFn: () => fetchVisitDetail(id!),
  });
  useRefetchOnFocus(detail.refetch);

  const d = detail.data;
  const v = d?.visit ?? null;
  const isAssignee = !!v?.walker_id && !!userId && v.walker_id === userId;

  // Owner-only context: roster + availability live behind owner select
  // policies, so these never fire for a plain walker session.
  const members = useQuery({
    queryKey: ['scheduleMembers', businessId],
    enabled: !!businessId && isOwnerRole,
    queryFn: () => listActiveMembers(businessId!),
  });
  const ctx = useQuery({
    queryKey: ['pickerCtx', businessId, v?.scheduled_start, v?.scheduled_end],
    enabled: !!businessId && isOwnerRole && !!v,
    queryFn: () => pickerContext(businessId!, new Date(v!.scheduled_start), new Date(v!.scheduled_end)),
  });
  // Owner-only billing entry: only a completed, not-yet-invoiced visit offers
  // "Add to an invoice" (invoice_items is owner-RLS'd — never a walker query).
  const invoiced = useQuery({
    queryKey: ['visitInvoiced', businessId, v?.id],
    enabled: !!businessId && isOwnerRole && v?.status === 'completed',
    queryFn: () => isVisitInvoiced(businessId!, v!.id),
  });
  // Completed-visit route map (Plan 7b Task 3): both roles' RLS can read
  // visit_tracks/visit_events for their own visits. Native only — the maps
  // module has no web build, so the fetch is skipped there too.
  const route = useQuery({
    queryKey: ['visitRoute', v?.id],
    enabled: Platform.OS !== 'web' && !!v && v.status === 'completed' && (isAssignee || isOwnerRole),
    staleTime: 5 * 60 * 1000, // a finished walk's track never changes
    queryFn: () => fetchVisitRoute(v!.id),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['visitDetail', id] });
    void queryClient.invalidateQueries({ queryKey: ['visits', businessId] });
    void queryClient.invalidateQueries({ queryKey: ['myVisits'] });
  };
  const offerMut = useMutation({
    mutationFn: (walkerId: string) => offerVisit(id!, walkerId),
    onSuccess: () => {
      setPickedWalker(null);
      setManageError(null);
      invalidate();
    },
    onError: (e) => setManageError(errorText(e)),
  });
  const cancelMut = useMutation({
    mutationFn: () => cancelVisit(id!),
    onSuccess: () => {
      invalidate();
      router.back();
    },
    onError: (e) => setManageError(errorText(e)),
  });
  // Alert.alert buttons no-op on web (team.tsx lesson) — cancel confirms inline.
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);

  const gate = v ? canStart(v.status) : null;

  const onStart = async () => {
    if (!d || !v) return;
    setStarting(true);
    setStartError(null);
    try {
      // Outbox first (spec §8): the start lands locally and syncs in order.
      await appendVisitStart(v.id);
      // Optimistic local status; the server catches up via the sync worker.
      queryClient.setQueryData<VisitDetail>(['visitDetail', id], (old) =>
        old ? { ...old, visit: { ...old.visit, status: 'in_progress' } } : old,
      );
      void queryClient.invalidateQueries({ queryKey: ['myVisits'] });
      if (d.service?.requires_gps) {
        try {
          await startVisitTracking(v.id);
        } catch (e) {
          // Permission denied: the visit is still started — only the route is
          // lost. Native keeps the Alert (it floats above the navigation that
          // follows); web gets inline text since Alert never renders there.
          if (Platform.OS === 'web') {
            setStartError(
              `GPS not recording — ${errorText(e)}. The visit has still started; the route will not be recorded.`,
            );
          } else {
            Alert.alert(
              'GPS not recording',
              `${errorText(e)}\n\nThe visit has still started; the route will not be recorded.`,
            );
          }
        }
      }
      kickSync();
      router.replace(activeHref(v.id));
    } catch (e) {
      setStartError(errorText(e));
    } finally {
      setStarting(false);
    }
  };

  if (!v) {
    return (
      <Screen title="Visit">
        <Button title="Back" variant="ghost" onPress={() => router.back()} />
        {detail.error ? (
          <Text style={{ color: t.colors.danger }}>{errorText(detail.error)}</Text>
        ) : (
          <Text style={{ color: t.colors.inkMuted }}>Loading…</Text>
        )}
      </Screen>
    );
  }

  // Owner-side gates from the shared machine mirror (isAssignee is irrelevant
  // to the owner-guarded edges used here).
  const owner = { role: 'owner' as const, isAssignee: false };
  const canOffer = isOwnerRole && canTransition(v.status, 'offered', owner);
  const canCancel = isOwnerRole && canTransition(v.status, 'cancelled', owner);

  const day = formatInTimeZone(new Date(v.scheduled_start), v.business_tz, 'EEEE, MMM d, yyyy');
  const start = formatInTimeZone(new Date(v.scheduled_start), v.business_tz, 'HH:mm');
  const end = formatInTimeZone(new Date(v.scheduled_end), v.business_tz, 'HH:mm');
  const businessName =
    memberships.data?.find((m) => m.business_id === businessId)?.business.name ??
    'Your pet care team';

  return (
    <Screen title={d?.client?.name ?? v.client?.name ?? 'Visit'}>
      <Button title="Back" variant="ghost" onPress={() => router.back()} />

      {/* ---- Header: client, day/time in business_tz, service, status ---- */}
      <Card style={{ gap: t.space.xs }}>
        <Text style={[t.type.body, { color: t.colors.ink, fontWeight: '700' }]}>{day}</Text>
        <Text style={{ color: t.colors.ink }}>
          {start} – {end} ({v.business_tz})
        </Text>
        <Text style={{ color: t.colors.inkMuted }}>
          {d?.service?.name ?? v.service?.name ?? 'Service'}
          {d?.service ? ` · ${d.service.duration_min} min` : ''}
        </Text>
        <Text style={{ color: t.colors.inkMuted }}>Status: {STATUS_LABEL[v.status] ?? v.status}</Text>
        {isOwnerRole ? (
          <Text style={{ color: t.colors.inkMuted }}>
            Walker: {v.walker_id ? memberName(members.data ?? [], v.walker_id) : 'Unassigned'}
          </Text>
        ) : null}
        {v.decline_reason ? (
          <Text style={{ color: t.colors.danger }}>Declined: {v.decline_reason}</Text>
        ) : null}
        {v.owner_notes_md ? <Text style={{ color: t.colors.ink }}>{v.owner_notes_md}</Text> : null}
      </Card>

      {/* ---- Route map for completed walks (Plan 7b Task 3): interactive
           Apple Maps with the tracked polyline + event pins. Falls back to
           nothing — today's UI — on binaries without the native module. ---- */}
      {v.status === 'completed' && route.data && route.data.track.length >= 2 ? (
        <WalkMap track={route.data.track} events={route.data.events} mode="completed" />
      ) : null}

      {/* ---- Execution block: the session user is this visit's walker ---- */}
      {isAssignee ? (
        <>
          {startError ? <Text style={{ color: t.colors.danger }}>{startError}</Text> : null}
          {v.status === 'in_progress' ? (
            <Button title="Resume visit" onPress={() => router.replace(activeHref(v.id))} />
          ) : (
            <Button
              title="Start visit"
              onPress={() => void onStart()}
              loading={starting}
              disabled={!gate?.ok || starting}
            />
          )}
          {gate && !gate.ok && v.status !== 'in_progress' ? (
            <Text style={{ color: t.colors.inkMuted }}>{gate.reason}</Text>
          ) : null}

          <Text style={[t.type.title, { color: t.colors.ink }]}>Pets</Text>
          {d!.pets.length === 0 ? (
            <Text style={{ color: t.colors.inkMuted }}>No pets listed on this visit.</Text>
          ) : (
            d!.pets.map((p) => <PetSection key={p.id} pet={p} />)
          )}

          <Text style={[t.type.title, { color: t.colors.ink }]}>Client</Text>
          <Card style={{ gap: t.space.sm }}>
            {d!.client
              ? (() => {
                  const consent = marketingPhotosView(d!.client.marketing_photos_ok);
                  return (
                    <Text
                      style={{
                        fontWeight: '600',
                        color:
                          consent.tone === 'ok'
                            ? t.colors.green
                            : consent.tone === 'no'
                              ? t.colors.danger
                              : t.colors.inkMuted,
                      }}
                    >
                      {consent.label}
                    </Text>
                  );
                })()
              : null}
            {d!.client?.notes_md ? (
              <View style={{ gap: 2 }}>
                <Text style={[t.type.label, { color: t.colors.inkMuted }]}>Notes</Text>
                <Text style={{ color: t.colors.ink }}>{d!.client.notes_md}</Text>
              </View>
            ) : null}
            {d!.client?.address ? (
              <Pressable
                accessibilityRole="link"
                onPress={() => void Linking.openURL(mapsUrl(d!.client!.address!))}
              >
                <Text style={[t.type.label, { color: t.colors.inkMuted }]}>Address</Text>
                <Text style={[t.type.body, { color: t.colors.primary }]}>{d!.client.address}</Text>
              </Pressable>
            ) : null}
            {(d!.client?.phones ?? []).map((phone) => (
              <Pressable
                key={phone}
                accessibilityRole="link"
                onPress={() => void Linking.openURL(telUrl(phone))}
              >
                <Text style={[t.type.body, { color: t.colors.primary }]}>{phone}</Text>
              </Pressable>
            ))}
            {!d!.client ? (
              <Text style={{ color: t.colors.inkMuted }}>Client details unavailable.</Text>
            ) : null}
          </Card>

          <Card style={{ opacity: 0.5, flexDirection: 'row', alignItems: 'center', gap: t.space.sm }}>
            <LockIcon size={18} color={t.colors.ink} />
            <Text style={{ color: t.colors.ink, flex: 1 }}>
              Access codes — available after you start
            </Text>
          </Card>
        </>
      ) : null}

      {/* ---- Management block: the session user owns the business ---- */}
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

      {!isOwnerRole && isAssignee && v.status === 'completed' && businessId ? (
        <WalkerReportLink businessId={businessId} visitId={v.id} />
      ) : null}
      {isOwnerRole && v.status === 'completed' && businessId ? (
        <ReportSection
          businessId={businessId}
          visitId={v.id}
          tz={v.business_tz}
          clientPhone={d?.client?.phones?.[0] ?? v.client?.phones?.[0] ?? null}
          petIds={v.pet_ids}
          serviceName={d?.service?.name ?? v.service?.name ?? null}
          businessName={businessName}
        />
      ) : null}

      {isOwnerRole && v.status === 'completed' && invoiced.data === false ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push(`/billing/new?client=${v.client_id}` as Href)}
        >
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: t.space.sm }}>
            <BillingIcon size={20} color={t.colors.ink} />
            <Text style={[t.type.body, { color: t.colors.ink, fontWeight: '700', flex: 1 }]}>
              Billing
            </Text>
            <Text style={{ color: t.colors.inkMuted }}>Add to an invoice →</Text>
          </Card>
        </Pressable>
      ) : null}

      {manageError ? <Text style={{ color: t.colors.danger }}>{manageError}</Text> : null}
      {canCancel && !confirmCancelOpen ? (
        <Button title="Cancel visit" variant="ghost" onPress={() => setConfirmCancelOpen(true)} />
      ) : null}
      {canCancel && confirmCancelOpen ? (
        <Card style={{ gap: t.space.sm }}>
          <Text style={{ color: t.colors.ink }}>
            Cancel this visit? The walker will no longer see it.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => cancelMut.mutate()}
            disabled={cancelMut.isPending}
            hitSlop={8}
            style={{ alignSelf: 'center', paddingVertical: t.space.sm }}
          >
            <Text style={{ color: t.colors.danger, fontWeight: '700' }}>
              {cancelMut.isPending ? 'Cancelling…' : 'Really cancel'}
            </Text>
          </Pressable>
          <Button title="Keep visit" variant="ghost" onPress={() => setConfirmCancelOpen(false)} />
        </Card>
      ) : null}
    </Screen>
  );
}

/**
 * Walker's own-report access (round 7e: "the walker would like to go back and
 * look at a walk done last month"). Walkers read their own visits' report
 * rows by RLS; the button opens the same page the client got. Revoked or
 * not-yet-synced reports simply render nothing.
 */
function WalkerReportLink({ businessId, visitId }: { businessId: string; visitId: string }) {
  const report = useQuery({
    queryKey: ['visitReport', businessId, visitId],
    queryFn: () => getVisitReport(businessId, visitId),
  });
  const r = report.data;
  if (!r || r.revoked_at) return null;
  return (
    <Button
      title="View report"
      variant="secondary"
      onPress={() => void Linking.openURL(reportLink(r.public_token))}
    />
  );
}
