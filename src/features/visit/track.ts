import { supabase } from '@/src/lib/supabase';

import { buildVisitRoute, type VisitRoute } from './walkMapData';

/**
 * Completed-visit route fetch (Plan 7b Task 3). Reads visit_tracks (ordered
 * segments of {t,lat,lng,acc?}) and the pin-worthy visit_events for one visit.
 * RLS covers both callers of the unified VisitScreen: the owner policies
 * ("owner reads tracks/events") and the walker own-visit policies
 * (20260824000009_execution.sql) — no business filter needed, the id is
 * unique and the policies pin visibility.
 */
export async function fetchVisitRoute(visitId: string): Promise<VisitRoute> {
  const [tracksRes, eventsRes] = await Promise.all([
    supabase
      .from('visit_tracks')
      .select('segment_no, points')
      .eq('visit_id', visitId)
      .order('segment_no', { ascending: true }),
    supabase
      .from('visit_events')
      .select('type, occurred_at')
      .eq('visit_id', visitId)
      .in('type', ['pee', 'poop', 'photo'])
      .order('occurred_at', { ascending: true }),
  ]);
  if (tracksRes.error) throw tracksRes.error;
  if (eventsRes.error) throw eventsRes.error;
  return buildVisitRoute(
    (tracksRes.data ?? []) as { points: unknown }[],
    (eventsRes.data ?? []) as { type: string; occurred_at: string }[],
  );
}
