import { Platform } from 'react-native';

/**
 * Device-composed SMS ("Text the client") — the no-10DLC replacement for
 * automated texting (docs/HANDOFF.md): the message goes out from the user's
 * OWN phone via the Messages composer, so no carrier registration applies.
 *
 * Bodies MIRROR supabase/functions/send-sms/templates.ts exactly (the client
 * should read the same message whether it arrives automatically or from the
 * walker's phone); change both together.
 */

export type SmsOs = 'ios' | 'android';

/** Digits plus a leading + (same normalization as clients/form.ts telUrl). */
export function sanitizeSmsPhone(phone: string): string {
  const kept = phone.replace(/[^\d+]/g, '');
  const plus = kept.startsWith('+') ? '+' : '';
  return `${plus}${kept.replace(/\+/g, '')}`;
}

/**
 * sms: URL that opens the platform composer pre-filled with `body`.
 * The body separator is platform-dependent: iOS wants `sms:<phone>&body=`,
 * Android `sms:<phone>?body=`.
 */
export function smsUrl(
  phone: string,
  body: string,
  os: SmsOs = Platform.OS === 'ios' ? 'ios' : 'android',
): string {
  const sep = os === 'ios' ? '&' : '?';
  return `sms:${sanitizeSmsPhone(phone)}${sep}body=${encodeURIComponent(body)}`;
}

/** send-sms buildContext fallback: join with " & ", 'your pet' when empty. */
export function joinPetNames(names: string[]): string {
  return names.length > 0 ? names.join(' & ') : 'your pet';
}

/** "Biscuit" -> "Biscuit's" (plain ASCII possessive; names ending in s keep 's). */
function possessive(name: string): string {
  return `${name}'s`;
}

/** Mirrors SMS_TEMPLATES.visit_started. */
export function startedSmsBody(businessName: string, petNames: string, serviceName: string): string {
  return `${businessName}: Walker has started ${possessive(petNames)} ${serviceName} visit.`;
}

/** Mirrors SMS_TEMPLATES.visit_finished (link = reportLink(token)). */
export function reportSmsBody(
  businessName: string,
  petNames: string,
  serviceName: string,
  link: string,
): string {
  return `${businessName}: Walker has finished ${possessive(petNames)} ${serviceName} visit. Report: ${link}`;
}

/**
 * Invoice-ready body ("Text the client" on the invoice detail, Plan 5 Task 4).
 * No send-sms template counterpart exists — the sms channel is dormant and
 * invoices notify by email only — so this body is defined here; keep its
 * wording in sync with the invoice_ready EMAIL template (Plan 5 Task 5).
 */
export function invoiceSmsBody(businessName: string, numberLabel: string, link: string): string {
  return `${businessName}: Your invoice ${numberLabel} is ready. View and pay: ${link}`;
}

/**
 * Finished body WITHOUT the report link — the walker's offline path: a
 * finish queued in the outbox has no report token yet (finish_visit creates
 * it server-side), so the honest message defers the link; the owner's report
 * card (which has the token) sends the linked one. Recorded in DEVIATIONS.md.
 */
export function finishedNoLinkSmsBody(businessName: string, petNames: string): string {
  return `${businessName}: ${possessive(petNames)} visit is finished — report link coming separately.`;
}
