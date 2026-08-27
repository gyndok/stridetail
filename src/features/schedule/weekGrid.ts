import { formatInTimeZone, fromZonedTime, toZonedTime } from 'date-fns-tz';

// Pure week-grid math for the desktop schedule view (Plan 4 Task 8).
//
// The grid is drawn in ONE zone — the business tz — unlike the mobile list,
// which renders each visit in its own stamped business_tz (in practice they
// are the same zone; the grid needs a single day/column frame). Weekday
// convention matches recur.ts/conflicts.ts: JS getDay(), 0 = Sunday …
// 6 = Saturday, evaluated on the LOCAL calendar date in tz.
//
// DST safety: calendar iteration is UTC-noon-anchored day math (the recur.ts
// pattern — never local arithmetic), and week bounds come from fromZonedTime
// of local midnight, so transition weeks are 167/169 real hours and a visit on
// a transition day positions by its local wall time.

const DAY_MS = 86_400_000;

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

export type WeekDay = {
  /** Local calendar date, 'YYYY-MM-DD'. */
  ymd: string;
  /** Column header, e.g. 'Sun 23'. */
  label: string;
  /** 0 = Sunday … 6 = Saturday. */
  weekday: number;
};

const pad = (n: number) => String(n).padStart(2, '0');

/** UTC-noon anchor of the local Sunday of the week containing `anchor` in tz. */
function weekSundayNoonUtc(anchor: Date, tz: string): number {
  const z = toZonedTime(anchor, tz);
  const noon = Date.UTC(z.getFullYear(), z.getMonth(), z.getDate(), 12);
  return noon - z.getDay() * DAY_MS;
}

