import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';

import { supabase } from '@/src/lib/supabase';

// Walker availability + time off (Plan 3 Task 6, spec §6.2).
//
// availability_rules stores plain `time` columns: rules are local wall-clock
// ranges with NO time-zone conversion anywhere — the weekday/day labels are
// merely read in the business-tz context. Weekday convention is JS getDay():
// 0 = Sunday … 6 = Saturday (the src/lib/schedule contract).
// Midnight-crossing ranges are unsupported (end must be after start on the
// same local day; DB enforces end_local > start_local).
//
// time_off stores timestamptz instants: the form's 'YYYY-MM-DD HH:MM' wall
// times are interpreted in the BUSINESS time zone (businesses.time_zone) and
// converted to UTC with date-fns-tz fromZonedTime — same DST semantics as
// src/lib/schedule/recur.ts (gap wall times resolve with the post-transition
// offset; ambiguous take the first occurrence).

export type AvailabilityRule = {
  id: string;
  user_id: string;
  business_id: string;
  weekday: number;
  /** Postgres `time` value, e.g. '09:00:00'. */
  start_local: string;
  end_local: string;
  created_at: string;
};

export type TimeOff = {
  id: string;
  user_id: string;
  business_id: string;
  starts_at: string;
  ends_at: string;
  reason: string | null;
  created_at: string;
};

export const WEEKDAY_LABELS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Lenient 'HH:MM' parse: a single-digit hour and surrounding whitespace are
 * accepted; returns the canonical zero-padded form, or null outside
 * 00:00–23:59 / for anything malformed.
 */
