// Serves the public, tokenised invoice page (Plan 5 Task 5, spec §4).
// MIRRORS ../report-public/index.ts — same posture, same mechanisms.
//
// WHY verify_jwt = false (config.toml): this endpoint is PUBLIC BY DESIGN.
// The invoice link is emailed to pet-owner clients; they have no Supabase
// account and no JWT. The credential IS the 48-hex-char public_token (24
// random bytes from send_invoice) — unguessable, unique, individually
// revocable. A JWT check would add nothing: the anon key ships inside the app
// bundle anyway, so verify_jwt only ever proves possession of a public value.
// Unknown, revoked, and voided tokens are all answered with the same 404 body
// so the endpoint is not an oracle for which tokens ever existed.
//
// Rate limiting: a tiny in-memory per-IP fixed-window limiter (30 req/min).
// KNOWN LIMITS, accepted for this endpoint's stakes (report-public's exact
// trade-off): the map is PER ISOLATE — each edge-runtime instance counts
// separately, counts reset whenever an isolate is recycled, and a distributed
// attacker gets 30/min per IP per instance. That still reduces bulk token
// scanning by orders of magnitude, and the 2^192 token space is the real
// defence; a shared store is deliberately not worth a round-trip per request.
//
// Payload is INVOICE-SAFE ONLY (spec §4): business name/brand/logo, the
// client's FIRST name only, invoice number label/dates/status/paidAt, line
// items (description, amount, kind), payment totals, the business's
// payment-instructions text, and — Plan 6 — the Venmo pay primitives
// (handle, balance, note) plus the Zelle / Apple Pay send-to handles, all
// only while the invoice is sent and unpaid. NEVER: client full/last name, address, phones,
// emails, access codes, walker anything, visit ids. Every field below is an
// explicit allow-list pick — nothing is spread from a row.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

import { corsHeaders } from '../_shared/cors.ts';

const SIGNED_URL_TTL_S = 86_400; // 24 h
const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60_000;
const RATE_MAP_MAX = 10_000;
const TOKEN_RE = /^[0-9a-f]{48}$/;

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: corsHeaders });
}

/** The one not-found shape: unknown, revoked, voided, and malformed tokens all get it. */
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

type InvoiceRow = {
  id: string;
  business_id: string;
  client_id: string;
  number: number;
  status: string;
  issued_on: string;
  due_on: string | null;
  paid_at: string | null;
  revoked_at: string | null;
};

/** 7 -> 'INV-0007' (mirrors invoiceNumberLabel in src/features/billing/money.ts). */
function numberLabel(n: number): string {
  return `INV-${String(n).padStart(4, '0')}`;
}

/** "Marisol Q. Lastname" -> "Marisol" — the page shows the FIRST name only. */
function firstName(name: string | null | undefined): string {
  return (name ?? '').trim().split(/\s+/)[0] ?? '';
}

async function signedUrl(admin: SupabaseClient, path: string | null): Promise<string | null> {
  if (!path) return null;
  const { data } = await admin.storage.from('media').createSignedUrl(path, SIGNED_URL_TTL_S);
  return data?.signedUrl ?? null;
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

  const { data: invoiceData, error: invoiceErr } = await admin
    .from('invoices')
    .select('id, business_id, client_id, number, status, issued_on, due_on, paid_at, revoked_at')
    .eq('public_token', token)
    .maybeSingle();
  if (invoiceErr) return json({ error: 'server error' }, 500);
  const inv = invoiceData as InvoiceRow | null;
  // Revoked and void are the same 404 as unknown (void_invoice stamps
  // revoked_at, but the status check is belt and braces — a voided invoice
  // must never render as payable).
  if (!inv || inv.revoked_at !== null || (inv.status !== 'sent' && inv.status !== 'paid')) {
    return notFound();
  }

  const [bizRes, clientRes, itemsRes, paymentsRes] = await Promise.all([
    admin
      .from('businesses')
      .select(
        'name, brand_color, logo_path, payment_instructions_md, time_zone, venmo_handle, zelle_handle, apple_pay_handle',
      )
      .eq('id', inv.business_id)
      .maybeSingle(),
    admin.from('clients').select('name').eq('id', inv.client_id).maybeSingle(),
    admin
      .from('invoice_items')
      .select('description, amount_cents, kind, created_at, id')
      .eq('invoice_id', inv.id)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true }),
    admin.from('payments').select('amount_cents').eq('invoice_id', inv.id),
  ]);
  const firstErr = bizRes.error ?? clientRes.error ?? itemsRes.error ?? paymentsRes.error;
  if (firstErr) return json({ error: 'server error' }, 500);

  const biz = bizRes.data as {
    name: string;
    brand_color: string;
    logo_path: string | null;
    payment_instructions_md: string | null;
    time_zone: string;
    venmo_handle: string | null;
    zelle_handle: string | null;
    apple_pay_handle: string | null;
  } | null;
  const client = clientRes.data as { name: string } | null;
  const items = (itemsRes.data ?? []) as { description: string; amount_cents: number; kind: string }[];
  const payments = (paymentsRes.data ?? []) as { amount_cents: number }[];

  const logoUrl = await signedUrl(admin, biz?.logo_path ?? null);
  const itemsTotalCents = items.reduce((sum, r) => sum + r.amount_cents, 0);
  const paymentsTotalCents = payments.reduce((sum, r) => sum + r.amount_cents, 0);
  const balanceCents = itemsTotalCents - paymentsTotalCents;

  // Plan 6 Task 3: Venmo pay primitives — ONLY while the invoice is actually
  // payable: a handle on file, status 'sent' (unpaid; paid invoices show the
  // PAID stamp instead), and a positive balance. The page builds the link
  // (src/lib/venmo.ts) and adjusts for tips client-side; this function never
  // constructs a URL.
  const payable = inv.status === 'sent' && balanceCents > 0;
  const venmoHandle = biz?.venmo_handle?.trim() || null;
  const venmo =
    venmoHandle && payable
      ? { handle: venmoHandle, amountCents: balanceCents, note: numberLabel(inv.number) }
      : null;
  // Zelle / Apple Pay (2026-08-29): display-only "send to" destinations —
  // neither has a Venmo-style deep-link convention, so no amount or URL ships;
  // the page shows the handle next to the balance. Same payable gate as Venmo.
  const zelleHandle = payable ? biz?.zelle_handle?.trim() || null : null;
  const applePayHandle = payable ? biz?.apple_pay_handle?.trim() || null : null;

  return json({
    business: {
      name: biz?.name ?? 'Your pet care team',
      brandColor: biz?.brand_color ?? '#E8642C',
      logoUrl,
    },
    businessTz: biz?.time_zone ?? 'UTC',
    clientFirstName: firstName(client?.name),
    invoice: {
      numberLabel: numberLabel(inv.number),
      issuedOn: inv.issued_on,
      dueOn: inv.due_on,
      status: inv.status,
      paidAt: inv.paid_at,
    },
    items: items.map((it) => ({
      description: it.description,
      amountCents: it.amount_cents,
      kind: it.kind,
    })),
    paymentsTotalCents,
    balanceCents,
    paymentInstructionsMd: biz?.payment_instructions_md ?? null,
    venmo,
    zelleHandle,
    applePayHandle,
  });
});
