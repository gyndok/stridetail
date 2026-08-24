begin;
create extension if not exists pgtap with schema extensions;
select plan(64);

-- fixtures: owner A + two walkers in business A, owner B in business B. Fixed uuids so
-- cross-walker/cross-business failure tests can target real row ids without selectable
-- subqueries (002/003 style).
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000021', 'owner-a@test.dev'),
  ('00000000-0000-0000-0000-000000000022', 'walker-a1@test.dev'),
  ('00000000-0000-0000-0000-000000000023', 'walker-a2@test.dev'),
  ('00000000-0000-0000-0000-000000000024', 'owner-b@test.dev');

insert into businesses (id, name, slug, time_zone) values
  ('00000000-0000-0000-0000-00000000aaaa', 'Paw & Whisker', 'paw-whisker-005', 'America/Chicago'),
  ('00000000-0000-0000-0000-00000000bbbb', 'Other Dogs Co', 'other-dogs-005', 'America/New_York');

insert into memberships (business_id, user_id, role, status) values
  ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-000000000021', 'owner', 'active'),
  ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-000000000022', 'walker', 'active'),
  ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-000000000023', 'walker', 'active'),
  ('00000000-0000-0000-0000-00000000bbbb', '00000000-0000-0000-0000-000000000024', 'owner', 'active');

insert into clients (id, business_id, name) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000aaaa', 'Dana Harper'),
  ('00000000-0000-0000-0000-0000000000c9', '00000000-0000-0000-0000-00000000bbbb', 'Remote Client');

insert into services (id, business_id, name, kind, base_price_cents, extra_pet_price_cents, duration_min, requires_gps) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-00000000aaaa', 'Walk', 'walk', 2500, 500, 30, true),
  ('00000000-0000-0000-0000-0000000000e9', '00000000-0000-0000-0000-00000000bbbb', 'Walk', 'walk', 3000, 500, 30, true);

-- v4: walker A2's accepted visit (cross-walker isolation); v5: business B visit
insert into visits (id, business_id, client_id, service_id, walker_id, pet_ids,
                    scheduled_start, scheduled_end, business_tz, status, price_cents_snapshot) values
  ('00000000-0000-0000-0000-0000000000f4', '00000000-0000-0000-0000-00000000aaaa',
   '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000e1',
   '00000000-0000-0000-0000-000000000023', '{}', '2026-09-02 14:00+00', '2026-09-02 14:30+00',
   'America/Chicago', 'accepted', 2500),
  ('00000000-0000-0000-0000-0000000000f5', '00000000-0000-0000-0000-00000000bbbb',
   '00000000-0000-0000-0000-0000000000c9', '00000000-0000-0000-0000-0000000000e9',
   null, '{}', '2026-09-02 15:00+00', '2026-09-02 16:00+00',
   'America/New_York', 'unassigned', 3000);

-- ===== owner A: full CRUD on visits/series; price column is unreadable client-side =====
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000021","role":"authenticated"}';

select lives_ok($$
  insert into visits (id, business_id, client_id, service_id, pet_ids,
                      scheduled_start, scheduled_end, business_tz, price_cents_snapshot)
  values ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000aaaa',
          '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000e1',
          '{}', '2026-09-01 14:00+00', '2026-09-01 14:30+00', 'America/Chicago', 2500)
$$, 'owner can insert a visit (price stamped at creation)');

select is((select count(id) from visits)::int, 2, 'owner sees all own-business visits');

select throws_ok(
  $$ select price_cents_snapshot from visits $$,
  '42501', null, 'price_cents_snapshot is not selectable by any client role (column grant)');

select lives_ok($$
  insert into visit_series (id, business_id, client_id, service_id, walker_id,
                            rrule, starts_on, ends_on, local_start, pet_ids)
  values ('00000000-0000-0000-0000-000000000051', '00000000-0000-0000-0000-00000000aaaa',
          '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000e1',
          '00000000-0000-0000-0000-000000000022',
          'FREQ=WEEKLY;BYDAY=MO,WE', '2026-09-01', null, '09:00', '{}')
$$, 'owner can insert a visit series');

