import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Text, View } from 'react-native';

import {
  localDayWindowUtc,
  slotHintLabel,
  walkerSlotHints,
} from '@/src/lib/schedule/slotHints';
import {
  approveBookingRequest,
  approveStartUtc,
  declineBookingRequest,
  requestWindowLabel,
  windowStartHhmm,
  windowTimeRangeLabel,
  type OwnerBookingRequest,
} from '@/src/features/portal/requestsApi';
import { Button } from '@/src/ui/Button';
import { Card } from '@/src/ui/Card';
import { TextField } from '@/src/ui/TextField';
import { TimeField } from '@/src/ui/TimeField';
import { useTheme } from '@/src/ui/theme';

import { Chip } from './Chip';
import { pickerContext, type ScheduleMember } from './api';
import { errorText } from '@/src/lib/errorText';

/**
 * The owner approve/decline card for one pending booking request — extracted
 * verbatim from app/(owner)/requests.tsx (Plan 8b Task 2) so the desktop
 * dashboard's "Pending requests" panel and the Requests screen render the SAME
 * card: walker chips (none selected = approve as unassigned), the start-time
 * picker constrained to the client's window, and the decline-with-reason flow.
 * Chips carry ADVISORY availability hints ("off", "busy 2:00 PM", "outside
 * hours", "tight transfer") recomputed live from the picked start time — never
 * blocking: the owner may override deliberately, and the walker can still
 * decline.
 *
 * Per-card UI state (walker pick, start pick, declining, reason draft) lives
 * here — the screens kept it keyed by request id, so component-local state
 * under `key={r.id}` preserves the exact per-card independence. Busy/error are
 * cross-card concerns and stay with the caller (useRequestActions below).
 */
