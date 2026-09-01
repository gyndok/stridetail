// Render-once walk map (Plan 7b), SHARED between send-email (pre-render before
// the visit_finished email) and report-public (render-on-first-view, added
// 2026-09-01 after Alexandra's Poppy report: a client with NO EMAIL on file
// gets no queued email, so the email-time render never ran and the report page
// fell back to the bare SVG forever). The object's presence in storage IS the
// idempotency flag; every failure is logged and swallowed — callers must keep
// working (email still sends, page still serves the SVG fallback).
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

import {
  buildStaticMapUrl,
  flattenTrack,
  nearestTrackPoint,
  type EventPin,
  type EventPinType,
  type TimedPoint,
} from './staticMap.ts';

const EVENT_PIN_TYPES: EventPinType[] = ['pee', 'poop', 'photo'];

export async function ensureReportMap(admin: SupabaseClient, visitIdRaw: unknown): Promise<void> {
  try {
    const visitId = typeof visitIdRaw === 'string' && visitIdRaw.length > 0 ? visitIdRaw : null;
    if (!visitId) return;
    const dir = `reports/${visitId}`;

    // Idempotency check FIRST: if the map exists, skip the fetch entirely.
    const { data: existing, error: listErr } = await admin.storage
      .from('media')
      .list(dir, { search: 'map.png' });
    if (listErr) {
      console.error(`report map: list ${dir} failed: ${listErr.message}`);
      return;
    }
    if ((existing ?? []).some((o) => o.name === 'map.png')) return;

    const mapboxToken = Deno.env.get('MAPBOX_TOKEN');
    if (!mapboxToken) {
      console.warn('report map: MAPBOX_TOKEN not set, skipping map render');
      return;
    }

    const { data: trackRows, error: trackErr } = await admin
      .from('visit_tracks')
      .select('segment_no, points')
      .eq('visit_id', visitId)
      .order('segment_no', { ascending: true });
    if (trackErr) {
      console.error(`report map: tracks read failed for ${visitId}: ${trackErr.message}`);
      return;
    }
    const track = flattenTrack((trackRows ?? []) as { points: TimedPoint[] }[]);
    if (track.length < 2) return; // nothing to draw — not an error

    // visit_events rows carry no coordinates; a pin sits on the track point
    // nearest in time to occurred_at (point t is epoch ms).
    const { data: eventRows, error: eventErr } = await admin
      .from('visit_events')
      .select('type, occurred_at')
      .eq('visit_id', visitId)
      .in('type', EVENT_PIN_TYPES)
      .order('occurred_at', { ascending: true });
    if (eventErr) {
      console.error(`report map: events read failed for ${visitId}: ${eventErr.message}`);
      return;
    }
    const events: EventPin[] = [];
    for (const e of (eventRows ?? []) as { type: EventPinType; occurred_at: string }[]) {
      const at = Date.parse(e.occurred_at);
      const p = Number.isFinite(at) ? nearestTrackPoint(track, at) : null;
      if (p) events.push({ lat: p.lat, lng: p.lng, type: e.type });
    }

    const url = buildStaticMapUrl(track, events, mapboxToken);
    if (!url) return;
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`report map: mapbox http ${res.status} for visit ${visitId}`);
      return;
    }
    const png = new Uint8Array(await res.arrayBuffer());
    const { error: upErr } = await admin.storage
      .from('media')
      .upload(`${dir}/map.png`, png, { contentType: 'image/png', upsert: false });
    // A concurrent claimer may have won the upsert:false race — that's success.
    if (upErr && !/exist/i.test(upErr.message)) {
      console.error(`report map: upload failed for ${visitId}: ${upErr.message}`);
    }
  } catch (e) {
    console.error(`report map: ${e instanceof Error ? e.message : String(e)}`);
  }
}
