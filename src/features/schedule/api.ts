import { formatInTimeZone } from 'date-fns-tz';

import { parseLocalDateTime } from '@/src/features/availability/api';
import {
  inTimeOff,
  overlaps,
  withinAvailability,
  type AvailabilityRule as ConflictRule,
} from '@/src/lib/schedule/conflicts';
import type { VisitStatus } from '@/src/lib/schedule/machine';
import { supabase } from '@/src/lib/supabase';

// Visit series API (Plan 3 Task 4). Series rows only — visit rows are
// materialised by the expand-series edge function, which createSeries invokes
// right after the insert (and a nightly cron re-runs for every active series).
//
// rrule contract (mirrored by supabase/functions/expand-series/expand.ts):
// the canonical weekly form `FREQ=WEEKLY;BYDAY=MO,WE,FR` with RFC 5545 weekday
// codes. Weekday numbers are JS getDay(): 0 = Sunday … 6 = Saturday.

export const BYDAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const;

export type VisitSeries = {
  id: string;
  business_id: string;
  client_id: string;
  service_id: string;
  walker_id: string;
  rrule: string;
  starts_on: string;
  ends_on: string | null;
  local_start: string;
  pet_ids: string[];
  active: boolean;
  created_at: string;
};

export type SeriesInput = {
  businessId: string;
  clientId: string;
  serviceId: string;
  walkerId: string;
  petIds: string[];
  /** Local weekdays, 0 = Sunday … 6 = Saturday. */
  weekdays: number[];
  /** Local wall-clock start, 'HH:MM'. */
  localStart: string;
  /** First possible occurrence date, 'YYYY-MM-DD' (in the business tz). */
  startsOn: string;
  /** Last possible occurrence date (inclusive), or null for open-ended. */
  endsOn?: string | null;
};

/** Canonical weekly rrule for a weekday set; throws on an empty or invalid set. */
export function buildWeeklyRRule(weekdays: number[]): string {
  const unique = [...new Set(weekdays)].sort((a, b) => a - b);
  if (unique.length === 0) throw new Error('a series needs at least one weekday');
  if (unique.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) {
    throw new Error('weekdays must be integers 0-6');
  }
  return `FREQ=WEEKLY;BYDAY=${unique.map((d) => BYDAY_CODES[d]).join(',')}`;
}

const LOCAL_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Shape a SeriesInput into the visit_series insert row; throws on bad input. */
export function seriesInsertRow(input: SeriesInput) {
  if (!LOCAL_TIME.test(input.localStart)) throw new Error(`bad localStart: ${input.localStart}`);
  if (!ISO_DATE.test(input.startsOn)) throw new Error(`bad startsOn: ${input.startsOn}`);
  if (input.endsOn != null && !ISO_DATE.test(input.endsOn)) throw new Error(`bad endsOn: ${input.endsOn}`);
  if (input.endsOn != null && input.endsOn < input.startsOn) {
    throw new Error('endsOn is before startsOn');
  }
  return {
    business_id: input.businessId,
    client_id: input.clientId,
    service_id: input.serviceId,
    walker_id: input.walkerId,
    pet_ids: input.petIds,
    rrule: buildWeeklyRRule(input.weekdays),
    starts_on: input.startsOn,
    ends_on: input.endsOn ?? null,
    local_start: input.localStart,
  };
}

/**
 * Insert a series, then invoke expand-series with the caller's JWT so the first
 * 8 weeks of visits exist before the screen returns.
 */
export async function createSeries(input: SeriesInput): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from('visit_series')
    .insert(seriesInsertRow(input))
    .select('id')
    .single();
  if (error) throw error;
  const id = (data as { id: string }).id;
  const { error: fnError } = await supabase.functions.invoke('expand-series', {
    body: { seriesId: id },
  });
  if (fnError) throw fnError;
  return { id };
}

export async function listSeries(businessId: string): Promise<VisitSeries[]> {
  const { data, error } = await supabase
    .from('visit_series')
    .select('*')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as VisitSeries[];
}

/** Stop future expansion. Already-materialised visits are untouched. */
export async function deactivateSeries(id: string): Promise<void> {
  const { error } = await supabase.from('visit_series').update({ active: false }).eq('id', id);
  if (error) throw error;
}

// ============================== Visits (Task 7) ==============================
//
// COLUMN-GRANT RULE (see DEVIATIONS, Plan 3 Task 1): `visits.price_cents_snapshot`
// is excluded from the select grant for EVERY client role — the owner included.
// Any `select('*')` (and any insert/update `.select()` without columns) on
// `visits` fails with 42501. Every visits read below therefore names columns
// and never the price. Writes may still stamp the price (whole-table
// insert/update grants).

