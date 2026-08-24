// Expands active visit series into concrete visits rows, now -> +8 weeks.
//
// Two entry paths, both POST, never unauthenticated (verify_jwt stays ON, so the
// platform rejects any request without a valid JWT before this code runs):
// - App path: `{ seriesId }` with a user's JWT. The caller must hold an ACTIVE
//   OWNER membership in the series' business — checked through a user-scoped
//   client (RLS) before any service-role write.
// - Cron path: `{ all: true }` plus header `x-cron-secret` matching the
//   EXPAND_CRON_SECRET function env. pg_cron/pg_net sends the anon key as the
//   Bearer token (satisfies verify_jwt) and the secret from Vault; the anon JWT
//   alone never unlocks this path. Expands every active series.
//
// Inserted visits: status 'offered' when the series walker is NOT the business
// owner, else 'accepted' (self-assigned; matches the Task 7 force-assign path);
// price_cents_snapshot = service.base + extra_pet x (pets - 1), stamped here
// because price is column-grant hidden from client roles (Plan 3 Task 1).
// Idempotency: upsert with ignoreDuplicates against the visits_series_start
// unique index on (series_id, scheduled_start).
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

import { corsHeaders } from '../_shared/cors.ts';
import { expandWeekly, fromWall, parseWeeklyRRule } from './expand.ts';

const WINDOW_DAYS = 56; // 8 weeks

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: corsHeaders });
}

/** Constant-time string compare for the cron secret. */
function safeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ea = enc.encode(a);
  const eb = enc.encode(b);
  if (ea.length !== eb.length) return false;
  let diff = 0;
  for (let i = 0; i < ea.length; i++) diff |= ea[i]! ^ eb[i]!;
  return diff === 0;
}

type SeriesRow = {
  id: string;
  business_id: string;
  client_id: string;
  service_id: string;
  walker_id: string;
  rrule: string;
  starts_on: string; // YYYY-MM-DD
  ends_on: string | null;
  local_start: string; // HH:MM:SS
  pet_ids: string[];
  active: boolean;
};

type SeriesResult = { seriesId: string; inserted: number; error?: string };

/** Local midnight of a YYYY-MM-DD date (+ optional day offset) in tz, as a UTC instant. */
function localMidnight(dateISO: string, tz: string, addDays = 0): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateISO);
  if (!m) return null;
  // Anchor at UTC noon, step days, then take that calendar date's 00:00 wall time.
  const noon = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12) + addDays * 86_400_000;
  const d = new Date(noon);
  return fromWall(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), 0, 0, tz);
}

