// Email templates + retry backoff for the notification queue (email channel).
//
// One exported map so the messages are testable (templates.test.ts) and there
// is a single source of truth for every template this channel knows. Bodies
// stay ALIGNED with the SMS wording (../send-sms/templates.ts) — the client
// should read the same message on either channel; email adds a subject and an
// HTML variant with a real link. Placeholders come from an EmailContext the
// sender assembles exactly like the SMS sender: business/pet/service names are
// looked up from the row's business/visit at send time, the report URL and
// invite link come from the payload.

export type EmailContext = {
  businessName: string;
  /** businesses.brand_color — the white-label header/button color (2026-08-30). */
  brandColor?: string;
  /** Joined pet names, e.g. "Biscuit" or "Biscuit & Max". */
  petNames: string;
  serviceName: string;
  /** visit_finished only: full public report URL. */
  reportUrl?: string;
  /** invite only: the stridetail://invite/<token> link. */
  inviteLink?: string;
  /** invoice_ready only: 'INV-0007' label, items total, full public invoice URL. */
  invoiceNumberLabel?: string;
  invoiceTotalCents?: number;
  invoiceUrl?: string;
  /** client_invite only: portal login URL from the payload. */
  portalUrl?: string;
  /** booking_request_received only: the requesting client's name. */
  clientName?: string;
  /** booking_request_received only: pre-formatted window label (formatWindow). */
  requestWindow?: string;
  /** booking_request_approved only: pre-formatted scheduled instant (formatInstant). */
  scheduledStart?: string;
  /** booking_request_declined only: the owner's reason, verbatim. */
  declineReason?: string;
};

/** client_invite fallback when the payload carries no portalUrl. */
export const DEFAULT_PORTAL_URL = 'https://stridetail.app/portal-login';

export type EmailMessage = {
  subject: string;
  html: string;
  text: string;
};

/** "Biscuit" -> "Biscuit's" (plain ASCII possessive; names ending in s keep 's). */
function possessive(name: string): string {
  return `${name}'s`;
}

/** Minimal HTML escaping for interpolated names (bodies are our own strings). */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export const DEFAULT_BRAND_COLOR = '#E8642C';
const EMAIL_FONT = "-apple-system,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif";

/** '#a1b2c3' (3/6/8-hex) or the default — never interpolate raw DB text into styles. */
export function safeBrandColor(c: string | undefined): string {
  return c && /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(c)
    ? c
    : DEFAULT_BRAND_COLOR;
}

/**
 * White-label email shell (2026-08-30): brand-colored header carrying the
 * business name, white card body, optional brand-colored CTA button, muted
 * "Powered by Stridetail" footer. Table-based with inline styles only —
 * email clients ignore stylesheets. Because the header names the business,
 * body paragraphs should NOT repeat the "BusinessName:" prefix the plain-text
 * variant keeps (text has no header).
 */
function brandedHtml(
  c: EmailContext,
  paragraphs: string[],
  cta?: { label: string; url: string },
): string {
  const brand = safeBrandColor(c.brandColor);
  const body = paragraphs
    .map((p) => `<p style="margin:0 0 14px;">${p}</p>`)
    .join('');
  const button = cta
    ? `<p style="margin:22px 0 6px;"><a href="${escapeHtml(cta.url)}" ` +
      `style="display:inline-block;background:${brand};color:#FFFFFF;text-decoration:none;` +
      `font-weight:700;font-size:16px;padding:12px 26px;border-radius:999px;">${escapeHtml(cta.label)}</a></p>`
    : '';
  return (
    `<div style="background:#FFF4E6;padding:24px 12px;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;border-collapse:collapse;">` +
    `<tr><td style="background:${brand};border-radius:16px 16px 0 0;padding:18px 28px;">` +
    `<span style="color:#FFFFFF;font-family:${EMAIL_FONT};font-size:20px;font-weight:700;">${escapeHtml(c.businessName)}</span>` +
    `</td></tr>` +
    `<tr><td style="background:#FFFFFF;border-radius:0 0 16px 16px;padding:26px 28px;` +
    `font-family:${EMAIL_FONT};font-size:16px;line-height:1.6;color:#2B1D12;">` +
    body +
    button +
    `</td></tr>` +
    `<tr><td style="padding:16px 8px;text-align:center;font-family:${EMAIL_FONT};font-size:12px;color:#8A5A2B;">` +
    `Powered by <a href="https://stridetail.com" style="color:#8A5A2B;">Stridetail</a>` +
    `</td></tr>` +
    `</table></div>`
  );
}