/** The 7 local days (Sun–Sat) of the week containing `anchor` in tz. */
export function weekDays(anchor: Date, tz: string): WeekDay[] {
  const sunday = weekSundayNoonUtc(anchor, tz);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(sunday + i * DAY_MS);
    return {
      ymd: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`,
      label: `${WEEKDAY_NAMES[i]} ${d.getUTCDate()}`,
      weekday: i,
    };
  });
}

export type WeekRange = {
  /** Local Sunday 00:00 as a UTC instant (inclusive query bound). */
  fromUtc: Date;
  /** Next local Sunday 00:00 as a UTC instant (exclusive query bound). */
  toUtc: Date;
  /** Local Sunday date, 'YYYY-MM-DD' — the stable query-key segment. */
  weekStartYmd: string;
};

/** UTC query window [Sunday 00:00, next Sunday 00:00) for the anchor's week. */
export function weekRange(anchor: Date, tz: string): WeekRange {
  const days = weekDays(anchor, tz);
  const sunday = weekSundayNoonUtc(anchor, tz);
  const next = new Date(sunday + 7 * DAY_MS);
  const nextYmd = `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
  return {
    fromUtc: fromZonedTime(`${days[0]!.ymd}T00:00:00`, tz),
    toUtc: fromZonedTime(`${nextYmd}T00:00:00`, tz),
    weekStartYmd: days[0]!.ymd,
  };
}

/**
 * Bucket visits by their LOCAL calendar day in tz ('YYYY-MM-DD' keys),
 * each bucket sorted by start instant.
 */
export function visitsByDay<T extends { scheduled_start: string }>(
  visits: T[],
  tz: string,
): Map<string, T[]> {
  const byDay = new Map<string, T[]>();
  for (const v of visits) {
    const day = formatInTimeZone(new Date(v.scheduled_start), tz, 'yyyy-MM-dd');
    const list = byDay.get(day) ?? [];
    list.push(v);
    byDay.set(day, list);
  }
  for (const list of byDay.values()) {
    list.sort((a, b) => a.scheduled_start.localeCompare(b.scheduled_start));
  }
  return byDay;
}

export type GridPosition = {
  /** 0 = Sunday … 6 = Saturday (local day of the start in tz). */
  dayIndex: number;
  /** Local wall minutes since midnight of the start. */
  startMinutes: number;
  /** Wall-clock span in minutes (see DST notes below). */
  durationMinutes: number;
};

/**
 * Where a visit sits in the grid, by LOCAL wall time in tz.
 *
 * - Normal visits: wall-clock end minus wall-clock start.
 * - Spring forward (wall clock jumps ahead): the wall span is longer than the
 *   real duration — the block covers the wall time it actually occupies.
 * - Fall back (wall clock repeats an hour): the wall diff can be <= 0, so the
 *   real elapsed minutes are used instead.
 * - Midnight-crossing: clamped to the end of the start day (1440).
 */
export function gridPosition(
  v: { scheduled_start: string; scheduled_end: string },
  tz: string,
): GridPosition {
  const startUtc = new Date(v.scheduled_start);
  const endUtc = new Date(v.scheduled_end);
  const s = toZonedTime(startUtc, tz);
  const e = toZonedTime(endUtc, tz);
  const startMinutes = s.getHours() * 60 + s.getMinutes();
  const sameLocalDay =
    s.getFullYear() === e.getFullYear() && s.getMonth() === e.getMonth() && s.getDate() === e.getDate();
  let durationMinutes: number;
  if (!sameLocalDay) {
    durationMinutes = 1440 - startMinutes;
  } else {
    durationMinutes = e.getHours() * 60 + e.getMinutes() - startMinutes;
    if (durationMinutes <= 0) {
      // Fall-back overlap: wall clocks collide; use real elapsed time.
      durationMinutes = Math.round((endUtc.getTime() - startUtc.getTime()) / 60_000);
    }
  }
  return { dayIndex: s.getDay(), startMinutes, durationMinutes };
}

export type LaneSpan = {
  /** 0-based lane within the visit's overlap cluster. */
  lane: number;
  /** Lanes in the cluster — the divisor for the column width. */
  laneCount: number;
};

/**
 * Standard calendar side-by-side layout: visits that overlap in time split the
 * day column into lanes. Overlap clusters are maximal runs of transitively
 * overlapping intervals; every visit in a cluster shares the cluster's lane
 * count, and freed lanes are reused greedily (earliest available lane).
 *
 * Intervals are half-open [start, end) — an end touching the next start does
 * NOT overlap. `minDurationMinutes` inflates each interval to the visual
 * minimum block height, so two short visits whose RENDERED blocks would
 * collide also split into lanes.
 *
 * Result[i] describes items[i] (input order preserved; input need not be sorted).
 */
export function assignLanes(
  items: { startMinutes: number; durationMinutes: number }[],
  minDurationMinutes = 0,
): LaneSpan[] {
  const order = items
    .map((it, i) => ({
      i,
      start: it.startMinutes,
      end: it.startMinutes + Math.max(it.durationMinutes, minDurationMinutes),
    }))
    .sort((a, b) => a.start - b.start || b.end - a.end);
  const result: LaneSpan[] = new Array(items.length);
  let cluster: { i: number; lane: number }[] = [];
  let laneEnds: number[] = [];
  let clusterEnd = -Infinity;
  const flush = () => {
    for (const c of cluster) result[c.i] = { lane: c.lane, laneCount: laneEnds.length };
    cluster = [];
    laneEnds = [];
  };
  for (const it of order) {
    if (cluster.length > 0 && it.start >= clusterEnd) flush();
    let lane = laneEnds.findIndex((end) => end <= it.start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(it.end);
    } else {
      laneEnds[lane] = it.end;
    }
    cluster.push({ i: it.i, lane });
    clusterEnd = Math.max(clusterEnd, it.end);
  }
  flush();
  return result;
}

/** Default hour gutter range: 06:00–21:00 local. */
export const DEFAULT_GRID_START_MIN = 6 * 60;
export const DEFAULT_GRID_END_MIN = 21 * 60;

/**
 * Adaptive hour range: the 06:00–21:00 default, extended to whole hours so
 * every rendered visit fits (a 21:27 visit used to clip at the bottom edge),
 * clamped to the [00:00, 24:00) day.
 */
export function gridBounds(
  positions: { startMinutes: number; durationMinutes: number }[],
  defaults: { startMin: number; endMin: number } = {
    startMin: DEFAULT_GRID_START_MIN,
    endMin: DEFAULT_GRID_END_MIN,
  },
): { startMin: number; endMin: number } {
  let startMin = defaults.startMin;
  let endMin = defaults.endMin;
  for (const p of positions) {
    startMin = Math.min(startMin, Math.floor(p.startMinutes / 60) * 60);
    endMin = Math.max(endMin, Math.ceil((p.startMinutes + p.durationMinutes) / 60) * 60);
  }
  return { startMin: Math.max(startMin, 0), endMin: Math.min(endMin, 1440) };
}

/**
 * Stable per-member accent assignment for the week grid: the owner always gets
 * accent 0, walkers follow in member-list order (listActiveMembers orders by
 * created_at, so a walker's color never changes as the roster grows at the
 * end), cycling modulo `accentCount`.
 */
export function walkerAccentIndexes(
  members: { user_id: string; role: 'owner' | 'walker' }[],
  accentCount: number,
): Map<string, number> {
  // Array.prototype.sort is stable: owner first, walkers keep relative order.
  const ordered = [...members].sort(
    (a, b) => (a.role === 'owner' ? 0 : 1) - (b.role === 'owner' ? 0 : 1),
  );
  return new Map(ordered.map((m, i) => [m.user_id, i % accentCount]));
}

/**
 * "Now" line position for the viewed week: local wall minutes in tz, or null
 * when today's local day is not one of `dayYmds`. The caller also drops it
 * when the minute falls outside the rendered hour range.
 */
export function nowIndicator(
  nowUtc: Date,
  tz: string,
  dayYmds: string[],
): { dayIndex: number; minutes: number } | null {
  const z = toZonedTime(nowUtc, tz);
  const ymd = `${z.getFullYear()}-${pad(z.getMonth() + 1)}-${pad(z.getDate())}`;
  const dayIndex = dayYmds.indexOf(ymd);
  if (dayIndex === -1) return null;
  return { dayIndex, minutes: z.getHours() * 60 + z.getMinutes() };
}
