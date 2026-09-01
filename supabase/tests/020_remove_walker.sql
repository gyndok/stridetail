begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

-- remove_walker (20260901000001): owner-only walker offboarding — future
-- offered/accepted visits return to the pool, history keeps walker_id, the
-- membership dies, one audit row. Fixtures follow the 016/018 pattern.

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000201', 'owner20@test.dev'),
  ('00000000-0000-0000-0000-000000000202', 'walker20@test.dev'),
  ('00000000-0000-0000-0000-000000000203', 'other-owner20@test.dev');
insert into businesses (id, name, slug, time_zone) values
  ('00000000-0000-0000-0000-00000020aaaa', 'Paw 020', 'paw-020', 'America/Chicago'),
  ('00000000-0000-0000-0000-00000020bbbb', 'Other 020', 'other-020', 'America/Chicago');
insert into memberships (id, business_id, user_id, role, status) values
  ('00000000-0000-0000-0000-00000020a001', '00000000-0000-0000-0000-00000020aaaa',
   '00000000-0000-0000-0000-000000000201', 'owner', 'active'),
  ('00000000-0000-0000-0000-00000020a002', '00000000-0000-0000-0000-00000020aaaa',
   '00000000-0000-0000-0000-000000000202', 'walker', 'active'),
  ('00000000-0000-0000-0000-00000020a003', '00000000-0000-0000-0000-00000020bbbb',
   '00000000-0000-0000-0000-000000000203', 'owner', 'active');
insert into clients (id, business_id, name) values
  ('00000000-0000-0000-0000-00000020c001', '00000000-0000-0000-0000-00000020aaaa', 'Casey 020');
insert into services (id, business_id, name, kind, base_price_cents, duration_min) values
  ('00000000-0000-0000-0000-000000200051', '00000000-0000-0000-0000-00000020aaaa',
   'Walk', 'walk', 2500, 30);

-- Visits for the walker: one accepted (future), one offered (future), one
-- completed (history), one in_progress (the blocker, added later).
insert into visits (id, business_id, client_id, service_id, walker_id, pet_ids,
                    scheduled_start, scheduled_end, business_tz, status) values
  ('00000000-0000-0000-0000-00000020b001', '00000000-0000-0000-0000-00000020aaaa',
   '00000000-0000-0000-0000-00000020c001', '00000000-0000-0000-0000-000000200051',
   '00000000-0000-0000-0000-000000000202', '{}',
   '2026-09-05T14:00:00Z', '2026-09-05T14:30:00Z', 'America/Chicago', 'accepted'),
  ('00000000-0000-0000-0000-00000020b002', '00000000-0000-0000-0000-00000020aaaa',
   '00000000-0000-0000-0000-00000020c001', '00000000-0000-0000-0000-000000200051',
   '00000000-0000-0000-0000-000000000202', '{}',
   '2026-09-06T14:00:00Z', '2026-09-06T14:30:00Z', 'America/Chicago', 'offered'),
  ('00000000-0000-0000-0000-00000020b003', '00000000-0000-0000-0000-00000020aaaa',
   '00000000-0000-0000-0000-00000020c001', '00000000-0000-0000-0000-000000200051',
   '00000000-0000-0000-0000-000000000202', '{}',
   '2026-08-20T14:00:00Z', '2026-08-20T14:30:00Z', 'America/Chicago', 'completed');

-- ===== denials =====
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000202","role":"authenticated"}';
select throws_ok($$
  select public.remove_walker('00000000-0000-0000-0000-00000020a002')
$$, 'P0001', 'only the business owner can remove team members',
  'a walker cannot remove themselves (not an owner at all)');

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000203","role":"authenticated"}';
select throws_ok($$
  select public.remove_walker('00000000-0000-0000-0000-00000020a002')
$$, 'P0001', 'only the business owner can remove team members',
  'a cross-business owner cannot remove this walker');

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000201","role":"authenticated"}';
select throws_ok($$
  select public.remove_walker('00000000-0000-0000-0000-00000020a001')
$$, 'P0001', 'only walker memberships can be removed here',
  'owner rows are not removable through this RPC');

-- in_progress blocks (start/complete are walker-only transitions, so wear the
-- walker's claims for the fixture moves, the owner's for the assertion)
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000202","role":"authenticated"}';
update visits set status = 'in_progress'
 where id = '00000000-0000-0000-0000-00000020b001';
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000201","role":"authenticated"}';
select throws_ok($$
  select public.remove_walker('00000000-0000-0000-0000-00000020a002')
$$, 'P0001', 'this walker has a visit in progress — finish or cancel it first',
  'removal is blocked while a visit is in progress');
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000202","role":"authenticated"}';
update visits set status = 'completed'
 where id = '00000000-0000-0000-0000-00000020b001';
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000201","role":"authenticated"}';

-- ===== the removal =====
select is(public.remove_walker('00000000-0000-0000-0000-00000020a002'), 1,
  'removal returns the count of visits sent back to the pool (the offered one)');

select is((select count(*)::int from memberships
           where id = '00000000-0000-0000-0000-00000020a002'), 0,
  'the walker membership is gone');

select is((select status from visits where id = '00000000-0000-0000-0000-00000020b002'),
  'unassigned'::visit_status, 'the offered visit returned to the pool');
select is((select walker_id from visits where id = '00000000-0000-0000-0000-00000020b002'),
  null, 'the pooled visit has no walker');

select is((select walker_id from visits where id = '00000000-0000-0000-0000-00000020b003'),
  '00000000-0000-0000-0000-000000000202'::uuid,
  'HISTORY keeps the walker (payouts/reports stay attributable)');

select is((select count(*)::int from audit_log
           where action = 'membership.remove'
             and entity_id = '00000000-0000-0000-0000-00000020a002'
             and actor_user_id = '00000000-0000-0000-0000-000000000201'), 1,
  'one audit row records the removal');

-- unaccepted invite row: removable the same way, no visit logic
insert into memberships (id, business_id, role, status, invite_token, invited_email) values
  ('00000000-0000-0000-0000-00000020a004', '00000000-0000-0000-0000-00000020aaaa',
   'walker', 'invited', 'tok-020', 'pending20@test.dev');
select is(public.remove_walker('00000000-0000-0000-0000-00000020a004'), 0,
  'revoking an unaccepted invite unassigns nothing');
select is((select count(*)::int from memberships
           where id = '00000000-0000-0000-0000-00000020a004'), 0,
  'the pending invite row is gone (token dead)');

-- ===== owner withdraw/unassign transitions exist in their own right =====
insert into visits (id, business_id, client_id, service_id, walker_id, pet_ids,
                    scheduled_start, scheduled_end, business_tz, status) values
  ('00000000-0000-0000-0000-00000020b004', '00000000-0000-0000-0000-00000020aaaa',
   '00000000-0000-0000-0000-00000020c001', '00000000-0000-0000-0000-000000200051',
   '00000000-0000-0000-0000-000000000202', '{}',
   '2026-09-07T14:00:00Z', '2026-09-07T14:30:00Z', 'America/Chicago', 'accepted');
set local role authenticated;
select lives_ok($$
  update visits set status = 'unassigned'
   where id = '00000000-0000-0000-0000-00000020b004'
$$, 'the owner can unassign an accepted visit directly (matrix amendment)');
select is((select walker_id from visits where id = '00000000-0000-0000-0000-00000020b004'),
  null, 'the trigger cleared the walker on owner unassign');
reset role;
set local request.jwt.claims to '{}';

select ok(not has_function_privilege('anon', 'public.remove_walker(uuid)', 'execute'),
  'anon cannot execute remove_walker');

select * from finish();
rollback;