/** Every client-readable visits column — everything except price_cents_snapshot. */
export const VISIT_COLUMNS =
  'id, business_id, client_id, service_id, series_id, walker_id, pet_ids, ' +
  'scheduled_start, scheduled_end, business_tz, status, owner_notes_md, ' +
  'decline_reason, started_at, finished_at, ' +
  'client:clients(name, phones), service:services(name, duration_min)';

export type Visit = {
  id: string;
  business_id: string;
  client_id: string;
  service_id: string;
  series_id: string | null;
  walker_id: string | null;
  pet_ids: string[];
  scheduled_start: string;
  scheduled_end: string;
  business_tz: string;
  status: VisitStatus;
  owner_notes_md: string | null;
  decline_reason: string | null;
  started_at: string | null;
  finished_at: string | null;
  /** phones rides on the owner read path only (MY_VISIT_COLUMNS omits it). */
  client: { name: string; phones?: string[] } | null;
  service: { name: string; duration_min: number } | null;
};

// ---- pure helpers (tested in __tests__/visits.test.ts) ----

/**
 * Price stamped onto a visit at creation (spec: base + extra-pet x (pets - 1),
 * mirroring the survey's "+$5/extra pet"). Clamped so 0 pets never discounts.
 */
export function priceSnapshotCents(
  service: { base_price_cents: number; extra_pet_price_cents: number },
  petCount: number,
): number {
  return service.base_price_cents + service.extra_pet_price_cents * Math.max(petCount - 1, 0);
}

/**
 * 'YYYY-MM-DD' + 'HH:MM' wall time in the business tz -> UTC start/end instants
 * (date-fns-tz; same DST semantics as recur.ts). Null on malformed input or an
 * impossible calendar date.
 */
export function visitInstants(
  dateText: string,
  timeText: string,
  durationMin: number,
  tz: string,
): { startUtc: Date; endUtc: Date } | null {
  const startUtc = parseLocalDateTime(`${dateText.trim()} ${timeText.trim()}`, tz);
  if (!startUtc) return null;
  return { startUtc, endUtc: new Date(startUtc.getTime() + durationMin * 60_000) };
}

export type DayGroup<T> = { day: string; visits: T[] };

/**
 * Group visits by their LOCAL calendar day, each visit rendered in its own
 * business_tz. Groups sorted ascending, visits within a group by start time.
 */
export function groupVisitsByLocalDay<
  T extends { scheduled_start: string; business_tz: string },
>(visits: T[]): DayGroup<T>[] {
  const byDay = new Map<string, T[]>();
  for (const v of visits) {
    const day = formatInTimeZone(new Date(v.scheduled_start), v.business_tz, 'yyyy-MM-dd');
    const list = byDay.get(day) ?? [];
    list.push(v);
    byDay.set(day, list);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, list]) => ({
      day,
      visits: list.sort((a, b) => a.scheduled_start.localeCompare(b.scheduled_start)),
    }));
}

/** Local wall-clock range in the visit's own business tz, e.g. "09:00 – 09:30". */
export function visitTimeRange(v: {
  scheduled_start: string;
  scheduled_end: string;
  business_tz: string;
}): string {
  const start = formatInTimeZone(new Date(v.scheduled_start), v.business_tz, 'HH:mm');
  const end = formatInTimeZone(new Date(v.scheduled_end), v.business_tz, 'HH:mm');
  return `${start} – ${end}`;
}

/** Short local day label in the visit's own business tz, e.g. "Tue, Sep 1". */
export function visitDayLabel(v: { scheduled_start: string; business_tz: string }): string {
  return formatInTimeZone(new Date(v.scheduled_start), v.business_tz, 'EEE, MMM d');
}

/** Visits whose LOCAL calendar day (own business_tz) matches nowUtc's local day. */
export function visitsOnLocalDay<T extends { scheduled_start: string; business_tz: string }>(
  visits: T[],
  nowUtc: Date,
): T[] {
  return visits.filter(
    (v) =>
      formatInTimeZone(new Date(v.scheduled_start), v.business_tz, 'yyyy-MM-dd') ===
      formatInTimeZone(nowUtc, v.business_tz, 'yyyy-MM-dd'),
  );
}

