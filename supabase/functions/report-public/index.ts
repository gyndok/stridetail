// Serves the public, tokenised visit report (Plan 4 Task 7, spec §6.4).
//
// WHY verify_jwt = false (config.toml): this endpoint is PUBLIC BY DESIGN.
// The report link is sent to pet-owner clients by SMS; they have no Supabase
// account and no JWT. The credential IS the 48-hex-char public_token (24
// random bytes from finish_visit) — unguessable, unique, individually
// revocable. A JWT check would add nothing: the anon key ships inside the app
// bundle anyway, so verify_jwt only ever proves possession of a public value.
// Unknown and revoked tokens are both answered with the same 404 body so the
// endpoint is not an oracle for which tokens ever existed.
//
// Rate limiting: a tiny in-memory per-IP fixed-window limiter (30 req/min).
// KNOWN LIMITS, accepted for this endpoint's stakes: the map is PER ISOLATE —
// each edge-runtime instance counts separately, counts reset whenever an
// isolate is recycled, and a distributed attacker gets 30/min per IP per
// instance. That still reduces bulk token scanning by orders of magnitude,
// and the 2^192 token space is the real defence; a shared store (e.g.
// Postgres) is deliberately not worth a round-trip per request here.
//
// Payload is REPORT-SAFE ONLY (spec §6.4): business name/brand/logo, pet
// names, service name, times, duration, distance, a simplified route
// polyline, and the event timeline (type, time, text, photo signed URLs 24h).
// NEVER: client address, access codes, price, walker name/contact, client
// phones, private notes. Every field below is an explicit allow-list pick —
// nothing is spread from a row.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

import { corsHeaders } from '../_shared/cors.ts';
import { downsamplePolyline, flattenTrackPoints, type TrackPoint } from './polyline.ts';

const SIGNED_URL_TTL_S = 86_400; // 24 h
const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60_000;
const RATE_MAP_MAX = 10_000;
const TOKEN_RE = /^[0-9a-f]{48}$/;

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: corsHeaders });
}

/** The one not-found shape: unknown, revoked, and malformed tokens all get it. */
const notFound = () => json({ error: 'not found' }, 404);

// ---- per-IP fixed-window rate limiter (see header for its limits) ----
const hits = new Map<string, { count: number; windowStart: number }>();

export function rateLimited(ip: string, now = Date.now()): boolean {
  const h = hits.get(ip);
  if (!h || now - h.windowStart >= RATE_WINDOW_MS) {
    if (hits.size >= RATE_MAP_MAX) {
      for (const [k, v] of hits) if (now - v.windowStart >= RATE_WINDOW_MS) hits.delete(k);
      if (hits.size >= RATE_MAP_MAX) hits.clear();
    }
    hits.set(ip, { count: 1, windowStart: now });
    return false;
  }
  h.count += 1;
  return h.count > RATE_LIMIT;
}

type ReportRow = {
  id: string;
  business_id: string;
  visit_id: string;
  summary: Record<string, unknown>;
  revoked_at: string | null;
};

type EventRow = { type: string; occurred_at: string; text: string | null; photo_path: string | null };

async function signedUrl(admin: SupabaseClient, path: string | null): Promise<string | null> {
  if (!path) return null;
  const { data } = await admin.storage.from('media').createSignedUrl(path, SIGNED_URL_TTL_S);
  return data?.signedUrl ?? null;
}

/** Allow-list pick of the report-safe summary keys (finish_visit shape). */
function pickSummary(s: Record<string, unknown>) {
  return {
    petNames: Array.isArray(s['petNames']) ? s['petNames'] : [],
    serviceName: typeof s['serviceName'] === 'string' ? s['serviceName'] : null,
    scheduledStart: s['scheduledStart'] ?? null,
    scheduledEnd: s['scheduledEnd'] ?? null,
    startedAt: s['startedAt'] ?? null,
    finishedAt: s['finishedAt'] ?? null,
    durationMin: typeof s['durationMin'] === 'number' ? s['durationMin'] : null,
    distanceM: typeof s['distanceM'] === 'number' ? s['distanceM'] : null,
  };
}

async function extractToken(req: Request): Promise<string | null> {
  if (req.method === 'GET') return new URL(req.url).searchParams.get('token');
  const body: unknown = await req.json().catch(() => null);
  const token = body && typeof body === 'object' ? (body as { token?: unknown }).token : undefined;
  return typeof token === 'string' ? token : null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'GET' && req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (rateLimited(ip)) return json({ error: 'too many requests' }, 429);

  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) return json({ error: 'misconfigured' }, 500);

  const token = (await extractToken(req))?.toLowerCase() ?? null;
  // A malformed token can never exist -> same 404 as unknown (no shape oracle).
  if (!token || !TOKEN_RE.test(token)) return notFound();

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  const { data: reportData, error: reportErr } = await admin
    .from('visit_reports')
    .select('id, business_id, visit_id, summary, revoked_at')
    .eq('public_token', token)
    .maybeSingle();
  if (reportErr) return json({ error: 'server error' }, 500);
  const report = reportData as ReportRow | null;
  if (!report || report.revoked_at !== null) return notFound();

  const [bizRes, visitRes, eventsRes, tracksRes] = await Promise.all([
    admin.from('businesses').select('name, brand_color, logo_path').eq('id', report.business_id).maybeSingle(),
    admin.from('visits').select('business_tz').eq('id', report.visit_id).maybeSingle(),
    admin
      .from('visit_events')
      .select('type, occurred_at, text, photo_path')
      .eq('visit_id', report.visit_id)
      .order('occurred_at', { ascending: true }),
    admin
      .from('visit_tracks')
      .select('segment_no, points')
      .eq('visit_id', report.visit_id)
      .order('segment_no', { ascending: true }),
  ]);
  const firstErr = bizRes.error ?? visitRes.error ?? eventsRes.error ?? tracksRes.error;
  if (firstErr) return json({ error: 'server error' }, 500);

  const biz = bizRes.data as { name: string; brand_color: string; logo_path: string | null } | null;
  const visit = visitRes.data as { business_tz: string } | null;
  const events = (eventsRes.data ?? []) as EventRow[];
  const tracks = (tracksRes.data ?? []) as { segment_no: number; points: TrackPoint[] }[];

  const logoUrl = await signedUrl(admin, biz?.logo_path ?? null);
  const timeline = [];
  for (const e of events) {
    timeline.push({
      type: e.type,
      occurredAt: e.occurred_at,
      text: e.text,
      photoUrl: await signedUrl(admin, e.photo_path),
    });
  }
  const route = downsamplePolyline(flattenTrackPoints(tracks));

  return json({
    business: {
      name: biz?.name ?? 'Your pet care team',
      brandColor: biz?.brand_color ?? '#E8642C',
      logoUrl,
    },
    businessTz: visit?.business_tz ?? 'UTC',
    summary: pickSummary(report.summary ?? {}),
    timeline,
    route,
  });
});
