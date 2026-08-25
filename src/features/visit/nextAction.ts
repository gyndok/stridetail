import { canTransition, type VisitStatus } from '@/src/lib/schedule/machine';

/**
 * Single next-action resolver (Today/navigation redesign, part A).
 *
 * Owners are usually also walkers; mode-switching is going away, so every
 * visit card and the unified visit screen ask ONE question: "what is the one
 * thing to do next on this visit, for this user?" The answer follows the
 * sponsor-approved machine:
 *
 *   offered     + assignee   -> accept   (decline stays a secondary affordance)
 *   accepted    + assignee   -> start
 *   in_progress + assignee   -> resume
 *   unassigned  + ownerRole  -> offer
 *   completed                -> report   (ownerRole only; assignee non-owner -> none)
 *   cancelled                -> none
 *
 * Where the action is a real status transition (accept, start, offer) the
 * resolver double-checks legality against the shared status-machine mirror
 * (src/lib/schedule/machine.ts) so this file can never drift ahead of the DB
 * trigger. `resume` and `report` are navigation, not transitions — no
 * machine edge exists or is consulted for them.
 *
 * `isToday` rides in the context for the part-B Today cards (a future gate is
 * one edit here); the approved machine does not condition any outcome on it,
 * so today it never changes the result — pinned in nextAction.test.ts.
 */

export type NextActionContext = {
  /** The acting user is the visit's current walker_id. */
  isAssignee: boolean;
  /** The acting user holds the owner role in the visit's business. */
  isOwnerRole: boolean;
  /** The visit falls on the current local day in its business_tz. */
  isToday: boolean;
};

export type NextVisitAction =
  | { kind: 'accept' }
  | { kind: 'start' }
  | { kind: 'resume' }
  | { kind: 'offer' }
  | { kind: 'report' }
  | { kind: 'none'; reason: string };

const none = (reason: string): NextVisitAction => ({ kind: 'none', reason });

export function nextVisitAction(
  visit: { status: VisitStatus },
  ctx: NextActionContext,
): NextVisitAction {
  const actor = {
    role: ctx.isOwnerRole ? ('owner' as const) : ('walker' as const),
    isAssignee: ctx.isAssignee,
  };
  switch (visit.status) {
    case 'offered':
      if (ctx.isAssignee && canTransition('offered', 'accepted', actor)) {
        return { kind: 'accept' };
      }
      return none('Waiting for the walker to accept or decline.');
    case 'accepted':
      if (ctx.isAssignee && canTransition('accepted', 'in_progress', actor)) {
        return { kind: 'start' };
      }
      return none('Accepted — waiting for the walker to start.');
    case 'in_progress':
      if (ctx.isAssignee) return { kind: 'resume' };
      return none('Visit in progress.');
    case 'unassigned':
      if (ctx.isOwnerRole && canTransition('unassigned', 'offered', actor)) {
        return { kind: 'offer' };
      }
      return none('Waiting for a walker to be assigned.');
    case 'completed':
      if (ctx.isOwnerRole) return { kind: 'report' };
      return none('Visit completed.');
    case 'cancelled':
      return none('Visit cancelled.');
  }
}
