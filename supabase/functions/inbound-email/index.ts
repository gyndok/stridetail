// Inbound email forwarder (2026-08-29). Resend receives mail for
// *@stridetail.com (MX added on the root — the domain had no mailboxes, so
// catch-all is deliberate) and fires an `email.received` webhook here; this
// function forwards the message, content preserved, to the sponsor's inbox
// via Resend's receiving-forward API. hello@stridetail.com (and every other
// address at the domain) thereby lands in Gmail.
//
// Security: verify_jwt = false (Resend can't send a Supabase JWT) — the
// credential is the SVIX WEBHOOK SIGNATURE. Every request must carry
// svix-id/svix-timestamp/svix-signature and verify against
// RESEND_INBOUND_WEBHOOK_SECRET (HMAC-SHA256 over "id.timestamp.body",
// constant-time compare, 5-minute timestamp tolerance). No secret configured
// -> fail closed. Nothing from the payload is trusted beyond the email_id we
// hand back to Resend's own API.
import { Resend } from 'npm:resend@6';

const TOLERANCE_S = 300; // svix guidance: reject stale/future timestamps
const FORWARD_TO = 'gyndok@gmail.com';

function b64ToBytes(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

/** Svix scheme: base64(HMAC-SHA256(base64decode(secret), `${id}.${ts}.${body}`)). */
async function verifySvix(
  secret: string,
  id: string,
  timestamp: string,
  body: string,
  signatureHeader: string,
): Promise<boolean> {
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > TOLERANCE_S) return false;
  const keyBytes = b64ToBytes(secret.replace(/^whsec_/, ''));
  const key = await crypto.subtle.importKey(
    'raw', keyBytes.buffer as ArrayBuffer, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const mac = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${timestamp}.${body}`)),
  );
  // header form: "v1,<base64sig> v1,<base64sig> ..."
  for (const part of signatureHeader.split(/\s+/)) {
    const [version, sig] = part.split(',', 2);
    if (version !== 'v1' || !sig) continue;
    try {
      if (timingSafeEqual(mac, b64ToBytes(sig))) return true;
    } catch {
      // malformed base64 in one candidate — keep checking the rest
    }
  }
  return false;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });

  const secret = Deno.env.get('RESEND_INBOUND_WEBHOOK_SECRET');
  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!secret || !apiKey) return new Response('not configured', { status: 401 });

  const id = req.headers.get('svix-id') ?? '';
  const timestamp = req.headers.get('svix-timestamp') ?? '';
  const signature = req.headers.get('svix-signature') ?? '';
  const body = await req.text();
  if (!id || !timestamp || !signature || !(await verifySvix(secret, id, timestamp, body, signature))) {
    return new Response('invalid signature', { status: 401 });
  }

  let event: { type?: string; data?: { email_id?: string } };
  try {
    event = JSON.parse(body);
  } catch {
    return new Response('bad payload', { status: 400 });
  }
  if (event.type !== 'email.received' || !event.data?.email_id) {
    // Other event types are none of our business — ack so Resend stops retrying.
    return Response.json({ ok: true });
  }

  const resend = new Resend(apiKey);
  // Passthrough forward: original content and attachments exactly as received.
  // From must live on a verified sending domain; the recipient sees the real
  // sender in the forwarded message.
  const { error } = await resend.emails.receiving.forward({
    emailId: event.data.email_id,
    to: FORWARD_TO,
    from: 'inbound@stridetail.com',
  });
  if (error) {
    console.error('forward failed', error);
    // Non-2xx makes Resend retry with backoff — the right behavior for a
    // transient failure; the email itself is safe in Resend's Receiving tab.
    return new Response('forward failed', { status: 500 });
  }
  return Response.json({ ok: true });
});
