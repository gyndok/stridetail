// SMS body templates + retry backoff for the notification queue (Plan 4 Task 6).
//
// One exported map so the bodies are testable (templates.test.ts) and there is
// a single source of truth for every template the queue knows. Placeholders come
// from a SmsContext the sender assembles: business/pet/service names are looked
// up from the notification row's business/visit at send time (the Task-1 queue
// payloads carry only ids), the report URL and invite link come from the payload.

export type SmsContext = {
  businessName: string;
  /** Joined pet names, e.g. "Biscuit" or "Biscuit & Max". */
  petNames: string;
  serviceName: string;
  /** visit_finished only: full public report URL. */
  reportUrl?: string;
  /** invite only: the stridetail://invite/<token> link. */
  inviteLink?: string;
};

/** "Biscuit" -> "Biscuit's" (plain ASCII possessive; names ending in s keep 's). */
function possessive(name: string): string {
  return `${name}'s`;
}

export const SMS_TEMPLATES: Record<string, (c: SmsContext) => string> = {
  visit_started: (c) =>
    `${c.businessName}: Walker has started ${possessive(c.petNames)} ${c.serviceName} visit.`,
  visit_finished: (c) =>
    `${c.businessName}: Walker has finished ${possessive(c.petNames)} ${c.serviceName} visit. ` +
    `Report: ${c.reportUrl ?? ''}`,
  invite: (c) => `${c.businessName} invited you to join their team on Stridetail: ${c.inviteLink ?? ''}`,
};

/** Templates the queue accepts; anything else is a permanent failure. */
export function renderSms(template: string, ctx: SmsContext): string | null {
  const fn = SMS_TEMPLATES[template];
  return fn ? fn(ctx) : null;
}

// Retry schedule (minutes) indexed by the attempt that just failed (1-based):
// 1st failure -> +1 min, 2nd -> +5, 3rd -> +15, then hourly. MAX_ATTEMPTS
// failures mark the row 'failed' (terminal).
export const BACKOFF_MINUTES = [1, 5, 15, 60, 60, 60] as const;
export const MAX_ATTEMPTS = 6;

/** Minutes to wait after the given (1-based) failed attempt count. */
export function backoffMinutes(attempts: number): number {
  const i = Math.min(Math.max(attempts, 1), BACKOFF_MINUTES.length) - 1;
  return BACKOFF_MINUTES[i]!;
}
