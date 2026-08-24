begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

-- fixtures: owner A + two walkers in business A, owner B in business B. Fixed uuids so
-- cross-walker/cross-business failure tests can target real row ids without selectable
-- subqueries (003/005 style).
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000031', 'owner-a@test.dev'),
  ('00000000-0000-0000-0000-000000000032', 'walker-a1@test.dev'),
  ('00000000-0000-0000-0000-000000000033', 'walker-a2@test.dev'),
  ('00000000-0000-0000-0000-000000000034', 'owner-b@test.dev');

insert into businesses (id, name, slug, time_zone) values
  ('00000000-0000-0000-0000-00000000aaaa', 'Paw & Whisker', 'paw-whisker-006', 'America/Chicago'),
  ('00000000-0000-0000-0000-00000000bbbb', 'Other Dogs Co', 'other-dogs-006', 'America/New_York');

insert into memberships (business_id, user_id, role, status) values
  ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-000000000031', 'owner', 'active'),
  ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-000000000032', 'walker', 'active'),
  ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-000000000033', 'walker', 'active'),
  ('00000000-0000-0000-0000-00000000bbbb', '00000000-0000-0000-0000-000000000034', 'owner', 'active');

-- c1: codes on file + visits; c2: no visit for walker A1 (invisible to them);
-- c3: in_progress visit but NO codes; c4: cancelled visit only; c9: business B.
insert into clients (id, business_id, name) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000aaaa', 'Dana Harper'),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-00000000aaaa', 'Sam Rivera'),
  ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-00000000aaaa', 'Lee Okafor'),
  ('00000000-0000-0000-0000-0000000000c4', '00000000-0000-0000-0000-00000000aaaa', 'Pat Munro'),
  ('00000000-0000-0000-0000-0000000000c9', '00000000-0000-0000-0000-00000000bbbb', 'Remote Client');

insert into pets (id, client_id, business_id, name, species) values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000c1',
   '00000000-0000-0000-0000-00000000aaaa', 'Biscuit', 'dog'),
  ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000c2',
   '00000000-0000-0000-0000-00000000aaaa', 'Mochi', 'dog');

insert into pet_documents (id, pet_id, business_id, type, storage_path, expires_on) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000d1',
   '00000000-0000-0000-0000-00000000aaaa', 'rabies', 'aaaa/pets/d1/rabies.pdf', '2027-01-01'),
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000d2',
   '00000000-0000-0000-0000-00000000aaaa', 'rabies', 'aaaa/pets/d2/rabies.pdf', '2027-01-01');

insert into services (id, business_id, name, kind, base_price_cents, extra_pet_price_cents, duration_min, requires_gps) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000aaaa', 'Walk', 'walk', 2500, 500, 30, true);

-- Visits are inserted with their status directly as superuser: the transition guard is a
-- BEFORE UPDATE trigger, so fixture inserts may take any status (005 does the same).
-- v1: accepted (not in_progress); v2: in_progress w/ codes; v3: in_progress, client has
-- no codes; v4: cancelled (visibility-scope check).
insert into visits (id, business_id, client_id, service_id, walker_id, pet_ids,
                    scheduled_start, scheduled_end, business_tz, status, price_cents_snapshot) values
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000aaaa',
   '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-000000000032', '{}', '2026-09-01 14:00+00', '2026-09-01 14:30+00',
   'America/Chicago', 'accepted', 2500),
  ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-00000000aaaa',
   '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-000000000032', '{}', '2026-09-02 14:00+00', '2026-09-02 14:30+00',
   'America/Chicago', 'in_progress', 2500),
  ('00000000-0000-0000-0000-0000000000f3', '00000000-0000-0000-0000-00000000aaaa',
   '00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-000000000032', '{}', '2026-09-03 14:00+00', '2026-09-03 14:30+00',
   'America/Chicago', 'in_progress', 2500),
  ('00000000-0000-0000-0000-0000000000f4', '00000000-0000-0000-0000-00000000aaaa',
   '00000000-0000-0000-0000-0000000000c4', '00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-000000000032', '{}', '2026-09-04 14:00+00', '2026-09-04 14:30+00',
   'America/Chicago', 'cancelled', 2500);

-- ===== owner A sets codes for c1 (definer RPC — the only write path) =====
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000031","role":"authenticated"}';

select lives_ok(
  $$ select set_client_access('00000000-0000-0000-0000-0000000000c1',
       '1234', 'LB99', null, '4321', 'under the frog planter', 'ring twice') $$,
  'owner can set access codes (fixture)');

-- ===== (d) walker A1 reads exactly the clients/pets/docs their visits reach =====
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000032","role":"authenticated"}';

select is((select count(id) from clients)::int, 3,
  'walker sees exactly the clients with a visit of theirs (c1, c3, c4)');

select is((select count(id) from clients where id = '00000000-0000-0000-0000-0000000000c4')::int, 1,
  'a cancelled visit still grants client visibility (any visit row of mine counts)');

select is((select count(id) from clients where id = '00000000-0000-0000-0000-0000000000c2')::int, 0,
  'a client with no visit of mine is invisible');