/**
 * Walker Today split: offers are status 'offered' on ANY date (soonest first);
 * today is status 'accepted' or 'in_progress' on the current local day (business tz),
 * ascending — an in-progress visit must stay visible (found in Checkpoint 4: it vanished
 * from Today after a relaunch, leaving no way back to the active screen).
 */
export function partitionWalkerDay<
  T extends { status: string; scheduled_start: string; business_tz: string },
>(visits: T[], nowUtc: Date): { offers: T[]; today: T[] } {
  const byStart = (a: T, b: T) => a.scheduled_start.localeCompare(b.scheduled_start);
  return {
    offers: visits.filter((v) => v.status === 'offered').sort(byStart),
    today: visitsOnLocalDay(
      visits.filter((v) => v.status === 'accepted' || v.status === 'in_progress'),
      nowUtc,
    ).sort(byStart),
  };
}

// ---- Today hero helpers (Today/navigation redesign, part B) ----

export type UpNextVisit = {
  id: string;
  status: string;
  scheduled_start: string;
  scheduled_end: string;
  business_tz: string;
};

/**
 * The session user's single "Up next" visit (Today hero): an in_progress visit
 * always wins (soonest scheduled first — it is running even past its window),
 * then the soonest accepted that is not already over (scheduled_end > now),
 * then the soonest such offered. Callers pre-filter to the user's OWN visits
 * (walkers additionally drop offered — those live in the offers strip).
 */
export function pickUpNext<T extends UpNextVisit>(visits: T[], nowUtc: Date): T | null {
  const byStart = (a: T, b: T) => a.scheduled_start.localeCompare(b.scheduled_start);
  const live = (v: T) => new Date(v.scheduled_end).getTime() > nowUtc.getTime();
  const running = visits.filter((v) => v.status === 'in_progress').sort(byStart);
  if (running.length > 0) return running[0]!;
  const accepted = visits.filter((v) => v.status === 'accepted' && live(v)).sort(byStart);
  if (accepted.length > 0) return accepted[0]!;
  const offered = visits.filter((v) => v.status === 'offered' && live(v)).sort(byStart);
  return offered[0] ?? null;
}

/**
 * "Rest of your day": the user's remaining OWN visits on the current local day
 * (per-visit business_tz) — accepted/offered/in_progress, not already over
 * (an in_progress visit stays regardless of its window), the hero excluded,
 * ascending by start.
 */
export function restOfDay<T extends UpNextVisit>(
  visits: T[],
  nowUtc: Date,
  excludeId: string | null,
): T[] {
  const active = new Set(['accepted', 'offered', 'in_progress']);
  return visitsOnLocalDay(visits, nowUtc)
    .filter(
      (v) =>
        v.id !== excludeId &&
        active.has(v.status) &&
        (v.status === 'in_progress' || new Date(v.scheduled_end).getTime() > nowUtc.getTime()),
    )
    .sort((a, b) => a.scheduled_start.localeCompare(b.scheduled_start));
}

/**
 * requires_gps for one service, via the price-free services_public definer
 * view (readable by any member — the hero Start needs the flag without the
 * owner-only services table). A missing/deactivated service resolves false.
 */
export async function serviceRequiresGps(serviceId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('services_public')
    .select('id, requires_gps')
    .eq('id', serviceId)
    .maybeSingle();
  if (error) throw error;
  return !!(data as { requires_gps?: boolean } | null)?.requires_gps;
}

export type WalkerGroup<T> = { key: string; name: string; visits: T[] };

/**
 * Owner Today grouping: owner's own visits first, then walkers alphabetically
 * by display name, then an "Unassigned" bucket last. Cancelled visits and empty
 * groups are dropped; visits within a group sort by start time.
 */
export function groupTodayByWalker<T extends { walker_id: string | null; status: string; scheduled_start: string }>(
  visits: T[],
  members: ScheduleMember[],
): WalkerGroup<T>[] {
  const byKey = new Map<string, T[]>();
  for (const v of visits) {
    if (v.status === 'cancelled') continue;
    const key = v.walker_id ?? 'unassigned';
    const list = byKey.get(key) ?? [];
    list.push(v);
    byKey.set(key, list);
  }
  const ownerId = members.find((m) => m.role === 'owner')?.user_id;
  const groups = [...byKey.entries()].map(([key, list]) => ({
    key,
    name: key === 'unassigned' ? 'Unassigned' : memberName(members, key),
    visits: list.sort((a, b) => a.scheduled_start.localeCompare(b.scheduled_start)),
  }));
  return groups.sort((a, b) => {
    const rank = (g: WalkerGroup<T>) => (g.key === 'unassigned' ? 2 : g.key === ownerId ? 0 : 1);
    return rank(a) - rank(b) || a.name.localeCompare(b.name);
  });
}

