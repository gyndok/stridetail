import { VISIT_STATUSES, canTransition, type VisitStatus } from '../machine';

// Independent restatement of the DB trigger's matrix
// (supabase/migrations/20260824000005_scheduling.sql, enforce_visit_transition),
// written out long-hand on purpose so machine.ts and this test cannot share a bug.
//
// owner:            unassigned->offered, unassigned/offered->accepted (force-assign),
//                   {unassigned,offered,accepted}->cancelled
// assigned walker:  offered->accepted, offered->unassigned (decline),
//                   accepted->in_progress, in_progress->completed
// The trigger's walker_ok checks only walker_id = auth.uid(), so an owner who is
// also the assignee gets the assignee transitions too. Nobody else, nothing else.
function expected(
  from: VisitStatus,
  to: VisitStatus,
  role: 'owner' | 'walker',
  isAssignee: boolean,
): boolean {
  const ownerOk = role === 'owner';
  const assigneeOk = isAssignee;
  if (from === 'unassigned' && to === 'offered') return ownerOk;
  if (from === 'unassigned' && to === 'accepted') return ownerOk;
  if (from === 'offered' && to === 'accepted') return ownerOk || assigneeOk;
  if (from === 'offered' && to === 'unassigned') return assigneeOk;
  if (from === 'accepted' && to === 'in_progress') return assigneeOk;
  if (from === 'in_progress' && to === 'completed') return assigneeOk;
  if ((from === 'unassigned' || from === 'offered' || from === 'accepted') && to === 'cancelled')
    return ownerOk;
  return false;
}

const ACTORS: { role: 'owner' | 'walker'; isAssignee: boolean }[] = [
  { role: 'owner', isAssignee: false },
  { role: 'owner', isAssignee: true },
  { role: 'walker', isAssignee: false },
  { role: 'walker', isAssignee: true },
];

describe('canTransition mirrors the DB trigger over the FULL matrix', () => {
  for (const from of VISIT_STATUSES) {
    for (const to of VISIT_STATUSES) {
      for (const actor of ACTORS) {
        const want = from === to ? false : expected(from, to, actor.role, actor.isAssignee);
        test(`${from} -> ${to} as ${actor.role}${actor.isAssignee ? '+assignee' : ''} => ${want}`, () => {
          expect(canTransition(from, to, actor)).toBe(want);
        });
      }
    }
  }
});

describe('canTransition spot checks (belt and suspenders over the loop)', () => {
  test('owner offers and force-assigns', () => {
    expect(canTransition('unassigned', 'offered', { role: 'owner', isAssignee: false })).toBe(true);
    expect(canTransition('unassigned', 'accepted', { role: 'owner', isAssignee: false })).toBe(true);
    expect(canTransition('offered', 'accepted', { role: 'owner', isAssignee: false })).toBe(true);
  });

  test('only the assigned walker declines, starts, completes', () => {
    expect(canTransition('offered', 'unassigned', { role: 'walker', isAssignee: true })).toBe(true);
    expect(canTransition('offered', 'unassigned', { role: 'owner', isAssignee: false })).toBe(false);
    expect(canTransition('accepted', 'in_progress', { role: 'walker', isAssignee: true })).toBe(true);
    expect(canTransition('accepted', 'in_progress', { role: 'owner', isAssignee: false })).toBe(false);
    expect(canTransition('in_progress', 'completed', { role: 'walker', isAssignee: true })).toBe(true);
  });

  test('an unassigned walker can do nothing at all', () => {
    for (const from of VISIT_STATUSES) {
      for (const to of VISIT_STATUSES) {
        expect(canTransition(from, to, { role: 'walker', isAssignee: false })).toBe(false);
      }
    }
  });

  test('nothing leaves completed or cancelled', () => {
    for (const from of ['completed', 'cancelled'] as const) {
      for (const to of VISIT_STATUSES) {
        for (const actor of ACTORS) {
          expect(canTransition(from, to, actor)).toBe(false);
        }
      }
    }
  });

  test('owner cannot cancel once in progress', () => {
    expect(canTransition('in_progress', 'cancelled', { role: 'owner', isAssignee: false })).toBe(false);
  });
});
