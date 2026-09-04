// Push message shapes (round 4). Titles/bodies are staff-facing and short —
// the tap opens the app, which has the full story. Retry policy mirrors
// send-sms (1/5/15/60… minutes, 6 attempts).

export const MAX_ATTEMPTS = 6;

const BACKOFF = [1, 5, 15, 60, 60, 60];

export function backoffMinutes(attempts: number): number {
  return BACKOFF[Math.min(attempts, BACKOFF.length) - 1] ?? 60;
}

export type PushContext = {
  petNames?: string;
  serviceName?: string;
  whenLocal?: string;
  walkerName?: string;
  clientName?: string;
  reason?: string;
};

export type PushMessage = { title: string; body: string };

/** null = unknown template (permanent failure, never retried). */
export function renderPush(template: string, ctx: PushContext): PushMessage | null {
  switch (template) {
    case 'visit_offered': {
      const what = [ctx.petNames, ctx.serviceName].filter(Boolean).join(' · ');
      return {
        title: 'New visit offer',
        body: [what || 'A visit', ctx.whenLocal].filter(Boolean).join(' — ') +
          '. Open to accept or decline.',
      };
    }
    case 'visit_declined':
      return {
        title: 'Visit needs a new walker',
        body:
          `${ctx.walkerName ?? 'A walker'} declined` +
          (ctx.whenLocal ? ` ${ctx.whenLocal}` : '') +
          (ctx.reason ? ` — "${ctx.reason}"` : '') +
          '. It is back in the unassigned pile.',
      };
    case 'booking_request':
      return {
        title: 'New booking request',
        body: `${ctx.clientName ?? 'A client'} requested a visit. Open to review.`,
      };
    default:
      return null;
  }
}
