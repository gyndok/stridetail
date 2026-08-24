import type { ClientAccessCodes } from '@/src/features/clients/access';
import type { VisitEventType } from '@/src/lib/offline/sync';

import type { RevealedCodes } from './accessCache';
import type { VisitEventInput } from './api';

/**
 * Pure helpers for the active-visit field screen (Plan 4 Task 5). Everything
 * here is display/decision logic with no I/O so it stays unit-testable; the
 * screen wires these to the outbox mutations, the GPS controller, and the
 * reveal RPC.
 */

// ---- elapsed timer ----

const pad2 = (n: number) => String(n).padStart(2, '0');

/** Millisecond duration -> "hh:mm:ss". Negative clamps to zero; hours never wrap. */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
}

// ---- distance display (US units — recorded in DEVIATIONS) ----

const FEET_PER_METER = 3.280839895;
const METERS_PER_MILE = 1609.344;

/**
 * Meters -> "420 ft" under a tenth of a mile, "0.72 mi" from there up.
 * Feet round to the nearest 10 (GPS noise makes single feet false precision).
 */
export function formatDistanceUS(meters: number): string {
  const miles = meters / METERS_PER_MILE;
  if (miles >= 0.1) return `${miles.toFixed(2)} mi`;
  const feet = Math.round((meters * FEET_PER_METER) / 10) * 10;
  return `${feet} ft`;
}

// ---- event payload builder (per-pet attribution) ----

export type BuildEventArgs = {
  visitId: string;
  businessId: string;
  type: VisitEventType;
  /** The visit's pet_ids (order preserved). */
  petIds: string[];
  /** The selected pet chip on multi-pet visits. */
  selectedPetId?: string;
  text?: string;
  photoLocalUri?: string;
};

/**
 * Event input for appendVisitEvent. Attribution: a single-pet visit stamps
 * that pet automatically; a multi-pet visit uses the selected chip when it is
 * one of the visit's pets; otherwise the event is visit-level (no petId).
 * Absent optional fields are omitted entirely (outbox payloads stay minimal).
 */
export function buildEventInput(args: BuildEventArgs): VisitEventInput {
  const petId =
    args.petIds.length === 1
      ? args.petIds[0]
      : args.selectedPetId && args.petIds.includes(args.selectedPetId)
        ? args.selectedPetId
        : undefined;
  return {
    visitId: args.visitId,
    businessId: args.businessId,
    type: args.type,
    ...(petId !== undefined && { petId }),
    ...(args.text !== undefined && { text: args.text }),
    ...(args.photoLocalUri !== undefined && { photoLocalUri: args.photoLocalUri }),
  };
}

// ---- labels + ticker ----

const EVENT_LABEL: Partial<Record<VisitEventType, string>> = {
  pee: 'Pee',
  poop: 'Poop',
  photo: 'Photo',
  note: 'Note',
  ate: 'Ate',
  drank: 'Drank',
  meds: 'Meds',
  arrived: 'Arrived',
  started: 'Started',
  finished: 'Finished',
};

export function eventLabel(type: VisitEventType): string {
  return EVENT_LABEL[type] ?? type;
}

/** Local wall-clock HH:MM of an ISO instant (the walker's device clock). */
export function tickerTime(iso: string): string {
  const d = new Date(iso);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

// ---- reveal grace fallback ----

/**
 * Classify a failed reveal_access call. No HTTP status (or postgrest's
 * status-0 network marker) means the server never answered — offline, so the
 * grace cache may stand in. Any server-answered status is a denial (wrong
 * state, wrong walker, no codes …) and must surface as an error, never as
 * cached codes.
 */
export function revealFailureMode(status?: number): 'offline' | 'denied' {
  return status === undefined || status === 0 ? 'offline' : 'denied';
}

export function graceNote(revealedAtIso: string): string {
  return `Retrieved ${tickerTime(revealedAtIso)} — codes may have changed since.`;
}

export type RevealFallback =
  | { kind: 'cached'; codes: ClientAccessCodes; note: string }
  | { kind: 'call-owner' };

/** Offline decision: cached grace copy when one is still valid, else call the owner. */
export function revealFallback(cached: RevealedCodes | null): RevealFallback {
  if (!cached) return { kind: 'call-owner' };
  return { kind: 'cached', codes: cached.values, note: graceNote(cached.revealedAt) };
}
