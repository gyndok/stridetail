import { formatInTimeZone } from 'date-fns-tz';

import type { ReportPayload } from '@/src/features/report/api';

/**
 * Pure render helpers for the public report page (Plan 4 Task 7). All local
 * times render in the BUSINESS time zone carried by the payload — the reader
 * may be anywhere, but the visit happened where the business is.
 */

const METERS_PER_MILE = 1609.344;

/** Client-friendly timeline labels (fuller than the walker UI's shorthand). */
const TIMELINE_LABELS: Record<string, string> = {
  arrived: 'Arrived',
  started: 'Visit started',
  pee: 'Pee break',
  poop: 'Poop',
  ate: 'Ate',
  drank: 'Drank water',
  meds: 'Medication given',
  note: 'Note',
  photo: 'Photo',
  mark: 'Marked spot',
  finished: 'Visit finished',
};

export function timelineLabel(type: string): string {
  return TIMELINE_LABELS[type] ?? type;
}

/** "Tuesday, September 2" from startedAt (fallback scheduledStart) in the business tz. */
export function reportDateLine(s: ReportPayload['summary'], tz: string): string {
  const iso = s.startedAt ?? s.scheduledStart;
  if (!iso) return '';
  return formatInTimeZone(new Date(iso), tz, 'EEEE, MMMM d');
}

/** "Biscuit & Max · Walk" (either half may be missing). */
export function petsServiceLine(s: ReportPayload['summary']): string {
  const pets = s.petNames.join(' & ');
  return [pets, s.serviceName].filter(Boolean).join(' · ');
}

/** Local wall-clock time of an ISO instant in the business tz, e.g. "3:12 PM". */
export function localTime(iso: string, tz: string): string {
  return formatInTimeZone(new Date(iso), tz, 'h:mm a');
}

/** "32 min" (null-safe). */
export function durationText(durationMin: number | null): string | null {
  if (durationMin == null) return null;
  return `${durationMin} min`;
}

/** "0.21 mi" — always miles on the report (US clients); null/0 hides the stat. */
export function distanceText(distanceM: number | null): string | null {
  if (distanceM == null || distanceM <= 0) return null;
  return `${(distanceM / METERS_PER_MILE).toFixed(2)} mi`;
}

export type Stat = { label: string; value: string };

/** The stat row: duration and distance, each only when it has a value. */
export function statItems(s: ReportPayload['summary']): Stat[] {
  const out: Stat[] = [];
  const dur = durationText(s.durationMin);
  if (dur) out.push({ label: 'Duration', value: dur });
  const dist = distanceText(s.distanceM);
  if (dist) out.push({ label: 'Distance', value: dist });
  return out;
}

/** Photo URLs for the grid, in timeline order. */
export function photoUrls(timeline: ReportPayload['timeline']): string[] {
  return timeline.map((e) => e.photoUrl).filter((u): u is string => typeof u === 'string');
}
