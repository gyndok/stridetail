// Drains the notifications queue's EMAIL rows: claims due channel='email'
// rows, renders their template messages, and delivers via Resend when
// credentials are configured — otherwise marks them skipped_no_provider
// (terminal) so the pipeline is fully testable before the Resend domain/key
// land. Exact mirror of ../send-sms/index.ts (which owns the sms rows; each
// sender claims only its own channel).
//
// Single entry path, POST, cron only: verify_jwt stays ON, so the platform
// rejects any request without a valid JWT before this code runs; pg_cron/
// pg_net sends the anon key as Bearer (satisfies verify_jwt) plus an
// `x-cron-secret` header compared constant-time against the EMAIL_CRON_SECRET
// function env — its own secret, deliberately NOT shared with send-sms or
// expand-series. The anon JWT alone unlocks nothing; there is no user path.
//
// Claim (double-send race safety): due ids are read first, then
// `UPDATE ... SET status='sending' WHERE id IN (...) AND status='queued'
// RETURNING *` — a row a concurrent invocation already flipped is no longer
// 'queued', so it cannot be claimed (and sent) twice.
//
// Status transitions: queued -> sending -> sent (provider_id stamped)
//                                       -> queued again (retry, attempts++/backoff)
//                                       -> failed (MAX_ATTEMPTS reached, terminal)
//                                       -> skipped_no_provider (no Resend env, terminal)
// DELIBERATE DIVERGENCE from send-sms: email outcomes are NOT mirrored onto
// visit_reports.sms_status — that column is the SMS channel's delivery state
// (the owner report card reads it as such), so the email outcome lives on the
// notification row alone. Recorded in DEVIATIONS.md.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

import { corsHeaders } from '../_shared/cors.ts';
import { backoffMinutes, MAX_ATTEMPTS, renderEmail, type EmailContext, type EmailMessage } from './templates.ts';

const CLAIM_LIMIT = 25;
const DEFAULT_REPORT_BASE = 'https://stridetail.app/report';

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

type NotificationRow = {
  id: string;
  business_id: string;
  channel: string;
  to: string;
  template: string;
  payload: Record<string, unknown>;
  status: string;
  attempts: number;
};

type SendResult = {
  id: string;
  template: string;
  to: string;
  status: 'sent' | 'queued' | 'failed' | 'skipped_no_provider';
  subject?: string;
  body?: string;
  error?: string;
};

type Resend = { apiKey: string; from: string };

/** Assemble the template context for one notification row (admin reads). */
async function buildContext(admin: SupabaseClient, row: NotificationRow): Promise<EmailContext> {
  const ctx: EmailContext = { businessName: 'Your pet care team', petNames: 'your pet', serviceName: 'scheduled' };

  const { data: biz } = await admin.from('businesses').select('name').eq('id', row.business_id).maybeSingle();
  if (biz?.name) ctx.businessName = biz.name as string;

  if (row.template === 'invite') {
    const link = row.payload['link'];
    const token = row.payload['token'];
    ctx.inviteLink =
      typeof link === 'string' && link.length > 0
        ? link
        : typeof token === 'string'
          ? `stridetail://invite/${token}`
          : '';
    return ctx;
  }

  const visitId = row.payload['visitId'];
  if (typeof visitId === 'string') {
    const { data: visit } = await admin
      .from('visits')
      .select('pet_ids, service:services(name)')
      .eq('id', visitId)
      .maybeSingle();
    const v = visit as { pet_ids: string[]; service: { name: string } | null } | null;
    if (v?.service?.name) ctx.serviceName = v.service.name;
    if (v && v.pet_ids.length > 0) {
      const { data: pets } = await admin.from('pets').select('name').in('id', v.pet_ids).order('name');
      const names = ((pets ?? []) as { name: string }[]).map((p) => p.name);
      if (names.length > 0) ctx.petNames = names.join(' & ');
    }
  }

  if (row.template === 'visit_finished') {
    const base = Deno.env.get('REPORT_BASE_URL') ?? DEFAULT_REPORT_BASE;
    const token = row.payload['reportToken'];
    ctx.reportUrl = typeof token === 'string' ? `${base.replace(/\/$/, '')}/${token}` : base;
  }
  return ctx;
}