export function parseLocalTime(text: string): string | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(text.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${pad(h)}:${pad(min)}`;
}

export type TimeRangeResult =
  | { ok: true; start: string; end: string }
  | { ok: false; error: string };

/** Validate an availability range: both times parse and start < end (same local day only). */
export function validateTimeRange(startText: string, endText: string): TimeRangeResult {
  const start = parseLocalTime(startText);
  const end = parseLocalTime(endText);
  if (!start || !end) return { ok: false, error: 'Enter times as HH:MM' };
  if (end <= start) return { ok: false, error: 'End must be after start' };
  return { ok: true, start, end };
}

/**
 * Parse 'YYYY-MM-DD HH:MM' (business-tz wall time; single-digit hour allowed)
 * to a UTC instant. Returns null for malformed input or impossible calendar
 * dates (e.g. 2026-02-30).
 */
export function parseLocalDateTime(text: string, tz: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{1,2}):(\d{2})$/.exec(text.trim());
  if (!m) return null;
  const [, y, mo, d] = m;
  const time = parseLocalTime(`${m[4]}:${m[5]}`);
  if (!time) return null;
  // Calendar validity: round-trip the Y/M/D parts through a UTC date.
  const probe = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
  if (
    probe.getUTCFullYear() !== Number(y) ||
    probe.getUTCMonth() !== Number(mo) - 1 ||
    probe.getUTCDate() !== Number(d)
  ) {
    return null;
  }
  return fromZonedTime(`${y}-${mo}-${d}T${time}:00`, tz);
}

export type TimeOffRangeResult =
  | { ok: true; startsAt: Date; endsAt: Date }
  | { ok: false; error: string };

/** Validate a time-off form pair and convert to UTC instants in the business tz. */
export function validateTimeOffRange(
  startText: string,
  endText: string,
  tz: string,
): TimeOffRangeResult {
  const startsAt = parseLocalDateTime(startText, tz);
  if (!startsAt) return { ok: false, error: 'Enter the start as YYYY-MM-DD HH:MM' };
  const endsAt = parseLocalDateTime(endText, tz);
  if (!endsAt) return { ok: false, error: 'Enter the end as YYYY-MM-DD HH:MM' };
  if (endsAt.getTime() <= startsAt.getTime()) return { ok: false, error: 'End must be after start' };
  return { ok: true, startsAt, endsAt };
}

/** '09:00:00' (Postgres time) → '09:00' for display and form prefill. */
export function formatLocalTime(time: string): string {
  return time.slice(0, 5);
}

/** Render a time-off range in the business tz; the date appears once when same-day. */
export function formatTimeOffRange(startsAt: string, endsAt: string, tz: string): string {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  const startText = formatInTimeZone(start, tz, 'MMM d, yyyy HH:mm');
  const sameDay = formatInTimeZone(start, tz, 'yyyy-MM-dd') === formatInTimeZone(end, tz, 'yyyy-MM-dd');
  const endText = formatInTimeZone(end, tz, sameDay ? 'HH:mm' : 'MMM d, yyyy HH:mm');
  return `${startText} – ${endText}`;
}

/** Bucket rules into 7 weekday lists (Sun–Sat), each sorted by start_local. */
export function groupRulesByWeekday(rules: AvailabilityRule[]): AvailabilityRule[][] {
  const grouped: AvailabilityRule[][] = Array.from({ length: 7 }, () => []);
  for (const r of rules) grouped[r.weekday]?.push(r);
  for (const day of grouped) day.sort((a, b) => a.start_local.localeCompare(b.start_local));
  return grouped;
}

// RLS on both tables is "member manages own rows" (user_id = auth.uid()), so
// every query pins user_id from the local session — same pattern as
// listMyMemberships (auth.getSession is local, no network).
async function sessionUserId(): Promise<string | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user.id ?? null;
}

export async function listMyAvailability(businessId: string): Promise<AvailabilityRule[]> {
  const userId = await sessionUserId();
  if (!userId) return [];
  const { data, error } = await supabase
    .from('availability_rules')
    .select('*')
    .eq('business_id', businessId)
    .eq('user_id', userId)
    .order('weekday')
    .order('start_local');
  if (error) throw error;
  return (data ?? []) as AvailabilityRule[];
}

export async function addRule(
  businessId: string,
  weekday: number,
  startLocal: string,
  endLocal: string,
): Promise<AvailabilityRule> {
  const range = validateTimeRange(startLocal, endLocal);
  if (!range.ok) throw new Error(range.error);
  const userId = await sessionUserId();
  if (!userId) throw new Error('not signed in');
  const { data, error } = await supabase
    .from('availability_rules')
    .insert({
      user_id: userId,
      business_id: businessId,
      weekday,
      start_local: range.start,
      end_local: range.end,
    })
    .select()
    .single();
  if (error) throw error;
  return data as AvailabilityRule;
}

export async function deleteRule(id: string): Promise<void> {
  const { error } = await supabase.from('availability_rules').delete().eq('id', id);
  if (error) throw error;
}

export async function listMyTimeOff(businessId: string): Promise<TimeOff[]> {
  const userId = await sessionUserId();
  if (!userId) return [];
  const { data, error } = await supabase
    .from('time_off')
    .select('*')
    .eq('business_id', businessId)
    .eq('user_id', userId)
    .order('starts_at');
  if (error) throw error;
  return (data ?? []) as TimeOff[];
}

export async function addTimeOff(
  businessId: string,
  startsAtUtc: Date,
  endsAtUtc: Date,
  reason: string | null,
): Promise<TimeOff> {
  if (endsAtUtc.getTime() <= startsAtUtc.getTime()) throw new Error('End must be after start');
  const userId = await sessionUserId();
  if (!userId) throw new Error('not signed in');
  const { data, error } = await supabase
    .from('time_off')
    .insert({
      user_id: userId,
      business_id: businessId,
      starts_at: startsAtUtc.toISOString(),
      ends_at: endsAtUtc.toISOString(),
      reason: reason?.trim() || null,
    })
    .select()
    .single();
  if (error) throw error;
  return data as TimeOff;
}

export async function deleteTimeOff(id: string): Promise<void> {
  const { error } = await supabase.from('time_off').delete().eq('id', id);
  if (error) throw error;
}