/** Owner triage: unassigned, or declined (decline resets to unassigned + reason). */
export function needsAttention(v: { status: string; decline_reason: string | null }): boolean {
  return v.status === 'unassigned' || v.decline_reason != null;
}

// ---- Notification delivery surfacing (Plan 4 Task 6; email-only since the
// sms channel went dormant — migration 0013) ----

export type ProblemNotification = {
  id: string;
  channel: string;
  template: string;
  status: 'failed' | 'skipped_no_provider';
  payload: Record<string, unknown>;
};

/**
 * Owner-only strip line for undelivered notifications. All problem rows count
 * (invites included — the query is by terminal status, the simplest robust
 * signal). Channel-aware wording: with email as the only live channel the
 * common case reads "N emails not delivered"; a mixed set (a real sms failure
 * would surface again if the channel ever returns) falls back to the generic
 * noun rather than mislabeling.
 */
export function notificationIssueLabel(notifs: { channel: string; status: string }[]): string | null {
  const n = notifs.length;
  if (n === 0) return null;
  const allEmail = notifs.every((x) => x.channel === 'email');
  const noun = allEmail ? (n === 1 ? 'email' : 'emails') : (n === 1 ? 'notification' : 'notifications');
  return `${n} ${noun} not delivered`;
}

/** Visit ids referenced by problem notifications ("Report not sent" badges). */
export function problemVisitIds(notifs: ProblemNotification[]): Set<string> {
  const ids = new Set<string>();
  for (const nf of notifs) {
    const v = nf.payload['visitId'];
    if (typeof v === 'string') ids.add(v);
  }
  return ids;
}

export type ScheduleMember = {
  user_id: string;
  role: 'owner' | 'walker';
  display_name: string | null;
};

/**
 * Walker display names. `visits.walker_id` references auth.users with NO
 * profiles FK, so a `walker:profiles(...)` embed on visits is impossible —
 * names come from the memberships -> profiles embed (team.tsx pattern) and are
 * joined client-side via memberName().
 */
export function memberName(members: ScheduleMember[], userId: string): string {
  return members.find((m) => m.user_id === userId)?.display_name ?? 'Team member';
}

export type WalkerFlags = { available: boolean; onTimeOff: boolean; overlaps: number };

export type PickerContext = {
  rules: (ConflictRule & { user_id: string })[];
  timeOff: { user_id: string; starts_at: string; ends_at: string }[];
  visits: { id: string; walker_id: string; scheduled_start: string; scheduled_end: string }[];
};

/**
 * Availability flags for one picker row. Weekday/wall-time math happens in the
 * business tz (src/lib/schedule/conflicts.ts). Pass `excludeVisitId` when the
 * window belongs to an existing visit so it does not count itself as an overlap.
 */
export function walkerFlags(
  userId: string,
  ctx: PickerContext,
  window: { startUtc: Date; endUtc: Date },
  tz: string,
  opts?: { excludeVisitId?: string },
): WalkerFlags {
  const rules = ctx.rules.filter((r) => r.user_id === userId);
  const timeOff = ctx.timeOff.filter((t) => t.user_id === userId);
  const overlapCount = ctx.visits.filter(
    (v) =>
      v.walker_id === userId &&
      v.id !== opts?.excludeVisitId &&
      overlaps(window.startUtc, window.endUtc, new Date(v.scheduled_start), new Date(v.scheduled_end)),
  ).length;
  return {
    available: withinAvailability(window.startUtc, window.endUtc, rules, tz),
    onTimeOff: inTimeOff(window.startUtc, window.endUtc, timeOff),
    overlaps: overlapCount,
  };
}

// ---- queries ----

// Same local-session pattern as availability/api.ts sessionUserId.
async function sessionUserId(): Promise<string | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user.id ?? null;
}

export type ListVisitsWindow = { fromUtc: Date; toUtc: Date; status?: VisitStatus };

/** Visits whose start falls in [fromUtc, toUtc), ascending. Named columns only. */
export async function listVisits(businessId: string, window: ListVisitsWindow): Promise<Visit[]> {
  let query = supabase
    .from('visits')
    .select(VISIT_COLUMNS)
    .eq('business_id', businessId)
    .gte('scheduled_start', window.fromUtc.toISOString())
    .lt('scheduled_start', window.toUtc.toISOString());
  if (window.status) query = query.eq('status', window.status);
  const { data, error } = await query.order('scheduled_start');
  if (error) throw error;
  return (data ?? []) as unknown as Visit[];
}

