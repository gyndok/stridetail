import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Alert, Linking, Platform, Pressable, Text, View } from 'react-native';

import { telUrl } from '@/src/features/clients/form';
import { useMemberships } from '@/src/features/business/useMemberships';
import {
  RevealAccessError,
  revealAccessForVisit,
  type ClientAccessCodes,
} from '@/src/features/clients/access';
import { loadRevealedCodes, saveRevealedCodes } from '@/src/features/visit/accessCache';
import {
  buildEventInput,
  eventLabel,
  formatDistanceUS,
  formatElapsed,
  revealFailureMode,
  revealFallback,
  tickerTime,
} from '@/src/features/visit/active';
import {
  finishedNoLinkSmsBody,
  joinPetNames,
  reportSmsBody,
  smsUrl,
} from '@/src/features/report/deviceSms';
import { getVisitReport, reportLink } from '@/src/features/schedule/report';
import { appendVisitEvent, appendVisitFinish, deleteVisitEvent } from '@/src/features/visit/api';
import { fetchVisitDetail, type VisitDetail } from '@/src/features/visit/detail';
import { WalkMap } from '@/src/features/visit/WalkMap';
import { videoCaptureSupported } from '@/src/features/visit/videoSupport';
import { isPinEventType, type WalkMapEvent } from '@/src/features/visit/walkMapData';
import { useWalkTheme } from '@/src/features/settings/walkTheme';
import { getLocalTrack, getLocalVisitStart, stopVisitTracking } from '@/src/lib/gps/controller';
import { trackDistanceMeters, type Pt } from '@/src/lib/gps/geo';
import { getDb } from '@/src/lib/offline/db';
import { SqliteOutbox } from '@/src/lib/offline/outbox';
import { kickSync, type VisitEventType } from '@/src/lib/offline/sync';
import { useRefetchOnFocus } from '@/src/lib/useRefetchOnFocus';
import { Button } from '@/src/ui/Button';
import { Card } from '@/src/ui/Card';
import {
  AteIcon,
  DrankIcon,
  LockIcon,
  MarkIcon,
  MedsIcon,
  NoteIcon,
  PeeIcon,
  PhotoIcon,
  PoopIcon,
  VideoIcon,
} from '@/src/ui/icons';
import { Screen } from '@/src/ui/Screen';
import { TextField } from '@/src/ui/TextField';
import { FieldTheme, useTheme } from '@/src/ui/theme';

function errorText(e: unknown): string {
  if (e instanceof Error) return e.message;
  // Supabase Postgrest/Storage errors are plain objects with .message — never
  // let them stringify to "[object Object]" (Alexandria's round-5b report).
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message);
  return String(e);
}

const POLL_MS = 5_000;
const DEFAULT_GRACE_HOURS = 12; // businesses.access_grace_hours DB default

type RecentEvent = {
  type: VisitEventType;
  occurredAt: string;
  petName?: string;
  /** Set for events this screen logged — the handle event deletion works by. */
  clientUuid?: string;
};
type Revealed = { codes: ClientAccessCodes; note: string | null };

/**
 * One primary-tap event button (flex row cell): icon above the label, styled
 * like the secondary Button (surfaceRaised pill, primary foreground). The
 * label always renders — icons augment, never replace text.
 */
function EventButton({
  title,
  icon,
  onPress,
  disabled,
}: {
  title: string;
  icon: (color: string) => ReactNode;
  onPress: () => void;
  disabled?: boolean;
}) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
        gap: t.space.xs,
        paddingVertical: t.space.md,
        paddingHorizontal: t.space.sm,
        borderRadius: t.radius.pill,
        backgroundColor: t.colors.surfaceRaised,
        opacity: disabled ? 0.6 : pressed ? 0.85 : 1,
      })}
    >
      {icon(t.colors.primary)}
      <Text style={{ color: t.colors.primary, fontSize: 14, fontWeight: '800' }}>{title}</Text>
    </Pressable>
  );
}