select is((select count(id) from visit_series)::int, 1, 'owner sees own series');

-- ===== unique partial index (series_id, scheduled_start): expansion idempotency =====
select lives_ok($$
  insert into visits (id, business_id, client_id, service_id, series_id, pet_ids,
                      scheduled_start, scheduled_end, business_tz, price_cents_snapshot)
  values ('00000000-0000-0000-0000-0000000000f6', '00000000-0000-0000-0000-00000000aaaa',
          '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000e1',
          '00000000-0000-0000-0000-000000000051',
          '{}', '2026-09-07 14:00+00', '2026-09-07 14:30+00', 'America/Chicago', 2500)
$$, 'series-expanded visit inserts');

select throws_ok($$
  insert into visits (business_id, client_id, service_id, series_id, pet_ids,
                      scheduled_start, scheduled_end, business_tz, price_cents_snapshot)
  values ('00000000-0000-0000-0000-00000000aaaa',
          '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000e1',
          '00000000-0000-0000-0000-000000000051',
          '{}', '2026-09-07 14:00+00', '2026-09-07 14:30+00', 'America/Chicago', 2500)
$$, '23505', null, 'duplicate (series_id, scheduled_start) is rejected');

select lives_ok($$
  insert into visits (business_id, client_id, service_id, pet_ids,
                      scheduled_start, scheduled_end, business_tz, price_cents_snapshot)
  values ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-0000000000c1',
          '00000000-0000-0000-0000-0000000000e1', '{}',
          '2026-09-07 14:00+00', '2026-09-07 14:30+00', 'America/Chicago', 2500),
         ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-0000000000c1',
          '00000000-0000-0000-0000-0000000000e1', '{}',
          '2026-09-07 14:00+00', '2026-09-07 14:30+00', 'America/Chicago', 2500)
$$, 'index is partial: one-off visits may share a scheduled_start');

-- ===== offer -> accept via RPCs =====
select lives_ok($$
  select offer_visit('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-000000000022')
$$, 'owner can offer a visit to a walker');

select is((select status::text from visits where id = '00000000-0000-0000-0000-0000000000f1'),
  'offered', 'offer sets status to offered');

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000023","role":"authenticated"}';

select throws_ok(
  $$ select accept_visit('00000000-0000-0000-0000-0000000000f1') $$,
  'P0001', 'only the offered walker can accept this visit',
  'a different walker cannot accept the offer');

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000022","role":"authenticated"}';

select is((select count(id) from visits)::int, 1,
  'walker sees only visits offered to or assigned to them (not other walkers'', not other businesses)');

select throws_ok(
  $$ select price_cents_snapshot from visits where id = '00000000-0000-0000-0000-0000000000f1' $$,
  '42501', null, 'walker cannot select the price column');

select is((select status::text from visits where id = '00000000-0000-0000-0000-0000000000f1'),
  'offered', 'walker reads the non-price columns of their offered visit');

select lives_ok($$
  update visits set status = 'accepted' where id = '00000000-0000-0000-0000-0000000000f1'
$$, 'walker direct table update matches zero rows (no RLS update path)');

select is((select status::text from visits where id = '00000000-0000-0000-0000-0000000000f1'),
  'offered', 'walker direct update changed nothing; only the RPCs move status');

select lives_ok($$
  select accept_visit('00000000-0000-0000-0000-0000000000f1')
$$, 'offered walker can accept');

select is((select status::text from visits where id = '00000000-0000-0000-0000-0000000000f1'),
  'accepted', 'accept sets status to accepted');

reset role;
set local request.jwt.claims to '{}';

select is((select count(*) from audit_log
           where action = 'visit.offer' and entity = 'visit'
             and entity_id = '00000000-0000-0000-0000-0000000000f1'
             and business_id = '00000000-0000-0000-0000-00000000aaaa'
             and actor_user_id = '00000000-0000-0000-0000-000000000021')::int, 1,
  'offer writes a visit.offer audit row with the owner as actor');