/**
 * Cents -> '$45.00' / '-$5.00'. Local copy of the app's formatCents rendering
 * (src/features/billing/money.ts) — the expand.ts/polyline.ts copy pattern:
 * each function dir stays self-contained for deploy.
 */
export function centsToDollars(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  return `${sign}$${(Math.abs(cents) / 100).toFixed(2)}`;
}

/** 7 -> 'INV-0007' — copy of invoiceNumberLabel in src/features/billing/money.ts. */
export function invoiceNumberLabel(n: number): string {
  return `INV-${String(n).padStart(4, '0')}`;
}

/** ICU's U+202F (narrow no-break space, before AM/PM) -> a plain space. */
function normalizeSpaces(s: string): string {
  return s.replace(/ /g, ' ');
}

/**
 * ISO instant -> 'Thu, Aug 27, 2:00 PM' in the business zone (Plan 8 Task 7:
 * booking-request emails carry human times, not ISO strings). Intl only — no
 * date lib in the function dir; ICU's narrow no-break space before AM/PM is
 * normalized to a plain space so emails and tests stay stable. Bad input
 * (unparseable instant, unknown zone) falls back to the raw string — an
 * ugly-but-true email beats a failed queue row.
 */
export function formatInstant(iso: string, tz: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return normalizeSpaces(
      new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      }).format(d),
    );
  } catch {
    return iso;
  }
}

/** 'Thu, Aug 27, 2:00 PM – 4:00 PM' — request windows are same-day, so the end is time-only. */
export function formatWindow(startIso: string, endIso: string, tz: string): string {
  const start = formatInstant(startIso, tz);
  try {
    const e = new Date(endIso);
    if (Number.isNaN(e.getTime())) return start;
    const end = normalizeSpaces(
      new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' }).format(e),
    );
    return `${start} – ${end}`;
  } catch {
    return start;
  }
}

