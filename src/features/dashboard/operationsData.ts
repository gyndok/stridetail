import { useQuery } from '@tanstack/react-query';

import { listPendingBookingRequests } from '@/src/features/portal/requestsApi';
import {
  listActiveMembers,
  listProblemNotifications,
  listVisits,
  type Visit,
} from '@/src/features/schedule/api';
import { supabase } from '@/src/lib/supabase';

// Plan 8b Task 2 — data for the desktop OperationsPanel. Every query here
// REUSES the mobile Today's queries verbatim (same keys, same fns, same
// window), so the dashboard and the phone triage from one cache and can never
// disagree. The only new read is pet names for the live-walks strip (named
// columns per the house column-grant rule). All derivation is pure.

/** Mobile Today's window: 26 h back (whole local day in any tz) + 14 days forward. */
export const OPS_LOOKBACK_MS = 26 * 3_600_000;
export const OPS_LOOKAHEAD_MS = 14 * 86_400_000;

/** "Out on walks now" is live-ish: the visits query refetches every minute. */
export const LIVE_WALKS_REFETCH_MS = 60_000;

/** How many unassigned visits the needs-attention card previews. */
export const UNASSIGNED_PREVIEW_COUNT = 3;

/** Unassigned visits in the query window, ascending by start (mobile Today's count set). */
export function unassignedVisits<T extends { status: string; scheduled_start: string }>(
  visits: T[],
): T[] {
  return visits
    .filter((v) => v.status === 'unassigned')
    .sort((a, b) => a.scheduled_start.localeCompare(b.scheduled_start));
}

/** Declined-back-to-unassigned offers (mobile Today's declined rule), ascending by start. */
export function declinedOffers<
  T extends { status: string; decline_reason: string | null; scheduled_start: string },
>(visits: T[]): T[] {
  return visits
    .filter((v) => v.decline_reason != null && v.status === 'unassigned')
    .sort((a, b) => a.scheduled_start.localeCompare(b.scheduled_start));
}

/**
 * Walks happening RIGHT NOW, derived only from visit state (in_progress) —
 * never a presence flag. Soonest start first; a missing started_at (should not
 * happen — the start RPC stamps it) falls back to the scheduled start.
 */
export function outOnWalks<
  T extends { status: string; scheduled_start: string; started_at: string | null },
>(visits: T[]): T[] {
  const startKey = (v: T) => v.started_at ?? v.scheduled_start;
  return visits
    .filter((v) => v.status === 'in_progress')
    .sort((a, b) => startKey(a).localeCompare(startKey(b)));
}

/** The owner visit screen for a visit row. */
export function visitHref(v: { id: string }): string {
  return `/schedule/${v.id}`;
}

/**
 * "started 12 min ago" for a live walk. Sub-minute (and clock-skewed future
 * stamps) read "started just now"; an hour-plus walk reads "started 1 h 35 min
 * ago". Null started_at (defensive) degrades to plain "in progress".
 */
export function startedAgoLabel(startedAtIso: string | null, nowUtc: Date): string {
  if (!startedAtIso) return 'in progress';
  const min = Math.max(0, Math.floor((nowUtc.getTime() - new Date(startedAtIso).getTime()) / 60_000));
  if (min < 1) return 'started just now';
  if (min < 60) return `started ${min} min ago`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `started ${h} h ago` : `started ${h} h ${m} min ago`;
}

// ---- pet names for the live-walks strip ----

export const PET_NAME_COLUMNS = 'id, name';

/** Unique pet ids across the live walks, sorted for a stable query key. */
export function walkPetIds(walks: { pet_ids: string[] }[]): string[] {
  return [...new Set(walks.flatMap((w) => w.pet_ids))].sort();
}

/** id -> name for the given pets (owner RLS covers the business's pets). */
export async function listPetNames(
  businessId: string,
  petIds: string[],
): Promise<Record<string, string>> {
  if (petIds.length === 0) return {};
  const { data, error } = await supabase
    .from('pets')
    .select(PET_NAME_COLUMNS)
    .eq('business_id', businessId)
    .in('id', petIds);
  if (error) throw error;
  const names: Record<string, string> = {};
  for (const p of (data ?? []) as { id: string; name: string }[]) names[p.id] = p.name;
  return names;
}

/**
 * "Fido, Rex" when the names resolved; a plain count while they load (or for
 * ids the query could not see); empty string for a walk with no pets recorded.
 */
export function petNamesLabel(
  petIds: string[],
  names: Record<string, string> | undefined,
): string {
  if (petIds.length === 0) return '';
  const resolved = petIds.map((id) => names?.[id]).filter((n): n is string => !!n);
  if (resolved.length > 0) return resolved.join(', ');
  return `${petIds.length} pet${petIds.length === 1 ? '' : 's'}`;
}

// ---- hooks ----

/**
 * The panel's four queries — keys identical to mobile Today (visits/todayPlus,
 * notifications/problems, booking-requests/pending) and the schedule members
 * picker, plus a 60 s refetch on visits so the live-walks card tracks reality.
 */
export function useOperationsData(businessId: string | null) {
  const visits = useQuery({
    queryKey: ['visits', businessId, 'todayPlus'],
    enabled: !!businessId,
    refetchInterval: LIVE_WALKS_REFETCH_MS,
    queryFn: () =>
      listVisits(businessId!, {
        fromUtc: new Date(Date.now() - OPS_LOOKBACK_MS),
        toUtc: new Date(Date.now() + OPS_LOOKAHEAD_MS),
      }),
  });
  const notifications = useQuery({
    queryKey: ['notifications', businessId, 'problems'],
    enabled: !!businessId,
    queryFn: () => listProblemNotifications(businessId!),
  });
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
  return { visits, notifications, requests, members };
}

/** Pet names for the current live walks; skipped while nobody is out. */
export function useWalkPetNames(businessId: string | null, walks: Visit[]) {
  const petIds = walkPetIds(walks);
  return useQuery({
    queryKey: ['pets', businessId, 'names', petIds],
    enabled: !!businessId && petIds.length > 0,
    queryFn: () => listPetNames(businessId!, petIds),
  });
}
