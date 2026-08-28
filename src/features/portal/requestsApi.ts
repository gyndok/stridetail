import { formatInTimeZone } from 'date-fns-tz';

import { parseLocalDateTime } from '@/src/features/availability/api';
import type { ChipTone } from '@/src/features/billing/money';
import { supabase } from '@/src/lib/supabase';

/**
 * Booking requests (Plan 8 Task 7) — the client's request-a-service flow and
 * the owner's approve/decline side. DB contract: migration 20260826000002
 * (booking_requests table + RLS + approve/decline RPCs + owner-notify
 * trigger). Column discipline as in api.ts: named columns only, and the
 * shapes are pinned in __tests__/requestsApi.test.ts.
 *
 * decline_reason is deliberately part of the client select — the EXCEPTION to
 * the portal's decline_reason ban (which targets visits.decline_reason, a
 * walker-internal note). A request's decline reason is written by the owner
 * FOR the client (the Task-1 policy exposes the row; the decline email
 * carries the same text). Recorded in DEVIATIONS.md.
 */

export type BookingRequestStatus = 'pending' | 'approved' | 'declined';

export const BOOKING_REQUEST_COLUMNS =
  'id, business_id, client_id, service_id, pet_ids, window_start, window_end, note_md, ' +
  'status, decline_reason, visit_id, created_at, ' +
  'service:services(name), visit:visits(scheduled_start, business_tz)';

export type PortalBookingRequest = {
  id: string;
  business_id: string;
  client_id: string;
  service_id: string;
  pet_ids: string[];
  window_start: string;
  window_end: string;
  note_md: string | null;
  status: BookingRequestStatus;
  decline_reason: string | null;
  visit_id: string | null;
  created_at: string;
  /** Null when the service was deactivated (client policy reads active only). */
  service: { name: string } | null;
  /** The approved visit (client's own-visits read); null until approved. */
  visit: { scheduled_start: string; business_tz: string } | null;
};

/** The client's own requests, newest first (own-select RLS). */
export async function listMyBookingRequests(clientId: string): Promise<PortalBookingRequest[]> {
  const { data, error } = await supabase
    .from('booking_requests')
    .select(BOOKING_REQUEST_COLUMNS)
    .eq('client_id', clientId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as PortalBookingRequest[];
}

/**
 * Prices INCLUDED: the client is the payer and Task 1 grants them the active
 * services of their linked businesses (the request form shows the price list).
 */
export const PORTAL_SERVICE_COLUMNS =
  'id, name, duration_min, base_price_cents, extra_pet_price_cents';

export type PortalService = {
  id: string;
  name: string;
  duration_min: number;
  base_price_cents: number;
  extra_pet_price_cents: number;
};

/** Active services of the scoped business (client services-select RLS). */
export async function listPortalServices(businessId: string): Promise<PortalService[]> {
  const { data, error } = await supabase
    .from('services')
    .select(PORTAL_SERVICE_COLUMNS)
    .eq('business_id', businessId)
    .eq('active', true)
    .order('name', { ascending: true });
  if (error) throw error;
  return (data ?? []) as PortalService[];
}

export type BookingRequestInput = {
  businessId: string;
  clientId: string;
  serviceId: string;
  petIds: string[];
  startUtc: Date;
  endUtc: Date;
  note: string;
};

/**
 * Insert the client's pending request. The RLS insert policy enforces every
 * field of this shape (pending, self-authored, own client/pets, active
 * service of the linked business) — this function just states it honestly.
 * The Task-1 AFTER INSERT trigger queues the owner's heads-up email.
 */
export async function createBookingRequest(input: BookingRequestInput): Promise<{ id: string }> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error('You must be signed in to request a service.');
  const note = input.note.trim();
  const { data, error } = await supabase
    .from('booking_requests')
    .insert({
      business_id: input.businessId,
      client_id: input.clientId,
      service_id: input.serviceId,
      pet_ids: input.petIds,
      window_start: input.startUtc.toISOString(),
      window_end: input.endUtc.toISOString(),
      note_md: note.length > 0 ? note : null,
      status: 'pending',
      created_by: session.user.id,
    })
    .select('id')
    .single();
  if (error) throw error;
  return { id: (data as { id: string }).id };
}

/**
 * 'YYYY-MM-DD' + two 'HH:MM' wall times in the business tz -> UTC window.
 * Null on malformed input or a window that does not END AFTER it starts —
 * the client-side mirror of the schema's `check (window_end > window_start)`.
 */
