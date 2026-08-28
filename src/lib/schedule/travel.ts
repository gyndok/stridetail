import { haversineMeters } from '@/src/lib/gps/geo';

// Travel-time heuristic for back-to-back visits at different clients' homes
// (travel-time handling, Phase 1). Purely advisory: the estimate feeds the
// "tight transfer" slot hint / picker flag, never a blocking rule.
//
// Constants (conservative urban driving, no live traffic):
// - ROAD_FACTOR: straight-line (haversine) distance inflated x1.4 to
//   approximate the road network.
// - SPEED_KMH: effective door-to-door speed of 30 km/h.
// - OVERHEAD_MIN: +5 min constant for parking + leash-up at the far end.
// - SAME_PLACE_METERS: two homes under 250 m apart count as the same place
//   (0 min — walkable between doors); the same client_id is likewise 0.
// - MIN_TRAVEL_MIN: beyond the same-place radius the estimate never drops
//   under 5 min (with the +5 overhead this is already guaranteed, kept as an
//   explicit clamp so the floor survives constant tweaks).

export const ROAD_FACTOR = 1.4;
export const SPEED_KMH = 30;
export const OVERHEAD_MIN = 5;
export const SAME_PLACE_METERS = 250;
export const MIN_TRAVEL_MIN = 5;

/** Whole-minute travel estimate for a straight-line distance; 0 = same place. */
export function estimateTravelMinutes(distanceMeters: number): number {
  if (distanceMeters < SAME_PLACE_METERS) return 0;
  const driveMin = ((distanceMeters * ROAD_FACTOR) / 1000 / SPEED_KMH) * 60 + OVERHEAD_MIN;
  return Math.max(Math.round(driveMin), MIN_TRAVEL_MIN);
}

export type ClientCoords = { lat: number | null; lng: number | null };

/** The client whose home the evaluated slot is at. */
export type SlotClient = ClientCoords & { id: string | null };

/**
 * A walker's other visit, with its client's geocoded home. client_id/client
 * are optional so fixtures predating the travel work still typecheck — a
 * missing embed simply skips that side of the check.
 */
export type TravelVisit = {
  id: string;
  walker_id: string;
  scheduled_start: string;
  scheduled_end: string;
  client_id?: string | null;
  client?: ClientCoords | null;
};

export type TightTransfer = {
  direction: 'from_prev' | 'to_next';
  /** Estimated drive, whole minutes. */
  driveMin: number;
  /** Actual gap between the visits, whole minutes. */
  gapMin: number;
};

/**
 * Advisory tight-transfer verdict for scheduling `walkerId` at
 * [slotStartUtc, slotEndUtc) at `slotClient`'s home: measured against the
 * walker's NEAREST preceding visit (its end -> slot start) and NEAREST
 * following visit (slot end -> its start) among `visits`, using each side's
 * client coordinates. Tight = the gap is smaller than the drive estimate.
 *
 * Callers pass visits already scoped to the slot's local day (the
 * pickerContext fetch window), so day/tz boundaries are the caller's fetch
 * concern — the math here is plain UTC instants. Skipped silently per side:
 * same client, under SAME_PLACE_METERS, or missing coordinates; skipped
 * entirely when the slot client has no coordinates. Visits overlapping the
 * slot are ignored — overlap is "busy", a stronger verdict handled elsewhere.
 * When both sides are tight, the worse shortfall (drive minus gap) wins.
 */
export function tightTransfer(
  walkerId: string,
  slotStartUtc: Date,
  slotEndUtc: Date,
  slotClient: SlotClient | null | undefined,
  visits: TravelVisit[],
  opts?: { excludeVisitId?: string },
): TightTransfer | null {
  if (slotClient?.lat == null || slotClient.lng == null) return null;
  const here = { lat: slotClient.lat, lng: slotClient.lng };

  const mine = visits.filter((v) => v.walker_id === walkerId && v.id !== opts?.excludeVisitId);
  const prev = mine
    .filter((v) => new Date(v.scheduled_end).getTime() <= slotStartUtc.getTime())
    .sort((a, b) => new Date(b.scheduled_end).getTime() - new Date(a.scheduled_end).getTime())[0];
  const next = mine
    .filter((v) => new Date(v.scheduled_start).getTime() >= slotEndUtc.getTime())
    .sort((a, b) => new Date(a.scheduled_start).getTime() - new Date(b.scheduled_start).getTime())[0];

  const side = (v: TravelVisit | undefined, direction: TightTransfer['direction']): TightTransfer | null => {
    if (!v) return null;
    if (v.client_id != null && slotClient.id != null && v.client_id === slotClient.id) return null;
    if (v.client?.lat == null || v.client.lng == null) return null;
    const meters = haversineMeters(
      { t: 0, ...here },
      { t: 0, lat: v.client.lat, lng: v.client.lng },
    );
    const driveMin = estimateTravelMinutes(meters);
    const gapMs =
      direction === 'from_prev'
        ? slotStartUtc.getTime() - new Date(v.scheduled_end).getTime()
        : new Date(v.scheduled_start).getTime() - slotEndUtc.getTime();
    const gapMin = Math.round(gapMs / 60_000);
    return driveMin > gapMin ? { direction, driveMin, gapMin } : null;
  };

  const before = side(prev, 'from_prev');
  const after = side(next, 'to_next');
  if (before && after) {
    return after.driveMin - after.gapMin > before.driveMin - before.gapMin ? after : before;
  }
  return before ?? after;
}

/** Human detail line, e.g. "~18 min drive from previous, 12 min gap". */
export function tightTransferDetail(t: TightTransfer): string {
  const where = t.direction === 'from_prev' ? 'from previous' : 'to next';
  return `~${t.driveMin} min drive ${where}, ${t.gapMin} min gap`;
}