select is((select count(*) from audit_log
           where action = 'visit.accept' and entity = 'visit'
             and entity_id = '00000000-0000-0000-0000-0000000000f1'
             and actor_user_id = '00000000-0000-0000-0000-000000000022')::int, 1,
  'accept writes a visit.accept audit row with the walker as actor');

-- ===== decline: requires a reason, returns to unassigned, clears the walker =====
insert into visits (id, business_id, client_id, service_id, walker_id, pet_ids,
                    scheduled_start, scheduled_end, business_tz, status, price_cents_snapshot) values
  ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-00000000aaaa',
   '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000e1',
   '00000000-0000-0000-0000-000000000022', '{}', '2026-09-03 14:00+00', '2026-09-03 14:30+00',
   'America/Chicago', 'offered', 2500);

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000022","role":"authenticated"}';

select throws_ok(
  $$ select decline_visit('00000000-0000-0000-0000-0000000000f2', null) $$,
  'P0001', 'decline requires a reason', 'decline with a null reason is rejected');

select throws_ok(
  $$ select decline_visit('00000000-0000-0000-0000-0000000000f2', '   ') $$,
  'P0001', 'decline requires a reason', 'decline with a blank reason is rejected');

select lives_ok(
  $$ select decline_visit('00000000-0000-0000-0000-0000000000f2', 'family emergency') $$,
  'offered walker can decline with a reason');

reset role;
set local request.jwt.claims to '{}';

select results_eq(
  $$ select status::text, walker_id, decline_reason
     from visits where id = '00000000-0000-0000-0000-0000000000f2' $$,
  $$ values ('unassigned'::text, null::uuid, 'family emergency'::text) $$,
  'decline returns the visit to unassigned with the reason and the walker cleared');

select is((select count(*) from audit_log
           where action = 'visit.decline' and entity = 'visit'
             and entity_id = '00000000-0000-0000-0000-0000000000f2'
             and actor_user_id = '00000000-0000-0000-0000-000000000022')::int, 1,
  'decline writes a visit.decline audit row with the walker as actor');

select is((select meta->>'decline_reason' from audit_log
           where action = 'visit.decline'
             and entity_id = '00000000-0000-0000-0000-0000000000f2'),
  'family emergency', 'decline audit row carries the reason in meta');

-- ===== cancel + who violations across roles and tenants =====
insert into visits (id, business_id, client_id, service_id, walker_id, pet_ids,
                    scheduled_start, scheduled_end, business_tz, status, price_cents_snapshot) values
  ('00000000-0000-0000-0000-0000000000f3', '00000000-0000-0000-0000-00000000aaaa',
   '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000e1',
   '00000000-0000-0000-0000-000000000022', '{}', '2026-09-04 14:00+00', '2026-09-04 14:30+00',
   'America/Chicago', 'offered', 2500),
  ('00000000-0000-0000-0000-0000000000f8', '00000000-0000-0000-0000-00000000aaaa',
   '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000e1',
   '00000000-0000-0000-0000-000000000022', '{}', '2026-09-05 14:00+00', '2026-09-05 14:30+00',
   'America/Chicago', 'completed', 2500);

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000022","role":"authenticated"}';

select throws_ok(
  $$ select cancel_visit('00000000-0000-0000-0000-0000000000f3') $$,
  'P0001', 'only the business owner can cancel visits', 'walker cannot cancel');

select throws_ok(
  $$ select offer_visit('00000000-0000-0000-0000-0000000000f3', '00000000-0000-0000-0000-000000000023') $$,
  'P0001', 'only the business owner can offer visits', 'walker cannot offer');

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000024","role":"authenticated"}';

select throws_ok(
  $$ select offer_visit('00000000-0000-0000-0000-0000000000f3', '00000000-0000-0000-0000-000000000023') $$,
  'P0001', 'only the business owner can offer visits', 'cross-business owner cannot offer');