async function expandOne(admin: SupabaseClient, s: SeriesRow, nowMs: number): Promise<SeriesResult> {
  const weekdays = parseWeeklyRRule(s.rrule);
  if (!weekdays) return { seriesId: s.id, inserted: 0, error: 'unsupported rrule' };

  const [bizRes, svcRes] = await Promise.all([
    admin.from('businesses').select('time_zone').eq('id', s.business_id).single(),
    admin
      .from('services')
      .select('base_price_cents, extra_pet_price_cents, duration_min')
      .eq('id', s.service_id)
      .single(),
  ]);
  if (bizRes.error || !bizRes.data) return { seriesId: s.id, inserted: 0, error: 'business not found' };
  if (svcRes.error || !svcRes.data) return { seriesId: s.id, inserted: 0, error: 'service not found' };
  const tz = bizRes.data.time_zone as string;
  const svc = svcRes.data as { base_price_cents: number; extra_pet_price_cents: number; duration_min: number };

  // Window: [max(now, starts_on local midnight), min(now + 8w, ends_on-inclusive bound)).
  let fromMs = nowMs;
  const startsMs = localMidnight(s.starts_on, tz);
  if (startsMs === null) return { seriesId: s.id, inserted: 0, error: 'bad starts_on' };
  if (startsMs > fromMs) fromMs = startsMs;
  let untilMs = nowMs + WINDOW_DAYS * 86_400_000;
  if (s.ends_on) {
    const endMs = localMidnight(s.ends_on, tz, 1); // ends_on is inclusive
    if (endMs === null) return { seriesId: s.id, inserted: 0, error: 'bad ends_on' };
    if (endMs < untilMs) untilMs = endMs;
  }

  const occurrences = expandWeekly({
    weekdays,
    localStart: s.local_start,
    durationMin: svc.duration_min,
    tz,
    from: new Date(fromMs),
    until: new Date(untilMs),
  });
  if (occurrences.length === 0) return { seriesId: s.id, inserted: 0 };

  // The series walker self-accepts when they own the business; anyone else is offered.
  const { data: ownerMem, error: memErr } = await admin
    .from('memberships')
    .select('id')
    .eq('business_id', s.business_id)
    .eq('user_id', s.walker_id)
    .eq('role', 'owner')
    .eq('status', 'active')
    .maybeSingle();
  if (memErr) return { seriesId: s.id, inserted: 0, error: memErr.message };
  const status = ownerMem ? 'accepted' : 'offered';

  const price = svc.base_price_cents + svc.extra_pet_price_cents * Math.max(0, s.pet_ids.length - 1);
  const rows = occurrences.map((o) => ({
    business_id: s.business_id,
    client_id: s.client_id,
    service_id: s.service_id,
    series_id: s.id,
    walker_id: s.walker_id,
    pet_ids: s.pet_ids,
    scheduled_start: o.start.toISOString(),
    scheduled_end: o.end.toISOString(),
    business_tz: tz,
    status,
    price_cents_snapshot: price,
  }));

  const { data, error } = await admin
    .from('visits')
    .upsert(rows, { onConflict: 'series_id,scheduled_start', ignoreDuplicates: true })
    .select('id');
  if (error) return { seriesId: s.id, inserted: 0, error: error.message };
  return { seriesId: s.id, inserted: data?.length ?? 0 };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !anonKey || !serviceKey) return json({ error: 'misconfigured' }, 500);

  const body: unknown = await req.json().catch(() => null);
  const seriesId = body && typeof body === 'object' ? (body as { seriesId?: unknown }).seriesId : undefined;
  const all = body && typeof body === 'object' ? (body as { all?: unknown }).all : undefined;

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  let seriesRows: SeriesRow[];

  if (all === true) {
    // Cron path: shared secret only — the Bearer token that satisfied verify_jwt
    // is the anon key and grants nothing here.
    const secret = Deno.env.get('EXPAND_CRON_SECRET');
    if (!secret) return json({ error: 'misconfigured' }, 500);
    const given = req.headers.get('x-cron-secret') ?? '';
    if (!safeEqual(given, secret)) return json({ error: 'forbidden' }, 403);

    const { data, error } = await admin.from('visit_series').select('*').eq('active', true);
    if (error) return json({ error: error.message }, 500);
    seriesRows = (data ?? []) as SeriesRow[];
  } else if (typeof seriesId === 'string' && seriesId.length > 0) {
    // App path: the caller must be an active owner of the series' business.
    const auth = req.headers.get('Authorization') ?? '';
    const userClient = createClient(url, anonKey, { global: { headers: { Authorization: auth } } });
    const {
      data: { user },
      error: userErr,
    } = await userClient.auth.getUser();
    if (userErr || !user) return json({ error: 'unauthorized' }, 401);

    const { data: s, error: sErr } = await admin.from('visit_series').select('*').eq('id', seriesId).maybeSingle();
    if (sErr) return json({ error: sErr.message }, 500);
    if (!s) return json({ error: 'series not found' }, 404);

    // User-scoped (RLS) check: a user can always read their own membership row.
    const { data: mem, error: memErr } = await userClient
      .from('memberships')
      .select('id')
      .eq('business_id', s.business_id)
      .eq('user_id', user.id)
      .eq('role', 'owner')
      .eq('status', 'active')
      .maybeSingle();
    if (memErr) return json({ error: memErr.message }, 500);
    if (!mem) return json({ error: 'forbidden' }, 403);

    seriesRows = (s as SeriesRow).active ? [s as SeriesRow] : [];
  } else {
    return json({ error: 'expected { seriesId } or { all: true }' }, 400);
  }

  const nowMs = Date.now();
  const results: SeriesResult[] = [];
  for (const s of seriesRows) {
    results.push(await expandOne(admin, s, nowMs));
  }
  return json({ results });
});
