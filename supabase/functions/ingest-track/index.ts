// Ingests GPS track segments for a running visit (Plan 4 Task 2).
//
// POST { visitId, segments: [{ segmentNo, points: [{t,lat,lng,acc?}], clientUuid }] }
// with the WALKER's JWT (verify_jwt stays ON — the platform rejects unauthenticated
// requests before this code runs).
//
// Auth model (mirrors expand-series): a user-scoped client (RLS) must be able to
// see the visit AND the caller must be its walker AND the visit in_progress —
// only then does the service-role client upsert visit_tracks (ignoreDuplicates
// on client_uuid, so offline replays insert nothing) and recompute the distance
// via the service_role-only recompute_visit_distance RPC. Responds
// { distanceM, inserted }.
//
// The visits select names columns: price_cents_snapshot is column-grant hidden
// from client roles (Plan 3 Task 1), so `select('*')` would 42501 even here.
import { createClient } from 'npm:@supabase/supabase-js@2';

import { corsHeaders } from '../_shared/cors.ts';

const MAX_SEGMENTS = 100;
const MAX_POINTS_TOTAL = 5000;

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: corsHeaders });
}

type TrackPoint = { t: number; lat: number; lng: number; acc?: number };
type TrackSegment = { segmentNo: number; points: TrackPoint[]; clientUuid: string };

function isPoint(p: unknown): p is TrackPoint {
  if (!p || typeof p !== 'object') return false;
  const o = p as Record<string, unknown>;
  return (
    typeof o.t === 'number' &&
    typeof o.lat === 'number' &&
    typeof o.lng === 'number' &&
    (o.acc === undefined || typeof o.acc === 'number')
  );
}

function isSegment(s: unknown): s is TrackSegment {
  if (!s || typeof s !== 'object') return false;
  const o = s as Record<string, unknown>;
  return (
    typeof o.segmentNo === 'number' &&
    Number.isInteger(o.segmentNo) &&
    o.segmentNo >= 0 &&
    typeof o.clientUuid === 'string' &&
    o.clientUuid.length > 0 &&
    Array.isArray(o.points) &&
    o.points.every(isPoint)
  );
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !anonKey || !serviceKey) return json({ error: 'misconfigured' }, 500);

  const body: unknown = await req.json().catch(() => null);
  const visitId = body && typeof body === 'object' ? (body as { visitId?: unknown }).visitId : undefined;
  const segments = body && typeof body === 'object' ? (body as { segments?: unknown }).segments : undefined;

  if (typeof visitId !== 'string' || visitId.length === 0 || !Array.isArray(segments) || segments.length === 0) {
    return json({ error: 'expected { visitId, segments: [...] }' }, 400);
  }
  if (!segments.every(isSegment)) {
    return json({ error: 'malformed segment: expected { segmentNo, points: [{t,lat,lng,acc?}], clientUuid }' }, 400);
  }
  // Sanity caps: nothing legitimate ships this much in one call.
  if (segments.length > MAX_SEGMENTS) return json({ error: `too many segments (max ${MAX_SEGMENTS})` }, 400);
  const totalPoints = segments.reduce((n, s) => n + s.points.length, 0);
  if (totalPoints > MAX_POINTS_TOTAL) return json({ error: `too many points (max ${MAX_POINTS_TOTAL} total)` }, 400);

  // User-scoped verification: the visit must be visible under the caller's RLS
  // (owner or assigned walker only) AND the caller must be its walker.
  const auth = req.headers.get('Authorization') ?? '';
  const userClient = createClient(url, anonKey, { global: { headers: { Authorization: auth } } });
  const {
    data: { user },
    error: userErr,
  } = await userClient.auth.getUser();
  if (userErr || !user) return json({ error: 'unauthorized' }, 401);

  const { data: visit, error: vErr } = await userClient
    .from('visits')
    .select('id, business_id, walker_id, status')
    .eq('id', visitId)
    .maybeSingle();
  if (vErr) return json({ error: vErr.message }, 500);
  // Not visible and not-your-visit collapse deliberately: no existence oracle.
  if (!visit || visit.walker_id !== user.id) return json({ error: 'forbidden' }, 403);
  if (visit.status !== 'in_progress') {
    return json({ error: `visit is not in progress (status: ${visit.status})` }, 409);
  }

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const rows = segments.map((s) => ({
    business_id: visit.business_id,
    visit_id: visit.id,
    segment_no: s.segmentNo,
    points: s.points,
    client_uuid: s.clientUuid,
  }));

  const { data: upserted, error: upErr } = await admin
    .from('visit_tracks')
    .upsert(rows, { onConflict: 'client_uuid', ignoreDuplicates: true })
    .select('id');
  if (upErr) return json({ error: upErr.message }, 500);

  const { data: distanceM, error: rpcErr } = await admin.rpc('recompute_visit_distance', {
    p_visit: visit.id,
  });
  if (rpcErr) return json({ error: rpcErr.message }, 500);

  return json({ distanceM: distanceM as number, inserted: upserted?.length ?? 0 });
});