select is((select count(id) from pets)::int, 1,
  'walker sees only pets of visited clients (Biscuit, not Mochi)');

select is((select count(id) from pet_documents)::int, 1,
  'walker sees only documents of pets of visited clients');

-- write paths stay owner-only
select throws_ok($$
  insert into clients (business_id, name)
  values ('00000000-0000-0000-0000-00000000aaaa', 'Walker-made Client')
$$, '42501', null, 'walker cannot insert a client');

select lives_ok($$
  update clients set name = 'Hacked' where id = '00000000-0000-0000-0000-0000000000c1'
$$, 'walker update of a visible client matches zero rows (select-only policy)');

-- ===== (e) walker A2 has no visits: zero rows everywhere =====
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000033","role":"authenticated"}';

select is((select count(id) from clients)::int, 0, 'walker without visits sees zero clients');
select is((select count(id) from pets)::int, 0, 'walker without visits sees zero pets');
select is((select count(id) from pet_documents)::int, 0, 'walker without visits sees zero pet documents');

-- ===== reveal_access denials =====
-- (a) assigned walker, visit not in_progress
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000032","role":"authenticated"}';

select throws_ok(
  $$ select * from reveal_access('00000000-0000-0000-0000-0000000000f1') $$,
  'P0001', 'access codes are only available while the visit is in progress',
  'assigned walker cannot reveal before the visit is in progress');

-- (b) a different walker, visit in_progress
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000033","role":"authenticated"}';

select throws_ok(
  $$ select * from reveal_access('00000000-0000-0000-0000-0000000000f2') $$,
  'P0001', 'only the assigned walker can reveal access codes',
  'a non-assigned walker cannot reveal even while in progress');

-- cross-business owner
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000034","role":"authenticated"}';

select throws_ok(
  $$ select * from reveal_access('00000000-0000-0000-0000-0000000000f2') $$,
  'P0001', 'only the assigned walker can reveal access codes',
  'a cross-business actor cannot reveal');

-- the visit's own business owner is not the walker either
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000031","role":"authenticated"}';

select throws_ok(
  $$ select * from reveal_access('00000000-0000-0000-0000-0000000000f2') $$,
  'P0001', 'only the assigned walker can reveal access codes',
  'the owner is not exempt from the walker gate (owners use reveal_access_owner)');

reset role;
set local request.jwt.claims to '{}';

select is((select count(*) from audit_log where action = 'access.reveal')::int, 0,
  'denied reveals write no audit rows');

-- ===== reveal_access success + missing-codes case =====
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000032","role":"authenticated"}';

select results_eq(
  $$ select door_code, lockbox_code, gate_code, alarm_code, key_location, notes
     from reveal_access('00000000-0000-0000-0000-0000000000f2') $$,
  $$ values ('1234'::text, 'LB99'::text, null::text, '4321'::text,
             'under the frog planter'::text, 'ring twice'::text) $$,
  'assigned walker on an in_progress visit gets the decrypted values');

select throws_ok(
  $$ select * from reveal_access('00000000-0000-0000-0000-0000000000f3') $$,
  'P0001', 'no access codes on file for this client',
  'in_progress visit for a client without codes raises');

reset role;
set local request.jwt.claims to '{}';

select is((select count(*) from audit_log
           where action = 'access.reveal' and entity = 'client_access'
             and entity_id = '00000000-0000-0000-0000-0000000000c1'
             and business_id = '00000000-0000-0000-0000-00000000aaaa'
             and actor_user_id = '00000000-0000-0000-0000-000000000032')::int, 1,
  'successful reveal writes exactly one access.reveal audit row (client as entity)');

select is((select meta->>'visit_id' from audit_log where action = 'access.reveal'),
  '00000000-0000-0000-0000-0000000000f2',
  'the access.reveal audit row carries the visit id in meta');

-- ===== (f) owner-side behavior unchanged =====
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000031","role":"authenticated"}';

select is((select count(id) from clients)::int, 4,
  'owner still reads every client in the business');

select is((select count(id) from pets)::int, 2, 'owner still reads every pet');

select results_eq(
  $$ select door_code from reveal_access_owner('00000000-0000-0000-0000-0000000000c1') $$,
  $$ values ('1234'::text) $$,
  'reveal_access_owner still round-trips for the owner');

select lives_ok($$
  update clients set notes_md = 'still mine' where id = '00000000-0000-0000-0000-0000000000c2'
$$, 'owner update path unchanged');

-- cross-business owner still sees nothing of business A
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000034","role":"authenticated"}';

select is((select count(id) from clients
           where business_id = '00000000-0000-0000-0000-00000000aaaa')::int, 0,
  'cross-business owner sees zero business-A clients');

select is((select count(id) from clients)::int, 1,
  'cross-business owner still sees exactly their own client');

-- ===== anon: no function access =====
set local role anon;

select throws_ok(
  $$ select * from reveal_access('00000000-0000-0000-0000-0000000000f2') $$,
  '42501', null, 'anon cannot execute reveal_access');

select * from finish();
rollback;
