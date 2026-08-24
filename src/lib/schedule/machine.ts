// UI mirror of the visit status machine enforced by the DB trigger
// `enforce_visit_transition` (supabase/migrations/20260824000005_scheduling.sql).
// Keep the two in lockstep: a change there is exactly one edit to ALLOWED below.
//
// This answers only "may this actor move status from -> to". The trigger's extra
// data requirements (offer/accept need a walker_id, decline needs a reason and
// clears walker_id) live with the writes, not here.

export const VISIT_STATUSES = [
  'unassigned',
  'offered',
  'accepted',
  'in_progress',
  'completed',
  'cancelled',
] as const;

export type VisitStatus = (typeof VISIT_STATUSES)[number];

export type Actor = {
  role: 'owner' | 'walker';
  /** True when the acting user is the visit's current walker_id. */
  isAssignee: boolean;
};

type Guard = 'owner' | 'assignee';

// The entire machine, one table. 'owner' = business owner; 'assignee' = the
// visit's current walker_id (the trigger checks walker_id = auth.uid(), so an
// owner who self-assigned also passes 'assignee' via isAssignee).
const ALLOWED: Record<`${VisitStatus}>${VisitStatus}` | string, readonly Guard[]> = {
  'unassigned>offered': ['owner'],
  'unassigned>accepted': ['owner'], // force-assign
  'offered>accepted': ['owner', 'assignee'], // force-assign or walker accept
  'offered>unassigned': ['assignee'], // decline (reason required, walker cleared)
  'accepted>in_progress': ['assignee'], // Plan 4 calls it; machine allows it now
  'in_progress>completed': ['assignee'],
  'unassigned>cancelled': ['owner'],
  'offered>cancelled': ['owner'],
  'accepted>cancelled': ['owner'],
};

export function canTransition(from: VisitStatus, to: VisitStatus, actor: Actor): boolean {
  const guards = ALLOWED[`${from}>${to}`];
  if (!guards) return false;
  return guards.some((g) => (g === 'owner' ? actor.role === 'owner' : actor.isAssignee));
}
