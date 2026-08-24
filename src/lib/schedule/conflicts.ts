import { toZonedTime } from 'date-fns-tz';

// Conflict math for the walker picker (plan 3 task 7). Pure functions; weekday
// and wall-clock comparisons happen in the business tz (0 = Sunday … 6 = Saturday,
// same convention as recur.ts).

export type AvailabilityRule = {
  weekday: number;
  /** Local wall time 'HH:MM' or postgres time 'HH:MM:SS'. */
  start_local: string;
  end_local: string;
};

export type TimeOffBlock = {
  starts_at: string | Date;
  ends_at: string | Date;
};

/** Half-open interval overlap: touching endpoints do not overlap. */
export function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime();
}

/**
 * True when the visit fits entirely inside one availability rule for its LOCAL
 * weekday in `tz` (rule boundaries inclusive).
 *
 * Rules are same-local-day ranges (the DB enforces end_local > start_local);
 * midnight-crossing ranges are NOT supported — an inverted rule matches nothing,
 * and a visit spanning two local dates is never within availability, even when
 * back-to-back rules cover both sides of midnight.
 */
export function withinAvailability(
  visitStartUtc: Date,
  visitEndUtc: Date,
  rules: AvailabilityRule[],
  tz: string,
): boolean {
  const s = toZonedTime(visitStartUtc, tz);
  const e = toZonedTime(visitEndUtc, tz);
  // Same local calendar date required (see docstring).
  if (
    s.getFullYear() !== e.getFullYear() ||
    s.getMonth() !== e.getMonth() ||
    s.getDate() !== e.getDate()
  ) {
    return false;
  }
  const weekday = s.getDay();
  const startMin = s.getHours() * 60 + s.getMinutes();
  const endMin = e.getHours() * 60 + e.getMinutes();
  return rules.some(
    (r) =>
      r.weekday === weekday &&
      toMinutes(r.start_local) <= startMin &&
      endMin <= toMinutes(r.end_local),
  );
}

/** True when the visit overlaps any time-off block (touching does not count). */
export function inTimeOff(
  visitStartUtc: Date,
  visitEndUtc: Date,
  timeOff: TimeOffBlock[],
): boolean {
  return timeOff.some((t) =>
    overlaps(visitStartUtc, visitEndUtc, asDate(t.starts_at), asDate(t.ends_at)),
  );
}

const asDate = (d: string | Date) => (d instanceof Date ? d : new Date(d));

/** 'HH:MM' or 'HH:MM:SS' -> minutes since local midnight. */
const toMinutes = (t: string): number => {
  const [h, m] = t.split(':');
  return Number(h) * 60 + Number(m);
};