function ActiveVisitBody() {
  const t = useTheme();
  const { walkTheme } = useWalkTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();
  const memberships = useMemberships();

  const detail = useQuery({
    queryKey: ['visitDetail', id],
    enabled: !!id,
    queryFn: () => fetchVisitDetail(id!),
  });
  useRefetchOnFocus(detail.refetch);
  const d = detail.data;
  const requiresGps = d?.service?.requires_gps === true;

  // ---- header state: timer, distance, sync badge ----
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [localStartMs, setLocalStartMs] = useState<number | null>(null);
  const [distanceM, setDistanceM] = useState<number | null>(null);
  const [track, setTrack] = useState<Pt[]>([]);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web' || !id) return;
    void getLocalVisitStart(id).then((r) => setLocalStartMs(r?.startedAt ?? null));
  }, [id]);

  useEffect(() => {
    if (Platform.OS === 'web' || !id) return;
    const poll = async () => {
      setPendingCount(await new SqliteOutbox(getDb()).countPending(id));
      if (requiresGps) {
        const points = await getLocalTrack(id);
        setTrack(points);
        setDistanceM(trackDistanceMeters(points));
      }
    };
    void poll();
    const timer = setInterval(() => void poll(), POLL_MS);
    return () => clearInterval(timer);
  }, [id, requiresGps]);

  const startMs = d?.visit.started_at ? Date.parse(d.visit.started_at) : localStartMs;

  // ---- pets / events ----
  const [selectedPetId, setSelectedPetId] = useState<string | null>(null);
  const [recent, setRecent] = useState<RecentEvent[]>([]);
  // Map pins for pee/poop/photo logged THIS screen session (Plan 7b Task 3).
  // Position derives at render from the nearest-in-time track fix, so a pin
  // logged before the next GPS poll still lands correctly once fixes arrive.
  const [pinEvents, setPinEvents] = useState<WalkMapEvent[]>([]);
  const [noteOpen, setNoteOpen] = useState(false);
  // Custom map mark (wish list #1): a labeled pin at the current spot.
  const [markOpen, setMarkOpen] = useState(false);
  const [markText, setMarkText] = useState('');
  // Round 0: Ate/Drank/Meds are demoted behind this toggle, collapsed by default.
  const [moreOpen, setMoreOpen] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [eventError, setEventError] = useState<string | null>(null);

  const pets = d?.pets ?? [];
  // Multi-pet default: first pet selected so every event carries an attribution
  // (derived, not an effect — no setState-in-effect churn).
  const effectivePetId = selectedPetId ?? (pets.length > 1 ? pets[0]!.id : null);

  const appendEvent = async (
    type: VisitEventType,
    extras?: { text?: string; photoLocalUri?: string; videoLocalUri?: string },
  ) => {
    if (!d) return;
    setEventError(null);
    try {
      const input = buildEventInput({
        visitId: d.visit.id,
        businessId: d.visit.business_id,
        type,
        petIds: d.visit.pet_ids,
        ...(effectivePetId != null && { selectedPetId: effectivePetId }),
        ...extras,
      });
      const payload = await appendVisitEvent(input);
      const petName = pets.find((p) => p.id === payload.petId)?.name;
      setRecent((r) =>
        [
          {
            type,
            occurredAt: payload.occurredAt,
            clientUuid: payload.clientUuid,
            ...(petName && { petName }),
          },
          ...r,
        ].slice(0, 5),
      );
      if (isPinEventType(type)) {
        const atMs = Date.parse(payload.occurredAt);
        if (!Number.isNaN(atMs)) setPinEvents((p) => [...p, { type, atMs }]);
      }
    } catch (e) {
      setEventError(errorText(e));
    }
  };

  const onPhoto = async () => {
    setEventError(null);
    try {
      const options = { mediaTypes: ['images'] as ImagePicker.MediaType[], quality: 0.7 };
      let result: ImagePicker.ImagePickerResult | null = null;
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (perm.granted) {
        try {
          result = await ImagePicker.launchCameraAsync(options);
        } catch (e) {
          // Simulators have no camera; in dev fall back to the library.
          if (__DEV__) result = await ImagePicker.launchImageLibraryAsync(options);
          else throw e;
        }
      } else if (__DEV__) {
        result = await ImagePicker.launchImageLibraryAsync(options);
      } else {
        setEventError('Camera permission is needed to add a photo.');
        return;
      }
      if (!result || result.canceled || !result.assets[0]) return;
      await appendEvent('photo', { photoLocalUri: result.assets[0].uri });
    } catch (e) {
      setEventError(errorText(e));
    }
  };

  // Wish list #2: remove a mis-logged marker before the report exists. The
  // outbox item is dequeued when still unsynced; a synced row is deleted under
  // the walker delete policy. The map pin (matched by time) goes with it.
  const onDeleteEvent = async (e: RecentEvent) => {
    if (!e.clientUuid || !d) return;
    setEventError(null);
    try {
      await deleteVisitEvent({ clientUuid: e.clientUuid, visitId: d.visit.id });
      setRecent((r) => r.filter((x) => x.clientUuid !== e.clientUuid));
      const atMs = Date.parse(e.occurredAt);
      if (!Number.isNaN(atMs)) setPinEvents((p) => p.filter((pin) => pin.atMs !== atMs));
    } catch (err) {
      setEventError(errorText(err));
    }
  };

  // Report videos (wish list #7). Alexandra's cap: 10 seconds — the camera
  // enforces it (videoMaxDuration); the duration guard catches the DEV
  // library fallback. Medium quality keeps a clip at a few MB and H.264
  // (playable in every browser the report page meets).
  const onVideo = async () => {
    setEventError(null);
    try {
      const options = {
        mediaTypes: ['videos'] as ImagePicker.MediaType[],
        videoMaxDuration: 10,
        videoQuality: ImagePicker.UIImagePickerControllerQualityType.Medium,
      };
      let result: ImagePicker.ImagePickerResult | null = null;
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (perm.granted) {
        try {
          result = await ImagePicker.launchCameraAsync(options);
        } catch (e) {
          if (__DEV__) result = await ImagePicker.launchImageLibraryAsync(options);
          else throw e;
        }
      } else if (__DEV__) {
        result = await ImagePicker.launchImageLibraryAsync(options);
      } else {
        setEventError('Camera permission is needed to record a video.');
        return;
      }
      if (!result || result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      if (typeof asset.duration === 'number' && asset.duration > 11_000) {
        setEventError('Videos are capped at 10 seconds — record a shorter clip.');
        return;
      }
      await appendEvent('video', { videoLocalUri: asset.uri });
    } catch (e) {
      setEventError(errorText(e));
    }
  };

  const onSaveNote = async () => {
    const text = noteText.trim();
    if (!text) return;
    await appendEvent('note', { text });
    setNoteText('');
    setNoteOpen(false);
  };

  const onSaveMark = async () => {
    const text = markText.trim();
    await appendEvent('mark', text ? { text } : undefined);
    setMarkText('');
    setMarkOpen(false);
  };

  // ---- reveal codes ----
  const [revealed, setRevealed] = useState<Revealed | null>(null);
  const [callOwner, setCallOwner] = useState(false);
  const [revealBusy, setRevealBusy] = useState(false);
  const [revealError, setRevealError] = useState<string | null>(null);

  // Spec §8: plaintext codes live only in this component's state — wipe on
  // blur/unmount, same as the owner access screen.
  useFocusEffect(
    useCallback(
      () => () => {
        setRevealed(null);
        setCallOwner(false);
        setRevealError(null);
      },
      [],
    ),
  );

  const graceHours =
    memberships.data?.find((m) => m.business_id === d?.visit.business_id)?.business
      .access_grace_hours ?? DEFAULT_GRACE_HOURS;

  const onReveal = async () => {
    if (!d?.client) return;
    const clientId = d.client.id;
    setRevealBusy(true);
    setRevealError(null);
    setCallOwner(false);
    try {
      const codes = await revealAccessForVisit(d.visit.id);
      if (!codes) {
        setRevealError('No access codes on file for this client.');
        return;
      }
      setRevealed({ codes, note: null });
      await saveRevealedCodes(clientId, codes);
    } catch (e) {
      if (e instanceof RevealAccessError && revealFailureMode(e.status) === 'offline') {
        const fb = revealFallback(await loadRevealedCodes(clientId, graceHours));
        if (fb.kind === 'cached') setRevealed({ codes: fb.codes, note: fb.note });
        else setCallOwner(true);
      } else {
        setRevealError(errorText(e));
      }
    } finally {
      setRevealBusy(false);
    }
  };

  // ---- finish ----
  const [finishOpen, setFinishOpen] = useState(false);
  const [finishNotes, setFinishNotes] = useState('');
  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);

  const doFinish = async () => {
    if (!d) return;
    setFinishing(true);
    setFinishError(null);
    try {
      // Stop GPS first: rolls the final segment into the outbox so it queues
      // BEFORE visit.finish (strict order — the report's distance sees it).
      await stopVisitTracking();
      const notes = finishNotes.trim();
      await appendVisitFinish(d.visit.id, notes === '' ? undefined : notes);
      queryClient.setQueryData<VisitDetail>(['visitDetail', id], (old) =>
        old ? { ...old, visit: { ...old.visit, status: 'completed' } } : old,
      );
      void queryClient.invalidateQueries({ queryKey: ['myVisits'] });
      kickSync();
      offerClientText(d);
    } catch (e) {
      setFinishError(errorText(e));
      setFinishing(false);
    }
  };

  // Post-finish "Text the client": opens the walker's own Messages composer
  // (device-composed SMS — no carrier registration; docs/HANDOFF.md). The
  // finish is outbox-queued, so the report token may not exist client-side
  // yet: poll visit_reports briefly (walker reads own reports per RLS) and
  // fall back to the honest no-link body when the sync hasn't landed — the
  // owner's report card sends the linked one. Recorded in DEVIATIONS.md.
  const offerClientText = (detailNow: VisitDetail) => {
    const goToday = () => router.replace('/today' as Href);
    const phone = detailNow.client?.phones?.[0];
    // Web: no device Messages app, and Alert buttons no-op there — the prompt
    // would strand the walker on this screen. Skip straight home.
    if (!phone || Platform.OS === 'web') {
      goToday();
      return;
    }
    void (async () => {
      const businessName =
        memberships.data?.find((m) => m.business_id === detailNow.visit.business_id)?.business
          .name ?? 'Your pet care team';
      const petNames = joinPetNames(pets.map((p) => p.name));
      let token: string | null = null;
      for (let i = 0; i < 3 && token === null; i++) {
        await new Promise((resolve) => setTimeout(resolve, 700));
        try {
          token =
            (await getVisitReport(detailNow.visit.business_id, detailNow.visit.id))
              ?.public_token ?? null;
        } catch {
          token = null; // offline / not yet synced — the no-link body applies
        }
      }
      const body = token
        ? reportSmsBody(businessName, petNames, detailNow.service?.name ?? 'scheduled', reportLink(token))
        : finishedNoLinkSmsBody(businessName, petNames);
      Alert.alert(
        'Visit finished',
        'Text the client from your phone?',
        [
          { text: 'Not now', style: 'cancel', onPress: goToday },
          {
            text: 'Text the client',
            onPress: () => {
              void Linking.openURL(smsUrl(phone, body));
              goToday();
            },
          },
        ],
        { cancelable: true, onDismiss: goToday },
      );
    })();
  };

  // The finishOpen card (notes + "Confirm finish" + "Keep walking") IS the
  // confirmation — the old extra Alert.alert on top of it was redundant and,
  // worse, a silent no-op on web (buttons never fire there).
  const onConfirmFinish = () => void doFinish();

  const revealedRow = (label: string, value: string | null) =>
    value == null ? null : (
      <View key={label} style={{ paddingVertical: t.space.xs }}>
        <Text style={[t.type.label, { color: t.colors.inkMuted }]}>{label}</Text>
        <Text style={[t.type.body, { color: t.colors.ink }]}>{value}</Text>
      </View>
    );

  const firstPhone = d?.client?.phones?.[0];

  return (
    <Screen title={d?.client?.name ?? 'Active visit'}>
      {detail.error ? <Text style={{ color: t.colors.danger }}>{errorText(detail.error)}</Text> : null}
      {detail.isLoading ? <Text style={{ color: t.colors.inkMuted }}>Loading…</Text> : null}
      {d ? (
        <>
          {/* Header: timer · distance · sync badge */}
          <Card style={{ backgroundColor: t.colors.surfaceRaised, gap: t.space.sm }}>
            <Text
              style={[t.type.hero, { color: t.colors.ink, fontVariant: ['tabular-nums'] }]}
              accessibilityLabel="Elapsed time"
            >
              {startMs != null ? formatElapsed(nowMs - startMs) : '--:--:--'}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space.md }}>
              {requiresGps ? (
                <Text style={[t.type.body, { color: t.colors.ink }]}>
                  {distanceM != null ? formatDistanceUS(distanceM) : '…'}
                </Text>
              ) : null}
              <View
                style={{
                  borderRadius: t.radius.pill,
                  paddingHorizontal: t.space.md,
                  paddingVertical: t.space.xs,
                  backgroundColor: pendingCount > 0 ? t.colors.warning : t.colors.success,
                }}
              >
                <Text style={[t.type.label, { color: t.colors.onPrimary }]}>
                  {pendingCount > 0 ? `Syncing · ${pendingCount}` : 'Synced'}
                </Text>
              </View>
            </View>
          </Card>

          {/* Live walk map (Plan 7b Task 3): route so far + event pins, Apple
              Maps. On a binary without the native module (pre-Sep-1 via OTA)
              WalkMap renders its fallback — nothing, exactly today's UI. */}
          {requiresGps && Platform.OS !== 'web' ? (
            <WalkMap track={track} events={pinEvents} mode="live" appearance={walkTheme} />
          ) : null}

          {/* Pet chips (multi-pet only): the selected pet gets each event */}
          {pets.length > 1 ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space.sm }}>
              {pets.map((p) => {
                const selected = p.id === effectivePetId;
                return (
                  <Pressable
                    key={p.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => setSelectedPetId(p.id)}
                    style={{
                      borderRadius: t.radius.pill,
                      paddingHorizontal: t.space.lg,
                      paddingVertical: t.space.sm,
                      backgroundColor: selected ? t.colors.primary : t.colors.surfaceRaised,
                      borderWidth: 1,
                      borderColor: selected ? t.colors.primary : t.colors.line,
                    }}
                  >
                    <Text
                      style={{
                        color: selected ? t.colors.onPrimary : t.colors.ink,
                        fontWeight: '700',
                      }}
                    >
                      {p.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          {eventError ? <Text style={{ color: t.colors.danger }}>{eventError}</Text> : null}

          {/* Event buttons. Round 0: Pee · Poop · Photo · Note are "the 4 main
              things I would like to mark"; Ate/Drank/Meds sit behind More
              ("any additional pet needs can be added to the notes"). */}
          <View style={{ flexDirection: 'row', gap: t.space.sm }}>
            <EventButton
              title="Pee"
              icon={(c) => <PeeIcon size={20} color={c} />}
              onPress={() => void appendEvent('pee')}
            />
            <EventButton
              title="Poop"
              icon={(c) => <PoopIcon size={20} color={c} />}
              onPress={() => void appendEvent('poop')}
            />
            <EventButton
              title="Photo"
              icon={(c) => <PhotoIcon size={20} color={c} accent={c} />}
              onPress={() => void onPhoto()}
            />
            <EventButton
              title="Note"
              icon={(c) => <NoteIcon size={20} color={c} />}
              onPress={() => setNoteOpen((v) => !v)}
            />
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: moreOpen }}
            onPress={() => setMoreOpen((v) => !v)}
            style={({ pressed }) => ({
              alignSelf: 'flex-start',
              paddingVertical: t.space.xs,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Text style={[t.type.label, { color: t.colors.inkMuted }]}>
              {moreOpen ? 'Less ▲' : 'More ▼'}
            </Text>
          </Pressable>
          {moreOpen ? (
            <View style={{ flexDirection: 'row', gap: t.space.sm }}>
              <EventButton
                title="Ate"
                icon={(c) => <AteIcon size={20} color={c} />}
                onPress={() => void appendEvent('ate')}
              />
              <EventButton
                title="Drank"
                icon={(c) => <DrankIcon size={20} color={c} />}
                onPress={() => void appendEvent('drank')}
              />
              <EventButton
                title="Meds"
                icon={(c) => <MedsIcon size={20} color={c} accent={c} />}
                onPress={() => void appendEvent('meds')}
              />
              <EventButton
                title="Mark"
                icon={(c) => <MarkIcon size={20} color={c} />}
                onPress={() => setMarkOpen((v) => !v)}
              />
              {videoCaptureSupported() ? (
                <EventButton
                  title="Video"
                  icon={(c) => <VideoIcon size={20} color={c} />}
                  onPress={() => void onVideo()}
                />
              ) : null}
            </View>
          ) : null}

          {markOpen ? (
            <Card style={{ gap: t.space.sm }}>
              <TextField
                label="Mark this spot"
                value={markText}
                onChangeText={setMarkText}
                placeholder="What's here? (optional)"
                autoFocus
              />
              <Button title="Drop mark" onPress={() => void onSaveMark()} />
            </Card>
          ) : null}

          {noteOpen ? (
            <Card style={{ gap: t.space.sm }}>
              <TextField
                label="Note"
                value={noteText}
                onChangeText={setNoteText}
                placeholder="What happened?"
                multiline
                autoFocus
              />
              <Button title="Save note" onPress={() => void onSaveNote()} disabled={!noteText.trim()} />
            </Card>
          ) : null}

          {/* Reveal codes (enabled while in progress) */}
          {revealError ? <Text style={{ color: t.colors.danger }}>{revealError}</Text> : null}
          {revealed ? (
            <Card>
              {revealedRow('Door code', revealed.codes.door_code)}
              {revealedRow('Lockbox code', revealed.codes.lockbox_code)}
              {revealedRow('Gate code', revealed.codes.gate_code)}
              {revealedRow('Alarm code', revealed.codes.alarm_code)}
              {revealedRow('Key location', revealed.codes.key_location)}
              {revealedRow('Notes', revealed.codes.notes)}
              {revealed.note ? (
                <Text style={{ color: t.colors.warning, marginTop: t.space.sm }}>{revealed.note}</Text>
              ) : null}
              <Text style={{ color: t.colors.inkMuted, fontSize: 12, marginTop: t.space.sm }}>
                Access is logged in the audit trail.
              </Text>
            </Card>
          ) : callOwner ? (
            firstPhone ? (
              <Button
                title="No signal — call owner"
                variant="secondary"
                onPress={() => void Linking.openURL(telUrl(firstPhone))}
              />
            ) : (
              <Text style={{ color: t.colors.inkMuted }}>
                No signal, no cached codes, and no phone on file for this client.
              </Text>
            )
          ) : (
            <Button
              title="Reveal codes"
              icon={(c) => <LockIcon size={18} color={c} />}
              variant="secondary"
              loading={revealBusy}
              onPress={() => void onReveal()}
            />
          )}

          {/* Finish */}
          {finishError ? <Text style={{ color: t.colors.danger }}>{finishError}</Text> : null}
          {finishOpen ? (
            <Card style={{ gap: t.space.sm }}>
              <TextField
                label="Note for owner (private)"
                value={finishNotes}
                onChangeText={setFinishNotes}
                placeholder="Optional — never shown to the client"
                multiline
              />
              <Button title="Confirm finish" loading={finishing} onPress={onConfirmFinish} />
              <Button
                title="Keep walking"
                variant="ghost"
                disabled={finishing}
                onPress={() => setFinishOpen(false)}
              />
            </Card>
          ) : (
            <Button title="Finish visit" onPress={() => setFinishOpen(true)} />
          )}

          {/* Recent events ticker (last 5, newest first) */}
          {recent.length > 0 ? (
            <Card style={{ gap: t.space.xs }}>
              <Text style={[t.type.label, { color: t.colors.inkMuted }]}>Recent</Text>
              {recent.map((e, i) => (
                <View
                  key={`${e.occurredAt}-${i}`}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: t.space.sm }}
                >
                  <Text style={{ color: t.colors.ink, flex: 1 }}>
                    {eventLabel(e.type)} · {tickerTime(e.occurredAt)}
                    {e.petName ? ` · ${e.petName}` : ''}
                  </Text>
                  {e.clientUuid ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${eventLabel(e.type)}`}
                      onPress={() => void onDeleteEvent(e)}
                      hitSlop={8}
                      style={({ pressed }) => ({
                        paddingHorizontal: t.space.sm,
                        opacity: pressed ? 0.6 : 1,
                      })}
                    >
                      <Text style={{ color: t.colors.danger, fontWeight: '700' }}>Remove</Text>
                    </Pressable>
                  ) : null}
                </View>
              ))}
            </Card>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}

/**
 * Active-visit field screen (Plan 4 Task 5, spec §9), scoped by <FieldTheme>.
 * Round 0: the default is the WARM theme (Alexandra's answer overrides spec
 * §9's dark-by-default); a walker who wants the dark field palette picks it in
 * Settings → Walk screen, which this reads from the persisted `walkTheme`.
 */
export default function ActiveVisit() {
  const { walkTheme } = useWalkTheme();
  return (
    <FieldTheme mode={walkTheme}>
      <ActiveVisitBody />
    </FieldTheme>
  );
}
