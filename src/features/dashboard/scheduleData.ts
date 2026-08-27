import { useQuery } from '@tanstack/react-query';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';

import {
  listActiveMembers,
  listVisits,
  memberName,
  type ScheduleMember,
  type Visit,
} from '@/src/features/schedule/api';
import { visitsByDay, weekRange, type WeekDay } from '@/src/features/schedule/weekGrid';
import type { VisitStatus } from '@/src/lib/schedule/machine';
import { supabase } from '@/src/lib/supabase';

// Plan 8b Task 3 — data + pure shaping for the dashboard SchedulePanel (week
// schedule table + month mini-calendar). Pure functions are tested in
// __tests__/scheduleData.test.ts; queries reuse the schedule feature's api
// (listVisits / listActiveMembers) rather than duplicating selects.
//
// WEEK/MONTH FRAME: like the desktop week grid (weekGrid.ts), the panel draws
// in ONE zone — the business tz. All week math delegates to weekRange and all
// day bucketing to visitsByDay, so DST months/weeks come out right with no
// hand-rolled tz arithmetic here. Month bounds use fromZonedTime of local
// midnight (the weekRange pattern).

// ---- status vocabulary ----------------------------------------------------

/** Same wording as VisitScreen's STATUS_LABEL (not exported there). */
export const STATUS_LABELS: Record<VisitStatus, string> = {
  unassigned: 'Unassigned',
  offered: 'Offered',
  accepted: 'Accepted',
  in_progress: 'In progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

/** Same 3-way color grouping as WeekGridView's blockColors (not exported there). */
export type StatusTone = 'warning' | 'muted' | 'positive';

export function statusTone(status: VisitStatus): StatusTone {
  if (status === 'unassigned') return 'warning';
  if (status === 'offered') return 'muted';
  // accepted / in_progress / completed: the covered states (Round 0 green).
  return 'positive';
}

// ---- week table -----------------------------------------------------------

export type WalkerFilter = 'all' | string;

export type ScheduleRow = {
  id: string;
  /** Local day + wall time in the business tz, e.g. 'Mon 24, 09:00'. */
  timeLabel: string;
  clientName: string;
  /** 'Rex, Bella' — empty string when no pet names resolved. */
  petNames: string;
  serviceName: string;
  /** Resolved display name; null = unassigned (render the chip). */
  walkerName: string | null;
  status: VisitStatus;
};

/**
 * Non-cancelled visits of the selected week as render-ready table rows, sorted
 * by start instant, optionally narrowed to one walker's visits.
 */
export function weekTableRows(
  visits: Visit[],
  members: ScheduleMember[],
  petNamesById: Map<string, string>,
  tz: string,
  walkerFilter: WalkerFilter = 'all',
): ScheduleRow[] {
  return visits
    .filter((v) => v.status !== 'cancelled')
    .filter((v) => walkerFilter === 'all' || v.walker_id === walkerFilter)
    .sort((a, b) => a.scheduled_start.localeCompare(b.scheduled_start))
    .map((v) => ({
      id: v.id,
      timeLabel: formatInTimeZone(new Date(v.scheduled_start), tz, 'EEE d, HH:mm'),
      clientName: v.client?.name ?? 'Client',
      petNames: v.pet_ids
        .map((id) => petNamesById.get(id))
        .filter((n): n is string => !!n)
        .join(', '),
      serviceName: v.service?.name ?? 'Service',
      walkerName: v.walker_id ? memberName(members, v.walker_id) : null,
      status: v.status,
    }));
}

/** First `cap` rows plus how many were cut ('+N more this week'). */
export function capRows<T>(rows: T[], cap = 12): { visible: T[]; moreCount: number } {
  if (rows.length <= cap) return { visible: rows, moreCount: 0 };
  return { visible: rows.slice(0, cap), moreCount: rows.length - cap };
}

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

/** 'Aug 24 – 30' (same month) or 'Aug 30 – Sep 5' from weekDays() output. */
export function weekLabel(days: WeekDay[]): string {
  const first = days[0]!.ymd;
  const last = days[6]!.ymd;
  const m1 = MONTHS_SHORT[Number(first.slice(5, 7)) - 1]!;
  const m2 = MONTHS_SHORT[Number(last.slice(5, 7)) - 1]!;
  const d1 = Number(first.slice(8, 10));
  const d2 = Number(last.slice(8, 10));
  return m1 === m2 ? `${m1} ${d1} – ${d2}` : `${m1} ${d1} – ${m2} ${d2}`;
}

// ---- month mini-calendar --------------------------------------------------
//
// A month is addressed by its LOCAL 'YYYY-MM' key. Grid layout is pure
// calendar arithmetic on that key (Date.UTC anchors, the weekGrid pattern —
// weekday/day-count of a local calendar date never depends on tz), while the
// UTC query window comes from fromZonedTime of local midnight, so DST months
// (743/745 real hours) query correctly.

export type MonthCell = {
  /** Local calendar date, 'YYYY-MM-DD'. */
  ymd: string;
  /** Day of month, 1-based. */
  day: number;
};

const pad = (n: number) => String(n).padStart(2, '0');

/** Sun-first weeks of the month; null cells pad the leading/trailing edges. */
export function monthGrid(ym: string): (MonthCell | null)[][] {
  const year = Number(ym.slice(0, 4));
  const month = Number(ym.slice(5, 7)); // 1-based
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay(); // 0 = Sunday
  const cells: (MonthCell | null)[] = Array.from({ length: firstWeekday }, () => null);
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({ ymd: `${ym}-${pad(day)}`, day });
  }
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (MonthCell | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/** 'YYYY-MM' shifted by `delta` months (delta may be negative). */
export function shiftMonth(ym: string, delta: number): string {
  const year = Number(ym.slice(0, 4));
  const month = Number(ym.slice(5, 7)) - 1 + delta;
  const d = new Date(Date.UTC(year, month, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}

/** 'August 2026' */
export function monthTitle(ym: string): string {
  return `${MONTHS_LONG[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
}

export type MonthRange = { fromUtc: Date; toUtc: Date };

/** UTC query window [local 1st 00:00, next month's local 1st 00:00) in tz. */
export function monthRangeUtc(ym: string, tz: string): MonthRange {
  const next = shiftMonth(ym, 1);
  return {
    fromUtc: fromZonedTime(`${ym}-01T00:00:00`, tz),
    toUtc: fromZonedTime(`${next}-01T00:00:00`, tz),
  };
}

/** Non-cancelled visit count per LOCAL day ('YYYY-MM-DD') — visitsByDay reuse. */
export function countVisitsByDay(
  visits: { scheduled_start: string; status: string }[],
  tz: string,
): Map<string, number> {
  const byDay = visitsByDay(visits.filter((v) => v.status !== 'cancelled'), tz);
  return new Map([...byDay.entries()].map(([day, list]) => [day, list.length]));
}

/** The local 'YYYY-MM' containing nowUtc in tz. */
export function currentYm(nowUtc: Date, tz: string): string {
  return formatInTimeZone(nowUtc, tz, 'yyyy-MM');
}

/** The local 'YYYY-MM-DD' containing nowUtc in tz (today highlight). */
export function todayYmd(nowUtc: Date, tz: string): string {
  return formatInTimeZone(nowUtc, tz, 'yyyy-MM-dd');
}

// ---- queries --------------------------------------------------------------

/**
 * Pet display names for a set of ids in one read (report.ts listPetNames
 * pattern — pets carries no business_id column; RLS scopes the read).
 */
export async function fetchPetNames(petIds: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(petIds)];
  if (unique.length === 0) return new Map();
  const { data, error } = await supabase.from('pets').select('id, name').in('id', unique);
  if (error) throw error;
  return new Map(((data ?? []) as { id: string; name: string }[]).map((p) => [p.id, p.name]));
}

export type WeekSchedule = { visits: Visit[]; petNamesById: Map<string, string> };

/** The selected week's visits plus every referenced pet name, two reads total. */
export async function fetchWeekSchedule(
  businessId: string,
  window: { fromUtc: Date; toUtc: Date },
): Promise<WeekSchedule> {
  const visits = await listVisits(businessId, window);
  const petNamesById = await fetchPetNames(visits.flatMap((v) => v.pet_ids));
  return { visits, petNamesById };
}

/** Week-table query for the panel. Key nests under ['visits', businessId]. */
export function useWeekSchedule(businessId: string | null, tz: string | null, anchor: Date) {
  const range = tz ? weekRange(anchor, tz) : null;
  return useQuery({
    queryKey: ['visits', businessId, 'dashWeek', range?.weekStartYmd],
    enabled: !!businessId && !!range,
    queryFn: () => fetchWeekSchedule(businessId!, range!),
  });
}

/** Month mini-calendar counts. Key nests under ['visits', businessId]. */
export function useMonthVisitCounts(businessId: string | null, tz: string | null, ym: string | null) {
  return useQuery({
    queryKey: ['visits', businessId, 'dashMonth', ym],
    enabled: !!businessId && !!tz && !!ym,
    queryFn: async () => {
      const visits = await listVisits(businessId!, monthRangeUtc(ym!, tz!));
      return countVisitsByDay(visits, tz!);
    },
  });
}

/** Active members — same key as WeekGridView so the cache is shared. */
export function useScheduleMembers(businessId: string | null) {
  return useQuery({
    queryKey: ['scheduleMembers', businessId],
    enabled: !!businessId,
    queryFn: () => listActiveMembers(businessId!),
  });
}
