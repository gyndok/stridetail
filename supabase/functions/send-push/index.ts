// Drains the notifications queue for channel='push' (round 4, wish-list #8):
// claims due rows, resolves the recipient user's Expo push tokens, and posts
// to Expo's push API. Structure mirrors send-sms exactly — same cron+secret
// entry path, same claim race-safety, same backoff/attempt bookkeeping.
//
// "to" holds a USER ID (uuid as text). No tokens on file = terminal
// 'skipped_no_provider' (the user never enabled notifications — normal, not
// an error). Expo's DeviceNotRegistered response deletes the dead token row
// so uninstalled devices stop accumulating sends.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

import { corsHeaders } from '../_shared/cors.ts';
import { backoffMinutes, MAX_ATTEMPTS, renderPush, type PushContext } from './templates.ts';

const CLAIM_LIMIT = 25;
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: corsHeaders });
}

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
  error?: string;
};

/** "Thu, Sep 4 · 3:00 PM" in the visit's business tz (en-US, matches reports). */
function localWhen(iso: string, tz: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return '';
  }
}

/** Enrich one row into a template context (admin reads; every miss degrades). */
async function buildContext(admin: SupabaseClient, row: NotificationRow): Promise<PushContext> {
  const ctx: PushContext = {};
  const visitId = row.payload['visitId'];
  if (typeof visitId === 'string') {
    const { data: visit } = await admin
      .from('visits')
      .select('pet_ids, scheduled_start, business_tz, service:services(name)')
      .eq('id', visitId)
      .maybeSingle();
    const v = visit as {
      pet_ids: string[];
      scheduled_start: string;
      business_tz: string;
      service: { name: string } | null;
    } | null;
    if (v) {
      if (v.service?.name) ctx.serviceName = v.service.name;
      ctx.whenLocal = localWhen(v.scheduled_start, v.business_tz);
      if (v.pet_ids.length > 0) {
        const { data: pets } = await admin.from('pets').select('name').in('id', v.pet_ids).order('name');
        const names = ((pets ?? []) as { name: string }[]).map((p) => p.name);
        if (names.length > 0) ctx.petNames = names.join(' & ');
      }
    }
  }
  const walkerId = row.payload['walkerId'];
  if (typeof walkerId === 'string') {
    const { data: prof } = await admin
      .from('profiles')
      .select('display_name')
      .eq('user_id', walkerId)
      .maybeSingle();
    const name = (prof as { display_name: string | null } | null)?.display_name;
    if (name) ctx.walkerName = name;
  }
  const clientId = row.payload['clientId'];
  if (typeof clientId === 'string') {
    const { data: cl } = await admin.from('clients').select('name').eq('id', clientId).maybeSingle();
    const name = (cl as { name: string } | null)?.name;
    if (name) ctx.clientName = name;
  }
  const reason = row.payload['reason'];
  if (typeof reason === 'string' && reason.trim()) ctx.reason = reason.trim();
  return ctx;
}

type ExpoTicket = { status: 'ok' | 'error'; message?: string; details?: { error?: string } };

async function expoSend(
  messages: { to: string; title: string; body: string; sound: string; data: Record<string, unknown> }[],
): Promise<{ tickets?: ExpoTicket[]; error?: string }> {
  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(messages),
    });
    const data = (await res.json().catch(() => null)) as { data?: ExpoTicket[]; errors?: unknown } | null;
    if (!res.ok || !data?.data) return { error: `expo http ${res.status}` };
    return { tickets: data.data };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

async function processRow(admin: SupabaseClient, row: NotificationRow): Promise<SendResult> {
  const nowIso = () => new Date().toISOString();

  const ctx = await buildContext(admin, row);
  const msg = renderPush(row.template, ctx);
  if (msg === null) {
    await admin
      .from('notifications')
      .update({ status: 'failed', last_error: `unknown template: ${row.template}`, updated_at: nowIso() })
      .eq('id', row.id);
    return { id: row.id, template: row.template, to: row.to, status: 'failed', error: 'unknown template' };
  }

  const { data: tokenRows, error: tokErr } = await admin
    .from('push_tokens')
    .select('token')
    .eq('user_id', row.to);
  if (tokErr) return { id: row.id, template: row.template, to: row.to, status: 'queued', error: tokErr.message };
  const tokens = ((tokenRows ?? []) as { token: string }[]).map((t) => t.token);

  if (tokens.length === 0) {
    // The user never enabled push (or removed the app) — terminal, not an error.
    await admin
      .from('notifications')
      .update({ status: 'skipped_no_provider', last_error: 'no push tokens for user', updated_at: nowIso() })
      .eq('id', row.id);
    return { id: row.id, template: row.template, to: row.to, status: 'skipped_no_provider' };
  }

  const { tickets, error } = await expoSend(
    tokens.map((to) => ({
      to,
      title: msg.title,
      body: msg.body,
      sound: 'default',
      data: { template: row.template, ...row.payload },
    })),
  );

  if (!error && tickets) {
    // Dead tokens get pruned; one delivered device counts as sent.
    const dead: string[] = [];
    let delivered = 0;
    tickets.forEach((t, i) => {
      if (t.status === 'ok') delivered += 1;
      else if (t.details?.error === 'DeviceNotRegistered' && tokens[i]) dead.push(tokens[i]!);
    });
    if (dead.length > 0) await admin.from('push_tokens').delete().in('token', dead);
    if (delivered > 0) {
      await admin
        .from('notifications')
        .update({ status: 'sent', last_error: null, updated_at: nowIso() })
        .eq('id', row.id);
      return { id: row.id, template: row.template, to: row.to, status: 'sent' };
    }
    if (dead.length === tokens.length) {
      // Every device is gone — same terminal shape as never-enabled.
      await admin
        .from('notifications')
        .update({ status: 'skipped_no_provider', last_error: 'all tokens dead', updated_at: nowIso() })
        .eq('id', row.id);
      return { id: row.id, template: row.template, to: row.to, status: 'skipped_no_provider' };
    }
  }

  const attempts = row.attempts + 1;
  const lastError = error ?? 'expo tickets all errored';
  if (attempts >= MAX_ATTEMPTS) {
    await admin
      .from('notifications')
      .update({ status: 'failed', attempts, last_error: lastError, updated_at: nowIso() })
      .eq('id', row.id);
    return { id: row.id, template: row.template, to: row.to, status: 'failed', error: lastError };
  }
  const nextAt = new Date(Date.now() + backoffMinutes(attempts) * 60_000).toISOString();
  await admin
    .from('notifications')
    .update({ status: 'queued', attempts, next_attempt_at: nextAt, last_error: lastError, updated_at: nowIso() })
    .eq('id', row.id);
  return { id: row.id, template: row.template, to: row.to, status: 'queued', error: lastError };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const secret = Deno.env.get('PUSH_CRON_SECRET');
  if (!url || !serviceKey || !secret) return json({ error: 'misconfigured' }, 500);

  const given = req.headers.get('x-cron-secret') ?? '';
  if (!safeEqual(given, secret)) return json({ error: 'forbidden' }, 403);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  const { data: due, error: dueErr } = await admin
    .from('notifications')
    .select('id')
    .eq('status', 'queued')
    .eq('channel', 'push')
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
    .select('id, business_id, channel, to, template, payload, status, attempts');
  if (claimErr) return json({ error: claimErr.message }, 500);

  const results: SendResult[] = [];
  for (const row of (claimed ?? []) as NotificationRow[]) {
    results.push(await processRow(admin, row));
  }
  return json({ results });
});
