import { nextVisitAction, type NextVisitAction } from '../nextAction';
import { VISIT_STATUSES, type VisitStatus } from '@/src/lib/schedule/machine';

// Sponsor-approved machine (Today/navigation redesign, 2026-08-25):
//   offered    + assignee  -> accept  (decline is the secondary affordance)
//   accepted   + assignee  -> start
//   in_progress+ assignee  -> resume
//   unassigned + ownerRole -> offer
//   completed              -> report (ownerRole only; assignee non-owner -> none)
//   cancelled              -> none
// Everything else resolves to none with a human-readable reason.

type Ctx = { isAssignee: boolean; isOwnerRole: boolean; isToday: boolean };

function expected(status: VisitStatus, ctx: Ctx): NextVisitAction['kind'] {
  switch (status) {
    case 'offered':
      return ctx.isAssignee ? 'accept' : 'none';
    case 'accepted':
      return ctx.isAssignee ? 'start' : 'none';
    case 'in_progress':
      return ctx.isAssignee ? 'resume' : 'none';
    case 'unassigned':
      return ctx.isOwnerRole ? 'offer' : 'none';
    case 'completed':
      return ctx.isOwnerRole ? 'report' : 'none';
    case 'cancelled':
      return 'none';
  }
}

describe('nextVisitAction', () => {
  const bools = [false, true] as const;

  it('resolves the full status x assignee x role x today matrix', () => {
    for (const status of VISIT_STATUSES) {
      for (const isAssignee of bools) {
        for (const isOwnerRole of bools) {
          for (const isToday of bools) {
            const ctx = { isAssignee, isOwnerRole, isToday };
            const action = nextVisitAction({ status }, ctx);
            const want = expected(status, ctx);
            expect(`${status}/${isAssignee}/${isOwnerRole}/${isToday}:${action.kind}`).toBe(
              `${status}/${isAssignee}/${isOwnerRole}/${isToday}:${want}`,
            );
          }
        }
      }
    }
  });

  it('every none carries a non-empty reason', () => {
    for (const status of VISIT_STATUSES) {
      for (const isAssignee of bools) {
        for (const isOwnerRole of bools) {
          const action = nextVisitAction({ status }, { isAssignee, isOwnerRole, isToday: true });
          if (action.kind === 'none') {
            expect(action.reason.length).toBeGreaterThan(0);
          }
        }
      }
    }
  });

  // Spot checks pinning the sponsor's named rows verbatim.
  it('offered + assignee -> accept regardless of role', () => {
    expect(nextVisitAction({ status: 'offered' }, { isAssignee: true, isOwnerRole: false, isToday: true }).kind).toBe('accept');
    expect(nextVisitAction({ status: 'offered' }, { isAssignee: true, isOwnerRole: true, isToday: false }).kind).toBe('accept');
  });

  it('accepted + assignee -> start (owner-assignee included)', () => {
    expect(nextVisitAction({ status: 'accepted' }, { isAssignee: true, isOwnerRole: true, isToday: true }).kind).toBe('start');
  });

  it('in_progress + assignee -> resume', () => {
    expect(nextVisitAction({ status: 'in_progress' }, { isAssignee: true, isOwnerRole: false, isToday: true }).kind).toBe('resume');
  });

  it('unassigned + ownerRole -> offer; walker sees none', () => {
    expect(nextVisitAction({ status: 'unassigned' }, { isAssignee: false, isOwnerRole: true, isToday: true }).kind).toBe('offer');
    expect(nextVisitAction({ status: 'unassigned' }, { isAssignee: false, isOwnerRole: false, isToday: true }).kind).toBe('none');
  });

  it('completed -> report for ownerRole only; assignee non-owner -> none', () => {
    expect(nextVisitAction({ status: 'completed' }, { isAssignee: false, isOwnerRole: true, isToday: false }).kind).toBe('report');
    expect(nextVisitAction({ status: 'completed' }, { isAssignee: true, isOwnerRole: true, isToday: false }).kind).toBe('report');
    expect(nextVisitAction({ status: 'completed' }, { isAssignee: true, isOwnerRole: false, isToday: false }).kind).toBe('none');
  });

  it('cancelled -> none for everyone', () => {
    for (const isAssignee of bools) {
      for (const isOwnerRole of bools) {
        expect(nextVisitAction({ status: 'cancelled' }, { isAssignee, isOwnerRole, isToday: true }).kind).toBe('none');
      }
    }
  });
});
