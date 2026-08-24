// Weekly recurrence expansion for the expand-series edge function.
//
// This is a dependency-free Deno mirror of src/lib/schedule/recur.ts
// (which uses date-fns-tz and cannot be imported here — bun/npm module).
// Both implementations are pinned by the SAME DST vector table:
// src/lib/schedule/__tests__/recur.test.ts and ./expand.test.ts must agree.
//
// Weekday convention: JS getDay() — 0 = Sunday … 6 = Saturday — evaluated on
// the LOCAL calendar date in `tz`, never the UTC date.
//
// DST behavior (matches date-fns-tz 3.2.0, pinned by both test files):
// - A localStart inside a spring-forward gap resolves with the POST-transition
//   offset: 02:30 on 2026-03-08 in America/Chicago -> 2026-03-08T07:30:00Z.
// - A localStart inside a fall-back overlap resolves to the FIRST
//   (pre-transition) occurrence: 01:30 on 2026-11-01 -> 2026-11-01T06:30:00Z.

export type Occurrence = { start: Date; end: Date };

export type ExpandWeeklyArgs = {
  /** Local weekdays to recur on, 0 = Sunday … 6 = Saturday. */
  weekdays: number[];
  /** Local wall-clock start, 'HH:MM' or 'HH:MM:SS' (Postgres `time`). */
  localStart: string;
  durationMin: number;
  /** IANA business time zone, e.g. 'America/Chicago'. */
  tz: string;
  /** Window start (UTC instant), inclusive. */
  from: Date;
  /** Window end (UTC instant), exclusive. */
  until: Date;
};

const DAY_MS = 86_400_000;

const dtfCache = new Map<string, Intl.DateTimeFormat>();

function dtf(tz: string): Intl.DateTimeFormat {
  let f = dtfCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    dtfCache.set(tz, f);
  }
  return f;
}

type Wall = { y: number; mo: number; d: number; h: number; mi: number; s: number };

/** Wall-clock components of a UTC instant in `tz`. */
export function wallParts(utcMs: number, tz: string): Wall {
  const out: Record<string, number> = {};
  for (const p of dtf(tz).formatToParts(new Date(utcMs))) {
    if (p.type !== 'literal') out[p.type] = Number(p.value);
  }
  return { y: out.year!, mo: out.month!, d: out.day!, h: out.hour!, mi: out.minute!, s: out.second! };
}

/** UTC offset of `tz` at a UTC instant, in ms (wall minus UTC; Chicago winter = -6h). */
function offsetMs(utcMs: number, tz: string): number {
  const w = wallParts(utcMs, tz);
  return Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi, w.s) - utcMs;
}

/**
 * UTC instant of a wall time in `tz` (fromZonedTime equivalent).
 * Gap wall times resolve with the POST-transition offset; ambiguous wall times
 * take the FIRST occurrence — both pinned in expand.test.ts to match date-fns-tz.
 */
export function fromWall(y: number, mo: number, d: number, h: number, mi: number, tz: string): number {
  const t0 = Date.UTC(y, mo - 1, d, h, mi, 0);
  const o0 = offsetMs(t0, tz);
  const t1 = t0 - o0;
  const o1 = offsetMs(t1, tz);
  if (o1 === o0) return t1;
  return t0 - o1;
}

/** Parse 'HH:MM' or 'HH:MM:SS' into hours and minutes; null when malformed. */
export function parseLocalTime(t: string): { h: number; mi: number } | null {
  const m = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(t);
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  return { h, mi };
}

/**
 * Expand a weekly rule into concrete UTC occurrences with `from <= start < until`.
 * Sorted ascending. `end` is `durationMin` absolute minutes after `start` (a walk
 * crossing a DST jump is still `durationMin` real minutes long).
 * Mirrors src/lib/schedule/recur.ts expandWeekly exactly.
 */
export function expandWeekly({ weekdays, localStart, durationMin, tz, from, until }: ExpandWeeklyArgs): Occurrence[] {
  if (weekdays.length === 0 || until.getTime() <= from.getTime()) return [];
  const time = parseLocalTime(localStart);
  if (!time) return [];
  const wanted = new Set(weekdays);

  // Local calendar date of `from` in tz, anchored at UTC noon so that stepping
  // whole days is immune to DST (calendar iteration must never use local math).
  const zf = wallParts(from.getTime(), tz);
  let cursor = Date.UTC(zf.y, zf.mo - 1, zf.d, 12);
  // Start one day early: the local date of `from` in tz can trail the instant's
  // UTC date, and an occurrence late on the previous local day may still be >= from.
  cursor -= DAY_MS;

  const out: Occurrence[] = [];
  const untilMs = until.getTime();
  // Iterate local calendar dates until the wall-time start itself is past `until`.
  for (;;) {
    const d = new Date(cursor);
    if (wanted.has(d.getUTCDay())) {
      const startMs = fromWall(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), time.h, time.mi, tz);
      if (startMs >= untilMs) break;
      if (startMs >= from.getTime()) {
        out.push({ start: new Date(startMs), end: new Date(startMs + durationMin * 60_000) });
      }
    } else if (cursor - DAY_MS > untilMs) {
      // Safely past the window even after any offset wobble.
      break;
    }
    cursor += DAY_MS;
  }
  return out;
}

const BYDAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const;

/**
 * Parse the canonical weekly rrule this app writes: `FREQ=WEEKLY;BYDAY=MO,WE,FR`
 * (RFC 5545 weekday codes; key order and case tolerated). Returns sorted unique
 * weekday numbers (0 = Sunday … 6 = Saturday), or null for anything else —
 * a non-weekly FREQ, unknown BYDAY codes, or a missing/empty BYDAY.
 */
export function parseWeeklyRRule(rrule: string): number[] | null {
  const parts = new Map<string, string>();
  for (const piece of rrule.trim().split(';')) {
    if (!piece) continue;
    const eq = piece.indexOf('=');
    if (eq < 0) return null;
    parts.set(piece.slice(0, eq).trim().toUpperCase(), piece.slice(eq + 1).trim().toUpperCase());
  }
  if (parts.get('FREQ') !== 'WEEKLY') return null;
  const byday = parts.get('BYDAY');
  if (!byday) return null;
  const days = new Set<number>();
  for (const code of byday.split(',')) {
    const idx = BYDAY_CODES.indexOf(code.trim() as (typeof BYDAY_CODES)[number]);
    if (idx < 0) return null;
    days.add(idx);
  }
  if (days.size === 0) return null;
  return [...days].sort((a, b) => a - b);
}
