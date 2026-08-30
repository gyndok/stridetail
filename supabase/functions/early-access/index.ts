// Early-access signup endpoint (2026-08-29). Public by design — the marketing
// landing page posts here with no session (verify_jwt = false in config.toml;
// the form is anonymous lead capture). Inserts into early_access_leads via the
// service role and fires a notification email to the sponsor through Resend
// (same project secrets send-email uses). The row is the record; the email is
// best-effort.
//
// Abuse posture (a public write endpoint needs one):
// * per-IP fixed-window rate limit — the report-public/invoice-public limiter,
//   tighter window (5/min): humans submit once.
// * honeypot field `website` — bots fill it; we answer success and drop it.
// * length caps + a shape check on email; no field is reflected back.
import { createClient } from 'npm:@supabase/supabase-js@2';

import { corsHeaders } from '../_shared/cors.ts';

const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 60_000;
const RATE_MAP_MAX = 10_000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const NOTIFY_TO = 'gyndok@gmail.com';

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: corsHeaders });
}

const hits = new Map<string, { count: number; windowStart: number }>();
function rateLimited(ip: string, now = Date.now()): boolean {
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

/** Trimmed string capped at n chars; anything else -> ''. */
function field(v: unknown, n: number): string {
  return typeof v === 'string' ? v.trim().slice(0, n) : '';
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (rateLimited(ip)) return json({ error: 'too many requests' }, 429);

  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) return json({ error: 'misconfigured' }, 500);

  const body: unknown = await req.json().catch(() => null);
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const name = field(b.name, 120);
  const businessName = field(b.business, 160);
  const email = field(b.email, 200).toLowerCase();
  const note = field(b.note, 1000);
  const honeypot = field(b.website, 200);

  // Bots fill the invisible field; tell them thanks and keep nothing.
  if (honeypot !== '') return json({ ok: true });

  if (!name || !EMAIL_RE.test(email)) {
    return json({ error: 'Please give us your name and a valid email.' }, 400);
  }

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { error } = await admin.from('early_access_leads').insert({
    name,
    business_name: businessName || null,
    email,
    note: note || null,
  });
  if (error) return json({ error: 'server error' }, 500);

  // Best-effort sponsor notification — the inserted row is the real record.
  const apiKey = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('EMAIL_FROM');
  if (apiKey && from) {
    const html =
      `<p><strong>${escapeHtml(name)}</strong>` +
      (businessName ? ` — ${escapeHtml(businessName)}` : '') +
      `</p><p>${escapeHtml(email)}</p>` +
      (note ? `<p>${escapeHtml(note)}</p>` : '');
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [NOTIFY_TO],
        subject: `Stridetail early access: ${name}${businessName ? ` (${businessName})` : ''}`,
        html,
        text: `${name}${businessName ? ` — ${businessName}` : ''}\n${email}\n${note}`,
      }),
    }).catch(() => undefined);
  }

  return json({ ok: true });
});
