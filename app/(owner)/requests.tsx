import { useQuery } from '@tanstack/react-query';
import { Text } from 'react-native';

import { useActiveBusiness } from '@/src/features/business/active';
import { useMemberships } from '@/src/features/business/useMemberships';
import { listPendingBookingRequests } from '@/src/features/portal/requestsApi';
import { RequestCard, useRequestActions } from '@/src/features/schedule/RequestCard';
import { listActiveMembers } from '@/src/features/schedule/api';
import { useRefetchOnFocus } from '@/src/lib/useRefetchOnFocus';
import { Screen } from '@/src/ui/Screen';
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
 *
 * Plan 8b Task 2: the card itself (and the approve/decline handlers) moved to
 * src/features/schedule/RequestCard.tsx so the desktop dashboard's "Pending
 * requests" panel renders the identical card — this screen is now a host.
 */
export default function OwnerRequests() {
  const t = useTheme();
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

  const { busyId, error, approve, decline } = useRequestActions(businessId);

  return (
    <Screen title="Requests">
      {error ? <Text style={{ color: t.colors.danger }}>{error}</Text> : null}
      {requests.isLoading ? <Text style={{ color: t.colors.inkMuted }}>Loading…</Text> : null}
      {requests.isSuccess && requests.data.length === 0 ? (
        <Text style={{ color: t.colors.inkMuted }}>No pending requests.</Text>
      ) : null}
      {(requests.data ?? []).map((r) => (
        <RequestCard
          key={r.id}
          request={r}
          tz={tz}
          members={members.data ?? []}
          busy={busyId === r.id}
          onApprove={(walkerId, startUtc) => void approve(r, walkerId, startUtc)}
          onDecline={(reason) => void decline(r, reason)}
        />
      ))}
    </Screen>
  );
}
