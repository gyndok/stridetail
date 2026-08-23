begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

-- fixtures: owner A + walker in business A, owner B in business B. Fixed uuids so
-- cross-tenant failure tests can target real row ids without selectable subqueries.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000011', 'owner-a@test.dev'),
  ('00000000-0000-0000-0000-000000000012', 'walker-a@test.dev'),
  ('00000000-0000-0000-0000-000000000014', 'owner-b@test.dev');

insert into businesses (id, name, slug, time_zone) values
  ('00000000-0000-0000-0000-00000000aaaa', 'Paw & Whisker', 'paw-whisker-003', 'America/Chicago'),
  ('00000000-0000-0000-0000-00000000bbbb', 'Other Dogs Co', 'other-dogs-003', 'America/New_York');

insert into memberships (business_id, user_id, role, status) values
  ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-000000000011', 'owner', 'active'),
  ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-000000000012', 'walker', 'active'),
  ('00000000-0000-0000-0000-00000000bbbb', '00000000-0000-0000-0000-000000000014', 'owner', 'active');

-- c1 gets access codes; c2 never does (has_client_access false path)
insert into clients (id, business_id, name) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000aaaa', 'Dana Harper'),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-00000000aaaa', 'Sam Rivera');

-- ===== the table itself is unreadable and unwritable for authenticated =====
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000011","role":"authenticated"}';

select throws_ok(
  $$ select * from client_access $$,
  '42501', null, 'authenticated cannot select client_access directly (even the owner)');

select throws_ok(
  $$ insert into client_access (client_id, business_id)
     values ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000aaaa') $$,
  '42501', null, 'authenticated cannot insert client_access directly');

-- ===== owner A: set -> reveal round trip (gate left null for the null-safe path) =====
select lives_ok(
  $$ select set_client_access('00000000-0000-0000-0000-0000000000c1',
       '1234', 'LB99', null, '4321', 'under the frog planter', 'ring twice') $$,
  'owner can set access codes');

select is(has_client_access('00000000-0000-0000-0000-0000000000c1'), true,
  'has_client_access true when codes on file');
select is(has_client_access('00000000-0000-0000-0000-0000000000c2'), false,
  'has_client_access false when no codes on file');

select results_eq(
  $$ select door_code, lockbox_code, gate_code, alarm_code, key_location, notes
     from reveal_access_owner('00000000-0000-0000-0000-0000000000c1') $$,
  $$ values ('1234'::text, 'LB99'::text, null::text, '4321'::text,
             'under the frog planter'::text, 'ring twice'::text) $$,
  'owner reveal round-trips all values including the null gate code');

select is((select count(*) from audit_log
           where action = 'access.set' and entity = 'client_access'
             and entity_id = '00000000-0000-0000-0000-0000000000c1'
             and business_id = '00000000-0000-0000-0000-00000000aaaa'
             and actor_user_id = '00000000-0000-0000-0000-000000000011')::int, 1,
  'set writes an access.set audit row');

select is((select count(*) from audit_log
           where action = 'access.reveal_owner' and entity = 'client_access'
             and entity_id = '00000000-0000-0000-0000-0000000000c1'
             and business_id = '00000000-0000-0000-0000-00000000aaaa'
             and actor_user_id = '00000000-0000-0000-0000-000000000011')::int, 1,
  'reveal writes an access.reveal_owner audit row');

-- ===== upsert: second set replaces the row in place =====
select lives_ok(
  $$ select set_client_access('00000000-0000-0000-0000-0000000000c1',
       '9999', 'LB99', null, '4321', 'under the frog planter', 'ring twice') $$,
  'set upserts on an existing row');

select results_eq(
  $$ select door_code from reveal_access_owner('00000000-0000-0000-0000-0000000000c1') $$,
  $$ values ('9999'::text) $$,
  'reveal returns the updated door code');

select is((select count(*) from audit_log where action = 'access.set')::int, 2,
  'each set writes its own audit row');

-- ===== walker of business A: everything raises =====
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000012","role":"authenticated"}';

select throws_ok(
  $$ select * from reveal_access_owner('00000000-0000-0000-0000-0000000000c1') $$,
  'P0001', 'only the business owner can reveal access codes', 'walker cannot reveal');

select throws_ok(
  $$ select set_client_access('00000000-0000-0000-0000-0000000000c1',
       '0000', null, null, null, null, null) $$,
  'P0001', 'only the business owner can set access codes', 'walker cannot set');

select throws_ok(
  $$ select has_client_access('00000000-0000-0000-0000-0000000000c1') $$,
  'P0001', 'only the business owner can check access codes', 'walker cannot probe has_client_access');

-- ===== owner of business B: cross-tenant raises =====
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000014","role":"authenticated"}';

select throws_ok(
  $$ select * from reveal_access_owner('00000000-0000-0000-0000-0000000000c1') $$,
  'P0001', 'only the business owner can reveal access codes', 'other-business owner cannot reveal');

select throws_ok(
  $$ select set_client_access('00000000-0000-0000-0000-0000000000c1',
       '0000', null, null, null, null, null) $$,
  'P0001', 'only the business owner can set access codes', 'other-business owner cannot set');

-- ===== storage checks as superuser: ciphertext at rest, single row, no leaked audit =====
reset role;

select is((select count(*) from client_access)::int, 1, 'upsert keeps a single row per client');

select isnt(
  (select door_code_enc from client_access where client_id = '00000000-0000-0000-0000-0000000000c1'),
  '9999'::bytea,
  'stored bytea is not the plaintext');

select ok(
  (select position('9999'::bytea in door_code_enc) = 0
   from client_access where client_id = '00000000-0000-0000-0000-0000000000c1'),
  'plaintext is not embedded anywhere in the ciphertext');

select is(
  (select gate_code_enc from client_access where client_id = '00000000-0000-0000-0000-0000000000c1'),
  null::bytea,
  'null input stays a null column (no encrypted empty value)');

select is((select count(*) from audit_log where action like 'access.%')::int, 4,
  'denied attempts write no audit rows (2 sets + 2 reveals only)');

select is((select count(*) from vault.secrets where name = 'client_access_key')::int, 1,
  'vault holds exactly one client_access_key secret');

-- ===== anon: no table read, no function execute =====
set local role anon;

select throws_ok(
  $$ select * from client_access $$,
  '42501', null, 'anon cannot select client_access');

select throws_ok(
  $$ select has_client_access('00000000-0000-0000-0000-0000000000c1') $$,
  '42501', null, 'anon cannot execute the access functions');

select * from finish();
rollback;
