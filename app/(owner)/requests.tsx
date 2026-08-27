import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { useActiveBusiness } from '@/src/features/business/active';
import { useMemberships } from '@/src/features/business/useMemberships';
import {
  approveBookingRequest,
  approveStartUtc,
  declineBookingRequest,
  listPendingBookingRequests,
  requestWindowLabel,
  windowStartHhmm,
  windowTimeRangeLabel,
  type OwnerBookingRequest,
} from '@/src/features/portal/requestsApi';
import { Chip } from '@/src/features/schedule/Chip';
import { listActiveMembers } from '@/src/features/schedule/api';
import { useRefetchOnFocus } from '@/src/lib/useRefetchOnFocus';
import { Button } from '@/src/ui/Button';
import { Card } from '@/src/ui/Card';
import { Screen } from '@/src/ui/Screen';
import { TextField } from '@/src/ui/TextField';
import { TimeField } from '@/src/ui/TimeField';
import { useTheme } from '@/src/ui/theme';

/**
 * Owner booking-requests screen (Plan 8 Task 7): the business's pending
 * requests, oldest first — approve (walker optional: none = unassigned visit,
 * picked = offered, per approve_booking_request) or decline with a reason the
 * client reads verbatim (list, and the decline email). Reached from the Today
 * needs-attention strip and the Schedule header; hidden from the tab bar.
 *
 * Post-Checkpoint 8: the card carries a Start time picker (default = the
 * window's start, constrained to the client's requested window) and the RPC
 * schedules the visit at the picked time — no more "reschedule it after".
 */
export default function OwnerRequests() {
  const t = useTheme();
  const qc = useQueryClient();
  const { businessId } = useActiveBusiness();
  const memberships = useMemberships();
  const tz = memberships.data?.find((m) => m.business_id === businessId)?.business.time_zone ?? null;

  const requests = useQuery({
    queryKey: ['booking-requests', businessId, 'pending'],
    enabled: !!businessId,
    queryFn: () => listPendingBookingRequests(businessId!),
  });
  const members = useQuery({
    queryKey: ['scheduleMembers', businessId],
    enabled: !!businessId,
    queryFn: () => listActiveMembers(businessId!),
  });
  useRefetchOnFocus(requests.refetch);

  // Per-request UI state, keyed by request id so cards stay independent.
  const [walkerSel, setWalkerSel] = useState<Record<string, string | null>>({});
  const [startSel, setStartSel] = useState<Record<string, string>>({});
  const [declining, setDeclining] = useState<Record<string, boolean>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['booking-requests', businessId, 'pending'] }),
      qc.invalidateQueries({ queryKey: ['visits'] }),
      qc.invalidateQueries({ queryKey: ['portal-booking-requests'] }),
    ]);
  }

  async function approve(r: OwnerBookingRequest, startUtc: Date | null) {
    setError(null);
    setBusyId(r.id);
    try {
      await approveBookingRequest(r.id, walkerSel[r.id] ?? null, startUtc);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  }

  async function decline(r: OwnerBookingRequest) {
    const reason = (reasons[r.id] ?? '').trim();
    if (!reason) return setError('A decline needs a reason — the client will read it.');
    setError(null);
    setBusyId(r.id);
    try {
      await declineBookingRequest(r.id, reason);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  }

  const chipRow = { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: t.space.sm };

  return (
    <Screen title="Requests">
      {error ? <Text style={{ color: t.colors.danger }}>{error}</Text> : null}
      {requests.isLoading ? <Text style={{ color: t.colors.inkMuted }}>Loading…</Text> : null}
      {requests.isSuccess && requests.data.length === 0 ? (
        <Text style={{ color: t.colors.inkMuted }}>No pending requests.</Text>
      ) : null}
      {(requests.data ?? []).map((r) => {
        // Start picker: 'HH:MM' wall clock in the business tz, defaulting to
        // the window's start; null tz (memberships still loading) falls back
        // to the server default (window_start) with no picker shown.
        const startHhmm = tz ? (startSel[r.id] ?? windowStartHhmm(r.window_start, tz)) : null;
        const startUtc =
          tz && startHhmm != null
            ? approveStartUtc(r.window_start, r.window_end, startHhmm, tz)
            : null;
        const startInvalid = startHhmm != null && startUtc === null;
        return (
          <Card key={r.id} style={{ gap: t.space.sm }}>
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
            {r.note_md ? (
              <Text style={[t.type.body, { color: t.colors.ink }]}>“{r.note_md}”</Text>
            ) : null}

            <Text style={[t.type.label, { color: t.colors.inkMuted }]}>Walker (optional)</Text>
            <Text style={{ color: t.colors.inkMuted, fontSize: 12 }}>
              Leave everyone unselected to approve as unassigned; picking someone sends them an
              offer.
            </Text>
            <View style={chipRow}>
              {(members.data ?? []).map((m) => (
                <Chip
                  key={m.user_id}
                  label={m.display_name ?? 'Team member'}
                  selected={walkerSel[r.id] === m.user_id}
                  onPress={() =>
                    setWalkerSel((cur) => ({
                      ...cur,
                      [r.id]: cur[r.id] === m.user_id ? null : m.user_id,
                    }))
                  }
                />
              ))}
            </View>

            {tz && startHhmm != null ? (
              <>
                <TimeField
                  label="Start time"
                  value={startHhmm}
                  onChange={(v) => setStartSel((cur) => ({ ...cur, [r.id]: v }))}
                />
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
              onPress={() => void approve(r, startUtc)}
              loading={busyId === r.id}
              disabled={startInvalid}
            />
            {declining[r.id] ? (
              <>
                <TextField
                  label="Reason (the client reads this)"
                  value={reasons[r.id] ?? ''}
                  onChangeText={(v) => setReasons((cur) => ({ ...cur, [r.id]: v }))}
                  placeholder="e.g. Fully booked that day"
                />
                <Button
                  title="Confirm decline"
                  variant="ghost"
                  onPress={() => void decline(r)}
                  loading={busyId === r.id}
                />
              </>
            ) : (
              <Button
                title="Decline"
                variant="ghost"
                onPress={() => setDeclining((cur) => ({ ...cur, [r.id]: true }))}
              />
            )}
          </Card>
        );
      })}
    </Screen>
  );
}