select throws_ok(
  $$ select cancel_visit('00000000-0000-0000-0000-0000000000f3') $$,
  'P0001', 'only the business owner can cancel visits', 'cross-business owner cannot cancel');

select is((select count(id) from visits)::int, 1,
  'cross-business: owner B sees only own-business visits');

select is((select count(id) from visit_series)::int, 0,
  'cross-business: owner B sees zero series of business A');

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000021","role":"authenticated"}';

select lives_ok(
  $$ select cancel_visit('00000000-0000-0000-0000-0000000000f3') $$,
  'owner can cancel a pre-in_progress visit');

select is((select status::text from visits where id = '00000000-0000-0000-0000-0000000000f3'),
  'cancelled', 'cancel sets status to cancelled');

select throws_ok(
  $$ select cancel_visit('00000000-0000-0000-0000-0000000000f8') $$,
  'P0001', 'illegal visit status transition: completed -> cancelled',
  'a completed visit cannot be cancelled');

reset role;
set local request.jwt.claims to '{}';

select is((select count(*) from audit_log
           where action = 'visit.cancel' and entity = 'visit'
             and entity_id = '00000000-0000-0000-0000-0000000000f3'
             and actor_user_id = '00000000-0000-0000-0000-000000000021')::int, 1,
  'cancel writes a visit.cancel audit row');

-- ===== owner force-assign by direct update is legal and audited =====
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000021","role":"authenticated"}';

insert into visits (id, business_id, client_id, service_id, pet_ids,
                    scheduled_start, scheduled_end, business_tz, price_cents_snapshot)
values ('00000000-0000-0000-0000-0000000000fa', '00000000-0000-0000-0000-00000000aaaa',
        '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000e1',
        '{}', '2026-09-06 14:00+00', '2026-09-06 14:30+00', 'America/Chicago', 2500);

select lives_ok($$
  update visits
     set status = 'accepted', walker_id = '00000000-0000-0000-0000-000000000022'
   where id = '00000000-0000-0000-0000-0000000000fa'
$$, 'owner can force-assign (unassigned -> accepted) by direct update');

select is((select status::text from visits where id = '00000000-0000-0000-0000-0000000000fa'),
  'accepted', 'force-assigned visit is accepted');

reset role;
set local request.jwt.claims to '{}';

select is((select count(*) from audit_log
           where action = 'visit.accept' and entity = 'visit'
             and entity_id = '00000000-0000-0000-0000-0000000000fa'
             and actor_user_id = '00000000-0000-0000-0000-000000000021')::int, 1,
  'force-assign writes a visit.accept audit row even without the RPC (trigger-level audit)');

-- ===== availability_rules / time_off: walkers manage own, owner reads all (spec 6.2) =====
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000022","role":"authenticated"}';

select lives_ok($$
  insert into availability_rules (id, user_id, business_id, weekday, start_local, end_local)
  values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000022',
          '00000000-0000-0000-0000-00000000aaaa', 1, '09:00', '17:00')
$$, 'walker can insert their own availability rule');

select throws_ok($$
  insert into availability_rules (user_id, business_id, weekday, start_local, end_local)
  values ('00000000-0000-0000-0000-000000000023', '00000000-0000-0000-0000-00000000aaaa', 2, '09:00', '17:00')
$$, '42501', null, 'walker cannot insert availability for another walker');

select throws_ok($$
  insert into availability_rules (user_id, business_id, weekday, start_local, end_local)
  values ('00000000-0000-0000-0000-000000000022', '00000000-0000-0000-0000-00000000bbbb', 2, '09:00', '17:00')
$$, '42501', null, 'walker cannot insert availability into a business they are not a member of');

select lives_ok($$
  insert into time_off (id, user_id, business_id, starts_at, ends_at, reason)
  values ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000022',
          '00000000-0000-0000-0000-00000000aaaa', '2026-09-10 00:00+00', '2026-09-12 00:00+00', 'vacation')
$$, 'walker can insert their own time off');

reset role;
set local request.jwt.claims to '{}';

