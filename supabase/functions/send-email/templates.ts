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
};

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

function wrapHtml(paragraphs: string[]): string {
  return paragraphs.map((p) => `<p>${p}</p>`).join('');
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

export const EMAIL_TEMPLATES: Record<string, (c: EmailContext) => EmailMessage> = {
  visit_started: (c) => ({
    subject: `${c.businessName}: ${possessive(c.petNames)} ${c.serviceName} visit has started`,
    text: `${c.businessName}: Walker has started ${possessive(c.petNames)} ${c.serviceName} visit.`,
    html: wrapHtml([
      `${escapeHtml(c.businessName)}: Walker has started ${escapeHtml(possessive(c.petNames))} ${escapeHtml(c.serviceName)} visit.`,
    ]),
  }),
  visit_finished: (c) => ({
    subject: `${c.businessName}: ${possessive(c.petNames)} ${c.serviceName} visit report`,
    text:
      `${c.businessName}: Walker has finished ${possessive(c.petNames)} ${c.serviceName} visit. ` +
      `Report: ${c.reportUrl ?? ''}`,
    html: wrapHtml([
      `${escapeHtml(c.businessName)}: Walker has finished ${escapeHtml(possessive(c.petNames))} ${escapeHtml(c.serviceName)} visit.`,
      c.reportUrl
        ? `<a href="${escapeHtml(c.reportUrl)}">View the visit report</a>`
        : 'The visit report link will follow separately.',
    ]),
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
      html: wrapHtml([
        `${escapeHtml(c.businessName)}: Your invoice${escapeHtml(label)} is ready.${escapeHtml(totalSentence)}`,
        c.invoiceUrl
          ? `<a href="${escapeHtml(c.invoiceUrl)}">View and pay your invoice</a>`
          : 'The invoice link will follow separately.',
      ]),
    };
  },
  invite: (c) => ({
    subject: `${c.businessName} invited you to join their team on Stridetail`,
    text: `${c.businessName} invited you to join their team on Stridetail: ${c.inviteLink ?? ''}`,
    html: wrapHtml([
      `${escapeHtml(c.businessName)} invited you to join their team on Stridetail: ` +
        `<a href="${escapeHtml(c.inviteLink ?? '')}">${escapeHtml(c.inviteLink ?? '')}</a>`,
    ]),
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