/** Resend REST send (no SDK): bearer auth + JSON POST. */
async function resendSend(
  rs: Resend,
  to: string,
  msg: EmailMessage,
): Promise<{ id?: string; error?: string }> {
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${rs.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: rs.from, to: [to], subject: msg.subject, html: msg.html, text: msg.text }),
    });
    const data = (await res.json().catch(() => null)) as { id?: string; message?: string } | null;
    if (!res.ok) return { error: data?.message ?? `resend http ${res.status}` };
    return { id: data?.id };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

async function processRow(admin: SupabaseClient, row: NotificationRow, resend: Resend | null): Promise<SendResult> {
  const nowIso = () => new Date().toISOString();
  const ctx = await buildContext(admin, row);
  const msg = renderEmail(row.template, ctx);

  if (msg === null) {
    // Unknown template: permanent, retries can never help.
    await admin
      .from('notifications')
      .update({ status: 'failed', last_error: `unknown template: ${row.template}`, updated_at: nowIso() })
      .eq('id', row.id);
    return { id: row.id, template: row.template, to: row.to, status: 'failed', error: 'unknown template' };
  }

  if (!resend) {
    // No provider configured: terminal skip — everything else about the visit
    // proceeded normally, and the sms channel (or the device-composed SMS
    // button) still carries the message.
    await admin
      .from('notifications')
      .update({ status: 'skipped_no_provider', last_error: 'no email provider configured', updated_at: nowIso() })
      .eq('id', row.id);
    return {
      id: row.id,
      template: row.template,
      to: row.to,
      status: 'skipped_no_provider',
      subject: msg.subject,
      body: msg.text,
    };
  }

  const sendRes = await resendSend(resend, row.to, msg);
  if (!sendRes.error) {
    await admin
      .from('notifications')
      .update({ status: 'sent', provider_id: sendRes.id ?? null, last_error: null, updated_at: nowIso() })
      .eq('id', row.id);
    return { id: row.id, template: row.template, to: row.to, status: 'sent', subject: msg.subject, body: msg.text };
  }

  const attempts = row.attempts + 1;
  if (attempts >= MAX_ATTEMPTS) {
    await admin
      .from('notifications')
      .update({ status: 'failed', attempts, last_error: sendRes.error, updated_at: nowIso() })
      .eq('id', row.id);
    return { id: row.id, template: row.template, to: row.to, status: 'failed', error: sendRes.error };
  }
  const nextAt = new Date(Date.now() + backoffMinutes(attempts) * 60_000).toISOString();
  await admin
    .from('notifications')
    .update({ status: 'queued', attempts, next_attempt_at: nextAt, last_error: sendRes.error, updated_at: nowIso() })
    .eq('id', row.id);
  return { id: row.id, template: row.template, to: row.to, status: 'queued', error: sendRes.error };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const secret = Deno.env.get('EMAIL_CRON_SECRET');
  if (!url || !serviceKey || !secret) return json({ error: 'misconfigured' }, 500);

  const given = req.headers.get('x-cron-secret') ?? '';
  if (!safeEqual(given, secret)) return json({ error: 'forbidden' }, 403);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  // Claim: read due EMAIL ids (oldest first), then flip them to 'sending' with
  // a status='queued' guard so a concurrent claimer can never double-send.
  // channel='email' keeps this sender off the sms rows (send-sms mirrors it).
  const { data: due, error: dueErr } = await admin
    .from('notifications')
    .select('id')
    .eq('status', 'queued')
    .eq('channel', 'email')
    .lte('next_attempt_at', new Date().toISOString())
    .order('next_attempt_at', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(CLAIM_LIMIT);
  if (dueErr) return json({ error: dueErr.message }, 500);
  const ids = ((due ?? []) as { id: string }[]).map((r) => r.id);
  if (ids.length === 0) return json({ results: [] });

  const { data: claimed, error: claimErr } = await admin
    .from('notifications')
    .update({ status: 'sending', updated_at: new Date().toISOString() })
    .in('id', ids)
    .eq('status', 'queued')
    // "to" is a reserved word in SQL but a plain identifier to PostgREST's
    // select parser — no quoting here (quoting is for the SQL in migrations).
    .select('id, business_id, channel, to, template, payload, status, attempts');
  if (claimErr) return json({ error: claimErr.message }, 500);

  const apiKey = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('EMAIL_FROM');
  const resend: Resend | null = apiKey && from ? { apiKey, from } : null;

  const results: SendResult[] = [];
  for (const row of (claimed ?? []) as NotificationRow[]) {
    results.push(await processRow(admin, row, resend));
  }
  return json({ provider: resend ? 'resend' : 'none', results });
});