insert into availability_rules (id, user_id, business_id, weekday, start_local, end_local)
values ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-000000000023',
        '00000000-0000-0000-0000-00000000aaaa', 2, '09:00', '12:00');
insert into time_off (user_id, business_id, starts_at, ends_at, reason)
values ('00000000-0000-0000-0000-000000000023', '00000000-0000-0000-0000-00000000aaaa',
        '2026-09-15 00:00+00', '2026-09-16 00:00+00', 'appointment');

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000022","role":"authenticated"}';

select is((select count(id) from availability_rules)::int, 1,
  'walker cannot see another walker''s availability (spec 6.2)');

select is((select count(id) from time_off)::int, 1,
  'walker cannot see another walker''s time off (spec 6.2)');

select lives_ok($$
  delete from availability_rules where id = '00000000-0000-0000-0000-0000000000a2'
$$, 'walker delete of another walker''s rule matches zero rows');

reset role;
set local request.jwt.claims to '{}';

select is((select count(id) from availability_rules)::int, 2,
  'the other walker''s rule survived the cross-walker delete attempt');

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000021","role":"authenticated"}';

select is((select count(id) from availability_rules)::int, 2,
  'owner reads every availability rule in the business (for the picker)');

select is((select count(id) from time_off)::int, 2,
  'owner reads every time-off row in the business');

select lives_ok($$
  update availability_rules set end_local = '13:00'
  where id = '00000000-0000-0000-0000-0000000000a2'
$$, 'owner update of a walker''s rule matches zero rows (select-only for the owner)');

select is((select end_local from availability_rules where id = '00000000-0000-0000-0000-0000000000a2'),
  '12:00'::time, 'the walker''s rule is unchanged after the owner''s update attempt');

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000024","role":"authenticated"}';

select is((select count(id) from availability_rules)::int, 0,
  'cross-business: owner B sees zero availability rules of business A');

select is((select count(id) from time_off)::int, 0,
  'cross-business: owner B sees zero time-off rows of business A');

-- ===== visit_series: owner-only =====
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000022","role":"authenticated"}';

select is((select count(id) from visit_series)::int, 0, 'walker sees no series');

select throws_ok($$
  insert into visit_series (business_id, client_id, service_id, walker_id,
                            rrule, starts_on, local_start, pet_ids)
  values ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-0000000000c1',
          '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-000000000022',
          'FREQ=WEEKLY;BYDAY=FR', '2026-09-01', '10:00', '{}')
$$, '42501', null, 'walker cannot insert a series');

-- ===== anon: nothing =====
set local role anon;

select throws_ok(
  $$ select * from availability_rules $$,
  '42501', null, 'anon cannot select availability_rules');

select throws_ok(
  $$ select accept_visit('00000000-0000-0000-0000-0000000000f1') $$,
  '42501', null, 'anon cannot execute the visit RPCs');

-- ===== full transition matrix: every (from, to, actor) combination =====
reset role;
set local request.jwt.claims to '{}';

-- Attempt one transition as one actor against a freshly reset fixture visit. Runs with
-- superuser table privileges (like the definer RPCs / future Plan 4 RPCs) so the trigger's
-- who-checks — driven by request.jwt.claims — are what is under test, independent of RLS.
create function pg_temp.try_transition(
  p_from public.visit_status, p_to public.visit_status, p_actor uuid
) returns text language plpgsql as $fn$
declare msg text := 'ok';
begin
  perform set_config('request.jwt.claims', '', true);
  delete from public.visits where id = '00000000-0000-0000-0000-0000000000ff';
  insert into public.visits (id, business_id, client_id, service_id, walker_id, pet_ids,
                             scheduled_start, scheduled_end, business_tz, status, price_cents_snapshot)
  values ('00000000-0000-0000-0000-0000000000ff', '00000000-0000-0000-0000-00000000aaaa',
          '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000e1',
          case when p_from = 'unassigned' then null
               else '00000000-0000-0000-0000-000000000022'::uuid end,
          '{}', '2026-09-08 14:00+00', '2026-09-08 14:30+00', 'America/Chicago', p_from, 2500);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_actor::text, 'role', 'authenticated')::text, true);
  begin
    update public.visits set
      status = p_to,
      walker_id = case when p_to in ('offered', 'accepted')
                       then coalesce(walker_id, '00000000-0000-0000-0000-000000000022')
                       else walker_id end,
      decline_reason = case when p_to = 'unassigned' then 'cannot cover this one'
                            else decline_reason end
    where id = '00000000-0000-0000-0000-0000000000ff';
  exception when others then
    msg := sqlerrm;
  end;
  perform set_config('request.jwt.claims', '', true);
  return msg;