/**
 * Walker-readable visit columns. Unlike VISIT_COLUMNS there is NO
 * `service:services(...)` embed: the services select policy is owner-only
 * (core migration: "owner reads services"), so under walker RLS the embed
 * resolves to null. Walkers read service names through the `services_public`
 * definer view instead, joined client-side (joinServices). The clients embed
 * DOES work for walkers via the Task 2 walker-visibility policy.
 */
export const MY_VISIT_COLUMNS =
  'id, business_id, client_id, service_id, series_id, walker_id, pet_ids, ' +
  'scheduled_start, scheduled_end, business_tz, status, owner_notes_md, ' +
  'decline_reason, started_at, finished_at, client:clients(name)';

export type PublicService = { id: string; name: string; duration_min: number };

/** Client-side stand-in for the services embed walkers cannot use. */
export function joinServices<T extends { service_id: string }>(
  visits: T[],
  services: PublicService[],
): (T & { service: { name: string; duration_min: number } | null })[] {
  const byId = new Map(services.map((s) => [s.id, s]));
  return visits.map((v) => {
    const s = byId.get(v.service_id);
    return { ...v, service: s ? { name: s.name, duration_min: s.duration_min } : null };
  });
}

/**
 * The session walker's visits in [fromUtc, toUtc), ascending, cancelled
 * excluded. No walker_id filter — the walker RLS select policy already pins
 * rows to walker_id = auth.uid(). Named columns only (price column grant).
 */
export async function listMyVisits(businessId: string, fromUtc: Date, toUtc: Date): Promise<Visit[]> {
  const { data, error } = await supabase
    .from('visits')
    .select(MY_VISIT_COLUMNS)
    .eq('business_id', businessId)
    .neq('status', 'cancelled')
    .gte('scheduled_start', fromUtc.toISOString())
    .lt('scheduled_start', toUtc.toISOString())
    .order('scheduled_start');
  if (error) throw error;
  const { data: services, error: svcError } = await supabase
    .from('services_public')
    .select('id, name, duration_min')
    .eq('business_id', businessId);
  if (svcError) throw svcError;
  type Row = Omit<Visit, 'service'>;
  return joinServices((data ?? []) as unknown as Row[], (services ?? []) as PublicService[]) as Visit[];
}

export async function getVisit(businessId: string, id: string): Promise<Visit> {
  const { data, error } = await supabase
    .from('visits')
    .select(VISIT_COLUMNS)
    .eq('business_id', businessId)
    .eq('id', id)
    .single();
  if (error) throw error;
  return data as unknown as Visit;
}

/**
 * Undelivered notification rows for the business. Owner-select RLS makes this
 * owner-only by construction (walkers read zero rows); 'failed' means the
 * sender gave up after its retry schedule, 'skipped_no_provider' means that
 * channel's provider credentials are not configured.
 *
 * EXCLUDED: channel='sms' AND status='skipped_no_provider' — the sms channel
 * is deliberately dormant (no Twilio, migration 0013), so "sms skipped for
 * lack of a provider" is the expected state of history rows, not a problem to
 * surface. A real failed sms (if the channel ever returns) and every email
 * problem still surface.
 */
export async function listProblemNotifications(businessId: string): Promise<ProblemNotification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('id, channel, template, status, payload')
    .eq('business_id', businessId)
    .in('status', ['failed', 'skipped_no_provider'])
    .or('channel.neq.sms,status.neq.skipped_no_provider')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as ProblemNotification[];
}

/** Active members of the business (owner included) for picker rows and names. */
export async function listActiveMembers(businessId: string): Promise<ScheduleMember[]> {
  const { data, error } = await supabase
    .from('memberships')
    .select('user_id, role, profile:profiles(display_name)')
    .eq('business_id', businessId)
    .eq('status', 'active')
    .order('created_at');
  if (error) throw error;
  type Row = { user_id: string; role: 'owner' | 'walker'; profile: { display_name: string | null } | null };
  return ((data ?? []) as unknown as Row[]).map((r) => ({
    user_id: r.user_id,
    role: r.role,
    display_name: r.profile?.display_name ?? null,
  }));
}