export function RequestCard({
  request: r,
  tz,
  members,
  busy,
  onApprove,
  onDecline,
}: {
  request: OwnerBookingRequest;
  /** Business time zone; null (memberships still loading) hides the picker and approves at the server default. */
  tz: string | null;
  members: ScheduleMember[];
  /** True while THIS request's approve/decline is in flight. */
  busy: boolean;
  onApprove: (walkerId: string | null, startUtc: Date | null) => void;
  onDecline: (reason: string) => void;
}) {
  const t = useTheme();
  const [walker, setWalker] = useState<string | null>(null);
  const [startPick, setStartPick] = useState<string | null>(null);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState('');

  // Start picker: 'HH:MM' wall clock in the business tz, defaulting to
  // the window's start; null tz (memberships still loading) falls back
  // to the server default (window_start) with no picker shown.
  const startHhmm = tz ? (startPick ?? windowStartHhmm(r.window_start, tz)) : null;
  const startUtc =
    tz && startHhmm != null ? approveStartUtc(r.window_start, r.window_end, startHhmm, tz) : null;
  const startInvalid = startHhmm != null && startUtc === null;

  // Advisory availability hints on the walker chips: one pickerContext fetch
  // for the request's local DAY (cached by day, so every card on that day
  // shares it), then walkerSlotHints per chip against the picked start + the
  // service duration. Loading/error/no-duration -> no hints, chips as today.
  // slotClient (the requesting client's geocoded home) enables the tight-
  // transfer hint; a client without coordinates just skips that check.
  const day = tz ? localDayWindowUtc(r.window_start, tz) : null;
  const durationMin = r.service?.duration_min ?? null;
  const slotCtx = useQuery({
    queryKey: ['request-slot-context', r.business_id, day?.dayKey],
    queryFn: () => pickerContext(r.business_id, day!.startUtc, day!.endUtc),
    enabled: day != null && durationMin != null,
    staleTime: 60_000,
  });
  const chipHint = (userId: string): string | null => {
    if (!tz || !slotCtx.data || durationMin == null || !startUtc) return null;
    const hint = walkerSlotHints(
      userId,
      startUtc,
      durationMin,
      {
        availability: slotCtx.data.rules,
        timeOff: slotCtx.data.timeOff,
        visits: slotCtx.data.visits,
        slotClient: { id: r.client_id, lat: r.client?.lat ?? null, lng: r.client?.lng ?? null },
      },
      tz,
    );
    return slotHintLabel(hint);
  };

  const chipRow = { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: t.space.sm };

  return (
    <Card style={{ gap: t.space.sm }}>
      <Text style={{ color: t.colors.ink, fontWeight: '700' }}>
        {r.client?.name ?? 'Client'} · {r.service?.name ?? 'Service'}
      </Text>
      {tz ? (
        <Text style={[t.type.body, { color: t.colors.inkMuted }]}>
          {requestWindowLabel(r.window_start, r.window_end, tz)}
        </Text>
      ) : null}
      {r.pet_ids.length > 0 ? (
        <Text style={[t.type.body, { color: t.colors.inkMuted }]}>
          {r.pet_ids.length} pet{r.pet_ids.length === 1 ? '' : 's'}
        </Text>
      ) : null}
      {r.note_md ? <Text style={[t.type.body, { color: t.colors.ink }]}>“{r.note_md}”</Text> : null}

      <Text style={[t.type.label, { color: t.colors.inkMuted }]}>Walker (optional)</Text>
      <Text style={{ color: t.colors.inkMuted, fontSize: 12 }}>
        Leave everyone unselected to approve as unassigned; picking someone sends them an offer.
      </Text>
      <View style={chipRow}>
        {members.map((m) => (
          <Chip
            key={m.user_id}
            label={m.display_name ?? 'Team member'}
            selected={walker === m.user_id}
            hint={chipHint(m.user_id)}
            onPress={() => setWalker((cur) => (cur === m.user_id ? null : m.user_id))}
          />
        ))}
      </View>

      {tz && startHhmm != null ? (
        <>
          <TimeField label="Start time" value={startHhmm} onChange={setStartPick} />
          <Text style={{ color: t.colors.inkMuted, fontSize: 12 }}>
            The visit is scheduled at this time — anytime{' '}
            {windowTimeRangeLabel(r.window_start, r.window_end, tz)} works for the client.
          </Text>
          {startInvalid ? (
            <Text style={{ color: t.colors.danger, fontSize: 12 }}>
              Pick a start inside the client’s requested window.
            </Text>
          ) : null}
        </>
      ) : null}

      <Button
        title="Approve"
        onPress={() => onApprove(walker, startUtc)}
        loading={busy}
        disabled={startInvalid}
      />
      {declining ? (
        <>
          <TextField
            label="Reason (the client reads this)"
            value={reason}
            onChangeText={setReason}
            placeholder="e.g. Fully booked that day"
          />
          <Button
            title="Confirm decline"
            variant="ghost"
            onPress={() => onDecline(reason)}
            loading={busy}
          />
        </>
      ) : (
        <Button title="Decline" variant="ghost" onPress={() => setDeclining(true)} />
      )}
    </Card>
  );
}

/**
 * Approve/decline handlers shared by every RequestCard host (Requests screen,
 * dashboard operations panel) — moved out of requests.tsx with the card.
 * busyId serializes per-card spinners; error is the host's shared surface; a
 * successful action invalidates the pending list, visits, and the client
 * portal's request list (the same three keys the screen always invalidated).
 */
export function useRequestActions(businessId: string | null) {
  const qc = useQueryClient();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['booking-requests', businessId, 'pending'] }),
      qc.invalidateQueries({ queryKey: ['visits'] }),
      qc.invalidateQueries({ queryKey: ['portal-booking-requests'] }),
    ]);
  }

  async function approve(r: OwnerBookingRequest, walkerId: string | null, startUtc: Date | null) {
    setError(null);
    setBusyId(r.id);
    try {
      await approveBookingRequest(r.id, walkerId, startUtc);
      await refresh();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusyId(null);
    }
  }

  async function decline(r: OwnerBookingRequest, reason: string) {
    const trimmed = reason.trim();
    if (!trimmed) return setError('A decline needs a reason — the client will read it.');
    setError(null);
    setBusyId(r.id);
    try {
      await declineBookingRequest(r.id, trimmed);
      await refresh();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusyId(null);
    }
  }

  return { busyId, error, approve, decline };
}