end $fn$;

-- Loop every from -> to pair (from <> to) for one actor and diff the outcome against the
-- allow-list. Returns the mismatches; an empty array means the matrix holds exactly.
create function pg_temp.matrix_mismatches(p_actor uuid, p_allowed text[])
returns text[] language plpgsql as $fn$
declare f public.visit_status; t public.visit_status; msg text; bad text[] := '{}';
        expected boolean; got boolean;
begin
  foreach f in array enum_range(null::public.visit_status) loop
    foreach t in array enum_range(null::public.visit_status) loop
      continue when f = t;
      msg := pg_temp.try_transition(f, t, p_actor);
      got := (msg = 'ok');
      expected := (f::text || '->' || t::text) = any (p_allowed);
      if got <> expected then
        bad := bad || format('%s->%s: got %s, expected %s', f, t, msg,
                             case when expected then 'ok' else 'an error' end);
      end if;
    end loop;
  end loop;
  return bad;
end $fn$;

select is(
  pg_temp.matrix_mismatches('00000000-0000-0000-0000-000000000021',
    array['unassigned->offered', 'unassigned->accepted', 'unassigned->cancelled',
          'offered->accepted', 'offered->cancelled', 'accepted->cancelled']),
  '{}'::text[],
  'owner: exactly offer, force-assign, and pre-in_progress cancel are legal');

select is(
  pg_temp.matrix_mismatches('00000000-0000-0000-0000-000000000022',
    array['offered->accepted', 'offered->unassigned',
          'accepted->in_progress', 'in_progress->completed']),
  '{}'::text[],
  'assigned walker: exactly accept, decline, start, and complete are legal');

select is(
  pg_temp.matrix_mismatches('00000000-0000-0000-0000-000000000023', '{}'::text[]),
  '{}'::text[],
  'a walker who is not the assignee can make no transition at all');

select is(
  pg_temp.matrix_mismatches('00000000-0000-0000-0000-000000000024', '{}'::text[]),
  '{}'::text[],
  'a cross-business owner can make no transition at all');

-- ===== trigger-level decline invariants (independent of the RPC) =====
insert into visits (id, business_id, client_id, service_id, walker_id, pet_ids,
                    scheduled_start, scheduled_end, business_tz, status, price_cents_snapshot)
values ('00000000-0000-0000-0000-0000000000f9', '00000000-0000-0000-0000-00000000aaaa',
        '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000e1',
        '00000000-0000-0000-0000-000000000022', '{}', '2026-09-09 14:00+00', '2026-09-09 14:30+00',
        'America/Chicago', 'offered', 2500);

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000022","role":"authenticated"}', true);

select throws_ok($$
  update visits set status = 'unassigned' where id = '00000000-0000-0000-0000-0000000000f9'
$$, 'P0001', 'decline requires a reason',
  'the trigger itself rejects a reasonless decline (not just the RPC)');

select lives_ok($$
  update visits set status = 'unassigned', decline_reason = 'double booked'
  where id = '00000000-0000-0000-0000-0000000000f9'
$$, 'decline with a reason passes the trigger even with walker_id left set');

select set_config('request.jwt.claims', '', true);

select is((select walker_id from visits where id = '00000000-0000-0000-0000-0000000000f9'),
  null::uuid, 'the trigger clears walker_id on decline');

select * from finish();
rollback;