export const EMAIL_TEMPLATES: Record<string, (c: EmailContext) => EmailMessage> = {
  visit_started: (c) => ({
    subject: `${c.businessName}: ${possessive(c.petNames)} ${c.serviceName} visit has started`,
    text: `${c.businessName}: Walker has started ${possessive(c.petNames)} ${c.serviceName} visit.`,
    html: brandedHtml(c, [
      `${escapeHtml(possessive(c.petNames))} ${escapeHtml(c.serviceName)} visit has started — your walker has arrived.`,
    ]),
  }),
  visit_finished: (c) => ({
    subject: `${c.businessName}: ${possessive(c.petNames)} ${c.serviceName} visit report`,
    text:
      `${c.businessName}: Walker has finished ${possessive(c.petNames)} ${c.serviceName} visit. ` +
      `Report: ${c.reportUrl ?? ''}`,
    html: brandedHtml(
      c,
      [
        `${escapeHtml(possessive(c.petNames))} ${escapeHtml(c.serviceName)} visit is finished — the report card is ready, with the route, photos, and timeline.`,
        ...(c.reportUrl ? [] : ['The visit report link will follow separately.']),
      ],
      c.reportUrl ? { label: 'View the report card', url: c.reportUrl } : undefined,
    ),
  }),
  // First sentence stays ALIGNED with invoiceSmsBody in
  // src/features/report/deviceSms.ts ("Text the client" composes the same
  // message); email adds the total-due sentence and an HTML link. The total
  // sentence is omitted when the context has no total (invoice row gone) —
  // the visit_finished honest-degrade precedent, never a lying $0.00.
  invoice_ready: (c) => {
    const label = c.invoiceNumberLabel ? ` ${c.invoiceNumberLabel}` : '';
    const totalSentence =
      c.invoiceTotalCents != null ? ` Total due: ${centsToDollars(c.invoiceTotalCents)}.` : '';
    return {
      subject: c.invoiceNumberLabel
        ? `${c.businessName} — invoice ${c.invoiceNumberLabel}`
        : `${c.businessName} — your invoice is ready`,
      text:
        `${c.businessName}: Your invoice${label} is ready.${totalSentence} ` +
        `View and pay: ${c.invoiceUrl ?? ''}`,
      html: brandedHtml(
        c,
        [
          `Your invoice${escapeHtml(label)} is ready.${escapeHtml(totalSentence)}`,
          ...(c.invoiceUrl ? [] : ['The invoice link will follow separately.']),
        ],
        c.invoiceUrl ? { label: 'View & pay', url: c.invoiceUrl } : undefined,
      ),
    };
  },
  // Plan 8 Task 3: the owner's "Invite to portal" email. Warm and short; the
  // link is the portal login (payload portalUrl, hosted-URL fallback) — the
  // client signs in with THIS email address and the claim RPC does the rest.
  client_invite: (c) => {
    const url = c.portalUrl && c.portalUrl.length > 0 ? c.portalUrl : DEFAULT_PORTAL_URL;
    return {
      subject: `${c.businessName} invited you to their pet care portal`,
      text:
        `${c.businessName} invited you to their pet care portal — see your pet's visits, ` +
        `report cards, and invoices in one place. Sign in with this email address: ${url}`,
      html: brandedHtml(
        c,
        [
          `You're invited to ${escapeHtml(possessive(c.businessName))} pet care portal — see your pet's visits, report cards, and invoices in one place.`,
          `No password needed: sign in with this email address and a one-time code.`,
        ],
        { label: 'Open the portal', url },
      ),
    };
  },
  // Plan 8 Task 7: booking-request emails. Received goes to the OWNER (queued
  // by the Task-1 insert trigger); approved/declined go to the client (queued
  // by the RPCs). Subject shape for received is pinned by the plan.
  booking_request_received: (c) => {
    const who = c.clientName && c.clientName.length > 0 ? c.clientName : null;
    const win = c.requestWindow ? ` for ${c.requestWindow}` : '';
    return {
      subject: `${c.businessName}: new service request from ${who ?? 'a client'}`,
      text:
        `${c.businessName}: ${who ?? 'A client'} requested a ${c.serviceName} visit${win}. ` +
        'Open Stridetail to approve or decline.',
      html: brandedHtml(c, [
        `${escapeHtml(who ?? 'A client')} requested a ${escapeHtml(c.serviceName)} visit${escapeHtml(win)}.`,
        'Open Stridetail to approve or decline.',
      ]),
    };
  },
  booking_request_approved: (c) => {
    const when = c.scheduledStart
      ? `Your visit is scheduled for ${c.scheduledStart}.`
      : 'Your visit is on the calendar.';
    return {
      subject: `${c.businessName}: your ${c.serviceName} request is approved`,
      text:
        `Good news from ${c.businessName} — your ${c.serviceName} request is approved! ` +
        `${when} We look forward to seeing your pet.`,
      html: brandedHtml(c, [
        `Good news — your ${escapeHtml(c.serviceName)} request is approved!`,
        `${escapeHtml(when)} We look forward to seeing your pet.`,
      ]),
    };
  },
  booking_request_declined: (c) => {
    const reason = c.declineReason ? ` Reason: ${c.declineReason}.` : '';
    return {
      subject: `${c.businessName}: about your ${c.serviceName} request`,
      text:
        `${c.businessName} couldn't fit your ${c.serviceName} request this time.${reason} ` +
        'Please try another day or time.',
      html: brandedHtml(c, [
        `We couldn't fit your ${escapeHtml(c.serviceName)} request this time.${escapeHtml(reason)}`,
        'Please try another day or time.',
      ]),
    };
  },
  invite: (c) => ({
    subject: `${c.businessName} invited you to join their team on Stridetail`,
    text: `${c.businessName} invited you to join their team on Stridetail: ${c.inviteLink ?? ''}`,
    html: brandedHtml(
      c,
      [
        `You're invited to join ${escapeHtml(possessive(c.businessName))} team on Stridetail.`,
        ...(c.inviteLink ? [] : ['The invite link will follow separately.']),
      ],
      c.inviteLink ? { label: 'Accept the invite', url: c.inviteLink } : undefined,
    ),
  }),
};

/** Templates this channel accepts; anything else is a permanent failure. */
export function renderEmail(template: string, ctx: EmailContext): EmailMessage | null {
  const fn = EMAIL_TEMPLATES[template];
  return fn ? fn(ctx) : null;
}

// Retry schedule — an exact COPY of ../send-sms/templates.ts (the repo's
// expand.ts/polyline.ts copy pattern; each function dir stays self-contained):
// minutes indexed by the attempt that just failed (1-based): 1st failure ->
// +1 min, 2nd -> +5, 3rd -> +15, then hourly. MAX_ATTEMPTS failures mark the
// row 'failed' (terminal).
export const BACKOFF_MINUTES = [1, 5, 15, 60, 60, 60] as const;
export const MAX_ATTEMPTS = 6;

/** Minutes to wait after the given (1-based) failed attempt count. */
export function backoffMinutes(attempts: number): number {
  const i = Math.min(Math.max(attempts, 1), BACKOFF_MINUTES.length) - 1;
  return BACKOFF_MINUTES[i]!;
}
