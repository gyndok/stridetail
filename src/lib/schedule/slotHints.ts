import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';

import {
  inTimeOff,
  overlaps,
  withinAvailability,
  type AvailabilityRule,
  type TimeOffBlock,
} from './conflicts';

// Advisory slot hints for the booking-request approve card's walker chips.
// Same rules as the Plan 3 Task 7 walker picker (walkerFlags in
// features/schedule/api.ts), reduced to ONE verdict per walker with a fixed
// precedence: time off beats busy beats outside-hours. Notably, a walker with
// NO availability rows is outside hours (withinAvailability: empty rules mean
// never available) — exactly the semantics the picker already shows as
// "Outside availability".

export type SlotHintData = {
  /** Every availability rule in the business (per-user rows). */
  availability: (AvailabilityRule & { user_id: string })[];
  /** Time-off blocks overlapping the fetched window (per-user rows). */
  timeOff: (TimeOffBlock & { user_id: string })[];
  /** Assigned, non-cancelled visits overlapping the fetched window. */
  visits: { id: string; walker_id: string; scheduled_start: string; scheduled_end: string }[];
};

export type SlotHint =
  | { kind: 'off' }
  /** detail is the conflicting visit's start in the business tz, e.g. '2:00 PM'. */
  | { kind: 'busy'; detail: string }
  | { kind: 'outside_hours' }
  | { kind: 'free' };

/**
 * One advisory verdict for scheduling `walkerId` at `slotStartUtc` for
 * `durationMin` minutes. Precedence: off > busy > outside_hours > free.
 * All weekday/wall-clock math happens in the business `tz` via the shared
 * conflicts helpers — no hand-rolled zone math.
 */
export function walkerSlotHints(
  walkerId: string,
  slotStartUtc: Date,
  durationMin: number,
  data: SlotHintData,
  tz: string,
): SlotHint {
  const slotEndUtc = new Date(slotStartUtc.getTime() + durationMin * 60_000);

  const timeOff = data.timeOff.filter((t) => t.user_id === walkerId);
  if (inTimeOff(slotStartUtc, slotEndUtc, timeOff)) return { kind: 'off' };

  const conflicting = data.visits
    .filter(
      (v) =>
        v.walker_id === walkerId &&
        overlaps(slotStartUtc, slotEndUtc, new Date(v.scheduled_start), new Date(v.scheduled_end)),
    )
    .sort((a, b) => new Date(a.scheduled_start).getTime() - new Date(b.scheduled_start).getTime());
  const firstConflict = conflicting[0];
  if (firstConflict) {
    return {
      kind: 'busy',
      detail: formatInTimeZone(new Date(firstConflict.scheduled_start), tz, 'h:mm a'),
    };
  }

  const rules = data.availability.filter((r) => r.user_id === walkerId);
  if (!withinAvailability(slotStartUtc, slotEndUtc, rules, tz)) return { kind: 'outside_hours' };

  return { kind: 'free' };
}

/**
 * The UTC bounds of the local calendar day (in `tz`) containing `instantIso` —
 * the approve card's fetch window, so one pickerContext query covers every
 * start time the owner can pick that day. dayKey ('yyyy-MM-dd') doubles as the
 * cache key. date-fns-tz does the zone math; the +1 is plain calendar math.
 */
export function localDayWindowUtc(
  instantIso: string,
  tz: string,
): { dayKey: string; startUtc: Date; endUtc: Date } {
  const dayKey = formatInTimeZone(new Date(instantIso), tz, 'yyyy-MM-dd');
  const [y, m, d] = dayKey.split('-').map(Number);
  const nextKey = new Date(Date.UTC(y ?? 0, (m ?? 1) - 1, (d ?? 0) + 1)).toISOString().slice(0, 10);
  return {
    dayKey,
    startUtc: fromZonedTime(`${dayKey}T00:00:00`, tz),
    endUtc: fromZonedTime(`${nextKey}T00:00:00`, tz),
  };
}

/** Compact chip suffix for a hint — null for 'free' (free chips stay unchanged). */
export function slotHintLabel(hint: SlotHint): string | null {
  switch (hint.kind) {
    case 'off':
      return 'off';
    case 'busy':
      return `busy ${hint.detail}`;
    case 'outside_hours':
      return 'outside hours';
    case 'free':
      return null;
  }
}
