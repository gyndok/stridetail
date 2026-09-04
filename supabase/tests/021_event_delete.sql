begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

-- Round 5b regression (Alexandria Chalet's field report): the walker event
-- DELETE policy shipped in 20260902000003 without a table-level DELETE grant,
-- so every server-side Remove failed 42501. This file pins BOTH layers: the
-- grant exists, and the policy scopes it (own running visit, non-structural
-- types only). RLS delete simply affects 0 rows when the policy refuses.

select ok(has_table_privilege('authenticated', 'public.visit_events', 'DELETE'),
  'authenticated holds the DELETE grant on visit_events (round 5b fix)');
select ok(not has_table_privilege('anon', 'public.visit_events', 'DELETE'),
  'anon holds no DELETE on visit_events');

-- ===== fixtures =====
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000211', 'owner21@test.dev'),
  ('00000000-0000-0000-0000-000000000212', 'walker21@test.dev'),
  ('00000000-0000-0000-0000-000000000213', 'walker21b@test.dev');
insert into businesses (id, name, slug, time_zone) values
  ('00000000-0000-0000-0000-00000021aaaa', 'Paw 021', 'paw-021', 'America/Chicago');
insert into memberships (business_id, user_id, role, status) values
  ('00000000-0000-0000-0000-00000021aaaa', '00000000-0000-0000-0000-000000000211', 'owner', 'active'),
  ('00000000-0000-0000-0000-00000021aaaa', '00000000-0000-0000-0000-000000000212', 'walker', 'active'),
  ('00000000-0000-0000-0000-00000021aaaa', '00000000-0000-0000-0000-000000000213', 'walker', 'active');
insert into clients (id, business_id, name) values
  ('00000000-0000-0000-0000-0000000021c1', '00000000-0000-0000-0000-00000021aaaa', 'Casey 021');
insert into services (id, business_id, name, kind, base_price_cents, duration_min) values
  ('00000000-0000-0000-0000-000000210051', '00000000-0000-0000-0000-00000021aaaa',
   'Walk', 'walk', 2500, 30);
insert into visits (id, business_id, client_id, service_id, walker_id, pet_ids,
                    scheduled_start, scheduled_end, business_tz, status) values
  ('00000000-0000-0000-0000-000000210071', '00000000-0000-0000-0000-00000021aaaa',
   '00000000-0000-0000-0000-0000000021c1', '00000000-0000-0000-0000-000000210051',
   '00000000-0000-0000-0000-000000000212', '{}',
   '2026-09-04T21:00:00Z', '2026-09-04T21:30:00Z', 'America/Chicago', 'in_progress');
insert into visit_events (id, business_id, visit_id, type, occurred_at, client_uuid) values
  ('00000000-0000-0000-0000-0000002100e1', '00000000-0000-0000-0000-00000021aaaa',
   '00000000-0000-0000-0000-000000210071', 'poop', now(),
   '00000000-0000-0000-0000-0000002100f1'),
  ('00000000-0000-0000-0000-0000002100e2', '00000000-0000-0000-0000-00000021aaaa',
   '00000000-0000-0000-0000-000000210071', 'started', now(),
   '00000000-0000-0000-0000-0000002100f2');

-- ===== assigned walker: deletes own running non-structural event =====
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000212","role":"authenticated"}';

delete from visit_events where client_uuid = '00000000-0000-0000-0000-0000002100f1';
select is((select count(*)::int from visit_events
            where id = '00000000-0000-0000-0000-0000002100e1'), 0,
  'the assigned walker deletes a mis-logged event on their running visit');

delete from visit_events where client_uuid = '00000000-0000-0000-0000-0000002100f2';
select is((select count(*)::int from visit_events
            where id = '00000000-0000-0000-0000-0000002100e2'), 1,
  'structural rows (started) survive a delete attempt — policy excludes them');

-- ===== a DIFFERENT walker: the policy refuses (0 rows), row survives =====
insert into visit_events (id, business_id, visit_id, type, occurred_at, client_uuid)
  select '00000000-0000-0000-0000-0000002100e3', '00000000-0000-0000-0000-00000021aaaa',
         '00000000-0000-0000-0000-000000210071', 'pee', now(),
         '00000000-0000-0000-0000-0000002100f3';
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000213","role":"authenticated"}';
delete from visit_events where client_uuid = '00000000-0000-0000-0000-0000002100f3';
-- count as the ASSIGNED walker: the read policy hides the row from walker 213,
-- so counting under 213 would report 0 even though the delete was refused.
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000212","role":"authenticated"}';
select is((select count(*)::int from visit_events
            where id = '00000000-0000-0000-0000-0000002100e3'), 1,
  'another walker cannot delete events on a visit that is not theirs');

-- ===== after finish, the window closes =====
set local request.jwt.claims to '{}';
set local role postgres;
update visits set status = 'completed'
 where id = '00000000-0000-0000-0000-000000210071';
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000212","role":"authenticated"}';
delete from visit_events where client_uuid = '00000000-0000-0000-0000-0000002100f3';
select is((select count(*)::int from visit_events
            where id = '00000000-0000-0000-0000-0000002100e3'), 1,
  'once the visit completes, even the assigned walker cannot delete events');

set local request.jwt.claims to '{}';

select * from finish();
rollback;
