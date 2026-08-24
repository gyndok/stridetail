import { fromZonedTime, toZonedTime } from 'date-fns-tz';

// Weekly recurrence expansion, computed in the business time zone (spec §5).
// Weekday convention everywhere in this lib: JS getDay() — 0 = Sunday … 6 =
// Saturday — evaluated on the LOCAL calendar date in `tz`, never the UTC date.
//
// DST behavior (date-fns-tz 3.2.0, pinned by tests):
// - A localStart inside a spring-forward gap (02:00–03:00 on 2026-03-08 in
//   America/Chicago does not exist) resolves with the POST-transition offset:
//   02:30 CST-that-never-happens becomes 2026-03-08T07:30:00Z, which renders
//   locally as 01:30 CST. Deterministic, pinned in recur.test.ts.
// - A localStart inside a fall-back overlap resolves to the FIRST (pre-
//   transition, DST) occurrence.

export type Occurrence = { start: Date; end: Date };

export type ExpandWeeklyArgs = {
  /** Local weekdays to recur on, 0 = Sunday … 6 = Saturday. */
  weekdays: number[];
  /** Local wall-clock start, 'HH:MM'. */
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

/**
 * Expand a weekly rule into concrete UTC occurrences with `from <= start < until`.
 * Sorted ascending. `end` is `durationMin` absolute minutes after `start` (a walk
 * crossing a DST jump is still `durationMin` real minutes long).
 */
export function expandWeekly({
  weekdays,
  localStart,
  durationMin,
  tz,
  from,
  until,
}: ExpandWeeklyArgs): Occurrence[] {
  if (weekdays.length === 0 || until.getTime() <= from.getTime()) return [];
  const wanted = new Set(weekdays);

  // Local calendar date of `from` in tz, anchored at UTC noon so that stepping
  // whole days is immune to DST (calendar iteration must never use local math).
  const zonedFrom = toZonedTime(from, tz);
  let cursor = Date.UTC(zonedFrom.getFullYear(), zonedFrom.getMonth(), zonedFrom.getDate(), 12);
  // Start one day early: the local date of `from` in tz can trail the instant's
  // UTC date, and an occurrence late on the previous local day may still be >= from.
  cursor -= DAY_MS;

  const out: Occurrence[] = [];
  const untilMs = until.getTime();
  // Iterate local calendar dates until the wall-time start itself is past `until`.
  for (;;) {
    const d = new Date(cursor);
    if (wanted.has(d.getUTCDay())) {
      const wall = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${localStart}:00`;
      const start = fromZonedTime(wall, tz);
      if (start.getTime() >= untilMs) break;
      if (start.getTime() >= from.getTime()) {
        out.push({ start, end: new Date(start.getTime() + durationMin * 60_000) });
      }
    } else if (cursor - DAY_MS > untilMs) {
      // Safely past the window even after any offset wobble.
      break;
    }
    cursor += DAY_MS;
  }
  return out;
}

const pad = (n: number) => String(n).padStart(2, '0');