export type VisitInput = {
  businessId: string;
  clientId: string;
  serviceId: string;
  petIds: string[];
  startUtc: Date;
  endUtc: Date;
  /** IANA business time zone, stamped onto the row. */
  tz: string;
  /** priceSnapshotCents(service, petIds.length) — stamped at creation. */
  priceCents: number;
  /** null/undefined = leave unassigned. */
  walkerId?: string | null;
};

/**
 * One-off visit. Force-assign rule (plan Task 7): assigning YOURSELF inserts
 * directly as `accepted` (the transition guard only fires on update, and the
 * owner may force-assign anyway); assigning another walker inserts unassigned
 * then routes through `offer_visit` so the audit + offered flow apply.
 */
export async function createVisit(input: VisitInput): Promise<{ id: string }> {
  const base = {
    business_id: input.businessId,
    client_id: input.clientId,
    service_id: input.serviceId,
    pet_ids: input.petIds,
    scheduled_start: input.startUtc.toISOString(),
    scheduled_end: input.endUtc.toISOString(),
    business_tz: input.tz,
    price_cents_snapshot: input.priceCents,
  };
  const me = input.walkerId ? await sessionUserId() : null;
  const selfAssign = !!input.walkerId && input.walkerId === me;
  const row = selfAssign ? { ...base, walker_id: input.walkerId, status: 'accepted' } : base;
  // .select('id') — never a bare .select(): the price column grant rejects it.
  const { data, error } = await supabase.from('visits').insert(row).select('id').single();
  if (error) throw error;
  const id = (data as { id: string }).id;
  if (input.walkerId && !selfAssign) await offerVisit(id, input.walkerId);
  return { id };
}

/** Move a visit's window. No returning select (column grant). */
export async function rescheduleVisit(id: string, startUtc: Date, endUtc: Date): Promise<void> {
  const { error } = await supabase
    .from('visits')
    .update({ scheduled_start: startUtc.toISOString(), scheduled_end: endUtc.toISOString() })
    .eq('id', id);
  if (error) throw error;
}

/** Offer (or re-offer a declined-back-to-unassigned visit) to a walker. */
export async function offerVisit(visitId: string, walkerId: string): Promise<void> {
  const { error } = await supabase.rpc('offer_visit', { p_visit: visitId, p_walker: walkerId });
  if (error) throw error;
}

export async function cancelVisit(visitId: string): Promise<void> {
  const { error } = await supabase.rpc('cancel_visit', { p_visit: visitId });
  if (error) throw error;
}

/** Walker accepts an offered visit (offered -> accepted, guard-checked in DB). */
export async function acceptVisit(visitId: string): Promise<void> {
  const { error } = await supabase.rpc('accept_visit', { p_visit: visitId });
  if (error) throw error;
}

/**
 * Walker declines an offer. DB semantics: offered -> unassigned with
 * decline_reason set and walker_id cleared (reason is required by the guard).
 */
export async function declineVisit(visitId: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc('decline_visit', { p_visit: visitId, p_reason: reason });
  if (error) throw error;
}

/**
 * Everything the walker picker needs for one window: ALL availability rules and
 * time off in the business (the owner select policies allow cross-member reads;
 * the user-pinned list functions in features/availability are deliberately not
 * reused), plus assigned, non-cancelled visits overlapping the window.
 */
export async function pickerContext(
  businessId: string,
  windowStartUtc: Date,
  windowEndUtc: Date,
): Promise<PickerContext> {
  const rulesQ = supabase
    .from('availability_rules')
    .select('user_id, weekday, start_local, end_local')
    .eq('business_id', businessId);
  const timeOffQ = supabase
    .from('time_off')
    .select('user_id, starts_at, ends_at')
    .eq('business_id', businessId)
    .lt('starts_at', windowEndUtc.toISOString())
    .gt('ends_at', windowStartUtc.toISOString());
  const visitsQ = supabase
    .from('visits')
    .select('id, walker_id, scheduled_start, scheduled_end')
    .eq('business_id', businessId)
    .not('walker_id', 'is', null)
    .neq('status', 'cancelled')
    .lt('scheduled_start', windowEndUtc.toISOString())
    .gt('scheduled_end', windowStartUtc.toISOString());
  const [rules, timeOff, visits] = await Promise.all([rulesQ, timeOffQ, visitsQ]);
  if (rules.error) throw rules.error;
  if (timeOff.error) throw timeOff.error;
  if (visits.error) throw visits.error;
  return {
    rules: (rules.data ?? []) as PickerContext['rules'],
    timeOff: (timeOff.data ?? []) as PickerContext['timeOff'],
    visits: (visits.data ?? []) as PickerContext['visits'],
  };
}