export function requestWindow(
  dateText: string,
  startText: string,
  endText: string,
  tz: string,
): { startUtc: Date; endUtc: Date } | null {
  const startUtc = parseLocalDateTime(`${dateText.trim()} ${startText.trim()}`, tz);
  const endUtc = parseLocalDateTime(`${dateText.trim()} ${endText.trim()}`, tz);
  if (!startUtc || !endUtc) return null;
  if (endUtc.getTime() <= startUtc.getTime()) return null;
  return { startUtc, endUtc };
}

/** Status chip for the client's request list (StatusBadge tones). */
export function requestStatusChip(status: BookingRequestStatus): { label: string; tone: ChipTone } {
  if (status === 'approved') return { label: 'Approved', tone: 'green' };
  if (status === 'declined') return { label: 'Declined', tone: 'muted' };
  return { label: 'Pending', tone: 'warning' };
}

/** "Thu, Aug 27 · 2:00 PM – 4:00 PM" in the business zone. */
export function requestWindowLabel(startIso: string, endIso: string, tz: string): string {
  const start = formatInTimeZone(new Date(startIso), tz, 'EEE, MMM d · h:mm a');
  const end = formatInTimeZone(new Date(endIso), tz, 'h:mm a');
  return `${start} – ${end}`;
}

// ===== owner side =====

export const OWNER_REQUEST_COLUMNS =
  'id, business_id, client_id, service_id, pet_ids, window_start, window_end, note_md, ' +
  'status, created_at, client:clients(name), service:services(name, duration_min)';

export type OwnerBookingRequest = {
  id: string;
  business_id: string;
  client_id: string;
  service_id: string;
  pet_ids: string[];
  window_start: string;
  window_end: string;
  note_md: string | null;
  status: BookingRequestStatus;
  created_at: string;
  client: { name: string } | null;
  /** duration_min feeds the approve card's walker-chip slot hints. */
  service: { name: string; duration_min: number } | null;
};

/** The business's pending requests, oldest first (owner-select RLS). */
export async function listPendingBookingRequests(businessId: string): Promise<OwnerBookingRequest[]> {
  const { data, error } = await supabase
    .from('booking_requests')
    .select(OWNER_REQUEST_COLUMNS)
    .eq('business_id', businessId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as OwnerBookingRequest[];
}

/**
 * Owner approves: the RPC creates the visit at the service's current price
 * (unassigned, or offered to p_walker), stamps the request, queues the client
 * email, audits. Returns the new visit id. startUtc null -> the RPC schedules
 * at window_start; given -> the RPC validates it inside [window_start,
 * window_end) and schedules there (migration 20260827000001).
 */
export async function approveBookingRequest(
  requestId: string,
  walkerId: string | null = null,
  startUtc: Date | null = null,
): Promise<string> {
  const { data, error } = await supabase.rpc('approve_booking_request', {
    p_request: requestId,
    p_walker: walkerId,
    p_start: startUtc ? startUtc.toISOString() : null,
  });
  if (error) throw error;
  return data as string;
}

/** Wall-clock 'HH:MM' of the window start in the business tz — the start picker's default. */
export function windowStartHhmm(startIso: string, tz: string): string {
  return formatInTimeZone(new Date(startIso), tz, 'HH:mm');
}

/** "2:00 PM – 4:00 PM" in the business tz — the start picker's allowed range hint. */
export function windowTimeRangeLabel(startIso: string, endIso: string, tz: string): string {
  const start = formatInTimeZone(new Date(startIso), tz, 'h:mm a');
  const end = formatInTimeZone(new Date(endIso), tz, 'h:mm a');
  return `${start} – ${end}`;
}

/**
 * The owner's picked 'HH:MM' on the request's DATE (the window-start day in
 * the business tz) -> UTC instant, validated inside the half-open window
 * [window_start, window_end) — the client-side mirror of the RPC's p_start
 * checks. Null on malformed input or a pick outside the window. The
 * wall-clock -> zone conversion is parseLocalDateTime (date-fns-tz), the same
 * helper the request form uses — no hand-rolled DST math.
 */
export function approveStartUtc(
  windowStartIso: string,
  windowEndIso: string,
  hhmm: string,
  tz: string,
): Date | null {
  const dateText = formatInTimeZone(new Date(windowStartIso), tz, 'yyyy-MM-dd');
  const start = parseLocalDateTime(`${dateText} ${hhmm}`, tz);
  if (!start) return null;
  const windowStart = new Date(windowStartIso).getTime();
  const windowEnd = new Date(windowEndIso).getTime();
  if (start.getTime() < windowStart || start.getTime() >= windowEnd) return null;
  return start;
}

/** Owner declines with a reason (required by the RPC; rides the client email). */
export async function declineBookingRequest(requestId: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc('decline_booking_request', {
    p_request: requestId,
    p_reason: reason.trim(),
  });
  if (error) throw error;
}
