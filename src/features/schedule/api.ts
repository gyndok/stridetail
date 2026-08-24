import { supabase } from '@/src/lib/supabase';

// Visit series API (Plan 3 Task 4). Series rows only — visit rows are
// materialised by the expand-series edge function, which createSeries invokes
// right after the insert (and a nightly cron re-runs for every active series).
//
// rrule contract (mirrored by supabase/functions/expand-series/expand.ts):
// the canonical weekly form `FREQ=WEEKLY;BYDAY=MO,WE,FR` with RFC 5545 weekday
// codes. Weekday numbers are JS getDay(): 0 = Sunday … 6 = Saturday.

export const BYDAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const;

export type VisitSeries = {
  id: string;
  business_id: string;
  client_id: string;
  service_id: string;
  walker_id: string;
  rrule: string;
  starts_on: string;
  ends_on: string | null;
  local_start: string;
  pet_ids: string[];
  active: boolean;
  created_at: string;
};

export type SeriesInput = {
  businessId: string;
  clientId: string;
  serviceId: string;
  walkerId: string;
  petIds: string[];
  /** Local weekdays, 0 = Sunday … 6 = Saturday. */
  weekdays: number[];
  /** Local wall-clock start, 'HH:MM'. */
  localStart: string;
  /** First possible occurrence date, 'YYYY-MM-DD' (in the business tz). */
  startsOn: string;
  /** Last possible occurrence date (inclusive), or null for open-ended. */
  endsOn?: string | null;
};

/** Canonical weekly rrule for a weekday set; throws on an empty or invalid set. */
export function buildWeeklyRRule(weekdays: number[]): string {
  const unique = [...new Set(weekdays)].sort((a, b) => a - b);
  if (unique.length === 0) throw new Error('a series needs at least one weekday');
  if (unique.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) {
    throw new Error('weekdays must be integers 0-6');
  }
  return `FREQ=WEEKLY;BYDAY=${unique.map((d) => BYDAY_CODES[d]).join(',')}`;
}

const LOCAL_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Shape a SeriesInput into the visit_series insert row; throws on bad input. */
export function seriesInsertRow(input: SeriesInput) {
  if (!LOCAL_TIME.test(input.localStart)) throw new Error(`bad localStart: ${input.localStart}`);
  if (!ISO_DATE.test(input.startsOn)) throw new Error(`bad startsOn: ${input.startsOn}`);
  if (input.endsOn != null && !ISO_DATE.test(input.endsOn)) throw new Error(`bad endsOn: ${input.endsOn}`);
  if (input.endsOn != null && input.endsOn < input.startsOn) {
    throw new Error('endsOn is before startsOn');
  }
  return {
    business_id: input.businessId,
    client_id: input.clientId,
    service_id: input.serviceId,
    walker_id: input.walkerId,
    pet_ids: input.petIds,
    rrule: buildWeeklyRRule(input.weekdays),
    starts_on: input.startsOn,
    ends_on: input.endsOn ?? null,
    local_start: input.localStart,
  };
}

/**
 * Insert a series, then invoke expand-series with the caller's JWT so the first
 * 8 weeks of visits exist before the screen returns.
 */
export async function createSeries(input: SeriesInput): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from('visit_series')
    .insert(seriesInsertRow(input))
    .select('id')
    .single();
  if (error) throw error;
  const id = (data as { id: string }).id;
  const { error: fnError } = await supabase.functions.invoke('expand-series', {
    body: { seriesId: id },
  });
  if (fnError) throw fnError;
  return { id };
}

export async function listSeries(businessId: string): Promise<VisitSeries[]> {
  const { data, error } = await supabase
    .from('visit_series')
    .select('*')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as VisitSeries[];
}

/** Stop future expansion. Already-materialised visits are untouched. */
export async function deactivateSeries(id: string): Promise<void> {
  const { error } = await supabase.from('visit_series').update({ active: false }).eq('id', id);
  if (error) throw error;
}
