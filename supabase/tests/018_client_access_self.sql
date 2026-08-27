begin;
create extension if not exists pgtap with schema extensions;
select plan(42);

-- fixtures: owner A + two linked clients in business A, owner B + a linked
-- client in business B, one unlinked authenticated user. Fixed uuids so the
-- denial tests can target real row ids (003/015 pattern).
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000021', 'owner-a@test.dev'),
  ('00000000-0000-0000-0000-000000000024', 'owner-b@test.dev'),
  ('00000000-0000-0000-0000-000000000031', 'client1-a@test.dev'),
  ('00000000-0000-0000-0000-000000000032', 'client2-a@test.dev'),
  ('00000000-0000-0000-0000-000000000033', 'unlinked@test.dev'),
  ('00000000-0000-0000-0000-000000000034', 'client-b@test.dev');

insert into businesses (id, name, slug, time_zone) values
  ('00000000-0000-0000-0000-00000000aaaa', 'Paw & Whisker', 'paw-whisker-018', 'America/Chicago'),
  ('00000000-0000-0000-0000-00000000bbbb', 'Other Dogs Co', 'other-dogs-018', 'America/New_York');

insert into memberships (business_id, user_id, role, status) values
  ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-000000000021', 'owner', 'active'),
  ('00000000-0000-0000-0000-00000000bbbb', '00000000-0000-0000-0000-000000000024', 'owner', 'active');

insert into clients (id, business_id, name) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000aaaa', 'Dana Harper'),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-00000000aaaa', 'Sam Rivera'),
  ('00000000-0000-0000-0000-0000000000c9', '00000000-0000-0000-0000-00000000bbbb', 'Blair Woods');

insert into client_users (business_id, client_id, user_id, linked_via) values
  ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-0000000000c1',
   '00000000-0000-0000-0000-000000000031', 'invite'),
  ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-0000000000c2',
   '00000000-0000-0000-0000-000000000032', 'invite'),
  ('00000000-0000-0000-0000-00000000bbbb', '00000000-0000-0000-0000-0000000000c9',
   '00000000-0000-0000-0000-000000000034', 'invite');

insert into pets (id, client_id, business_id, name, species) values
  ('00000000-0000-0000-0000-000000000a01', '00000000-0000-0000-0000-0000000000c1',
   '00000000-0000-0000-0000-00000000aaaa', 'Biscuit', 'Dog'),
  ('00000000-0000-0000-0000-000000000a02', '00000000-0000-0000-0000-0000000000c2',
   '00000000-0000-0000-0000-00000000aaaa', 'Max', 'Dog');

-- ===== helper parses safely (superuser; null means denial, never 22P02) =====
select is(
  public.storage_pets_pet_id('00000000-0000-0000-0000-00000000aaaa/pets/00000000-0000-0000-0000-000000000a01/photo.jpg'),
  '00000000-0000-0000-0000-000000000a01'::uuid,
  'helper parses the pet id from a pets path');
select is(
  public.storage_pets_pet_id('00000000-0000-0000-0000-00000000aaaa/00000000-0000-0000-0000-000000000a01/photo.jpg'),
  null::uuid,
  'a non-pets second segment returns null (visit paths never match)');
select is(
  public.storage_pets_pet_id('00000000-0000-0000-0000-00000000aaaa/pets/not-a-uuid/photo.jpg'),
  null::uuid,
  'a junk pet segment returns null, not a cast error');

-- ===== linked client 31: set -> reveal round trip on their OWN codes =====
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000031","role":"authenticated"}';

select lives_ok(
  $$ select set_client_access_self('00000000-0000-0000-0000-0000000000c1',
       '1111', 'LB7', null, '9876', 'porch bench', 'knock twice') $$,
  'the linked client sets their own codes');

select is(has_client_access_self('00000000-0000-0000-0000-0000000000c1'), true,
  'has_client_access_self true when codes on file');

select results_eq(
  $$ select door_code, lockbox_code, gate_code, alarm_code, key_location, notes
     from reveal_client_access_self('00000000-0000-0000-0000-0000000000c1') $$,
  $$ values ('1111'::text, 'LB7'::text, null::text, '9876'::text,
             'porch bench'::text, 'knock twice'::text) $$,
  'client reveal round-trips all values including the null gate code');

-- audit_log select is owner-only (20260824000001) — count as superuser, then
-- come back to the client session.
reset role;
set local request.jwt.claims to '{}';

select is((select count(*) from audit_log
           where action = 'client_access.self_set' and entity = 'client_access'
             and entity_id = '00000000-0000-0000-0000-0000000000c1'
             and business_id = '00000000-0000-0000-0000-00000000aaaa'
             and actor_user_id = '00000000-0000-0000-0000-000000000031')::int, 1,
  'set writes a client_access.self_set audit row');

select is((select count(*) from audit_log
           where action = 'client_access.self_reveal' and entity = 'client_access'
             and entity_id = '00000000-0000-0000-0000-0000000000c1'
             and business_id = '00000000-0000-0000-0000-00000000aaaa'
             and actor_user_id = '00000000-0000-0000-0000-000000000031')::int, 1,
  'reveal writes a client_access.self_reveal audit row');

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000031","role":"authenticated"}';

select lives_ok(
  $$ select set_client_access_self('00000000-0000-0000-0000-0000000000c1',
       '2222', 'LB7', null, '9876', 'porch bench', 'knock twice') $$,
  'self set upserts on an existing row');

select results_eq(
  $$ select door_code from reveal_client_access_self('00000000-0000-0000-0000-0000000000c1') $$,
  $$ values ('2222'::text) $$,
  'reveal returns the updated door code');

-- ===== client 31 vs the OTHER client of the same business: denied =====
select throws_ok(
  $$ select set_client_access_self('00000000-0000-0000-0000-0000000000c2',
       '0000', null, null, null, null, null) $$,
  'P0001', 'only the linked client can set access codes',
  'cross-client set denied (same business)');

select throws_ok(
  $$ select * from reveal_client_access_self('00000000-0000-0000-0000-0000000000c2') $$,
  'P0001', 'only the linked client can reveal access codes',
  'cross-client reveal denied (same business)');

select throws_ok(
  $$ select has_client_access_self('00000000-0000-0000-0000-0000000000c2') $$,
  'P0001', 'only the linked client can check access codes',
  'cross-client has_client_access_self denied');

-- ===== client 32: cannot reach c1; own empty row reads false =====
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000032","role":"authenticated"}';

select throws_ok(
  $$ select * from reveal_client_access_self('00000000-0000-0000-0000-0000000000c1') $$,
  'P0001', 'only the linked client can reveal access codes',
  'the other client of the same business cannot reveal c1');

select is(has_client_access_self('00000000-0000-0000-0000-0000000000c2'), false,
  'has_client_access_self false when this client has no codes');

-- ===== client 34 (business B): cross-business denial =====
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000034","role":"authenticated"}';

select throws_ok(
  $$ select set_client_access_self('00000000-0000-0000-0000-0000000000c1',
       '0000', null, null, null, null, null) $$,
  'P0001', 'only the linked client can set access codes', 'cross-business set denied');

select throws_ok(
  $$ select * from reveal_client_access_self('00000000-0000-0000-0000-0000000000c1') $$,
  'P0001', 'only the linked client can reveal access codes', 'cross-business reveal denied');

-- ===== unlinked authenticated user 33: denial =====
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000033","role":"authenticated"}';

select throws_ok(
  $$ select set_client_access_self('00000000-0000-0000-0000-0000000000c1',
       '0000', null, null, null, null, null) $$,
  'P0001', 'only the linked client can set access codes', 'an unlinked user cannot set');

select throws_ok(
  $$ select * from reveal_client_access_self('00000000-0000-0000-0000-0000000000c1') $$,
  'P0001', 'only the linked client can reveal access codes', 'an unlinked user cannot reveal');

-- ===== owner A: the owner RPCs are unaffected (spot-check) =====
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000021","role":"authenticated"}';

select results_eq(
  $$ select door_code, lockbox_code, gate_code, alarm_code, key_location, notes
     from reveal_access_owner('00000000-0000-0000-0000-0000000000c1') $$,
  $$ values ('2222'::text, 'LB7'::text, null::text, '9876'::text,
             'porch bench'::text, 'knock twice'::text) $$,
  'owner reveal still works and sees the client-set codes (one shared row)');

select lives_ok(
  $$ select set_client_access('00000000-0000-0000-0000-0000000000c1',
       '3333', 'LB7', null, '9876', 'porch bench', 'knock twice') $$,
  'owner set still works on the same row');

select throws_ok(
  $$ select * from reveal_client_access_self('00000000-0000-0000-0000-0000000000c1') $$,
  'P0001', 'only the linked client can reveal access codes',
  'the owner is not a linked client — the self reveal raises for them');

select is(has_client_access('00000000-0000-0000-0000-0000000000c1'), true,
  'owner has_client_access unaffected');

-- ===== client 31 again: sees the owner-updated code (shared row) =====
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000031","role":"authenticated"}';

select results_eq(
  $$ select door_code from reveal_client_access_self('00000000-0000-0000-0000-0000000000c1') $$,
  $$ values ('3333'::text) $$,
  'client reveal sees the owner-updated code');

-- ===== pets column trigger regression: self-service set only =====
select lives_ok(
  $$ update pets set feeding_md = '2 cups kibble'
     where id = '00000000-0000-0000-0000-000000000a01' $$,
  'linked client updates a self-service pet column');

select ok(
  (select feeding_md = '2 cups kibble' from pets
   where id = '00000000-0000-0000-0000-000000000a01'),
  'the self-service update landed');

select throws_ok(
  $$ update pets set name = 'Rex' where id = '00000000-0000-0000-0000-000000000a01' $$,
  'P0001', 'clients may edit only care notes, vet info, and the photo',
  'identity columns still blocked for clients');

select throws_ok(
  $$ update pets set meds_md = 'edited' where id = '00000000-0000-0000-0000-000000000a01' $$,
  'P0001', 'clients may edit only care notes, vet info, and the photo',
  'meds stay owner-only for clients');

-- ===== storage: own pet path only, no tenant spoofing =====
select lives_ok($$
  insert into storage.objects (bucket_id, name)
  values ('media', '00000000-0000-0000-0000-00000000aaaa/pets/00000000-0000-0000-0000-000000000a01/photo.jpg')
$$, 'client uploads a photo under their own pet path');

select throws_ok($$
  insert into storage.objects (bucket_id, name)
  values ('media', '00000000-0000-0000-0000-00000000aaaa/pets/00000000-0000-0000-0000-000000000a02/photo.jpg')
$$, '42501', null, 'client cannot upload under another client''s pet path');

select throws_ok($$
  insert into storage.objects (bucket_id, name)
  values ('media', '00000000-0000-0000-0000-00000000bbbb/pets/00000000-0000-0000-0000-000000000a01/photo.jpg')
$$, '42501', null, 'a spoofed business prefix is denied');

select is((select count(*) from storage.objects where bucket_id = 'media')::int, 1,
  'client reads exactly their own pet objects');

select lives_ok($$
  update storage.objects set user_metadata = '{"note":"replaced"}'::jsonb
  where bucket_id = 'media'
    and name = '00000000-0000-0000-0000-00000000aaaa/pets/00000000-0000-0000-0000-000000000a01/photo.jpg'
$$, 'client can replace (upsert) their own pet photo object');

-- ===== other client and unlinked user: zero objects =====
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000032","role":"authenticated"}';
select is((select count(*) from storage.objects where bucket_id = 'media')::int, 0,
  'the other client sees zero of c1''s objects');

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000033","role":"authenticated"}';
select is((select count(*) from storage.objects where bucket_id = 'media')::int, 0,
  'an unlinked user sees zero media objects');

-- ===== owner storage writes still work beside the client policies =====
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000021","role":"authenticated"}';
select lives_ok($$
  insert into storage.objects (bucket_id, name)
  values ('media', '00000000-0000-0000-0000-00000000aaaa/pets/00000000-0000-0000-0000-000000000a01/photo2.jpg')
$$, 'owner writes still work beside the client policy');

-- ===== anon: no execute =====
set local role anon;

select throws_ok(
  $$ select set_client_access_self('00000000-0000-0000-0000-0000000000c1',
       '0000', null, null, null, null, null) $$,
  '42501', null, 'anon cannot execute the self access functions');

-- ===== grants + audit totals (superuser) =====
reset role;
set local request.jwt.claims to '{}';

select is(
  (select bool_and(has_function_privilege('authenticated', f, 'execute'))
     from unnest(array[
       'public.set_client_access_self(uuid, text, text, text, text, text, text)',
       'public.reveal_client_access_self(uuid)',
       'public.has_client_access_self(uuid)']) f),
  true, 'authenticated can execute all three self RPCs');

select is(
  (select bool_or(has_function_privilege('anon', f, 'execute'))
     from unnest(array[
       'public.set_client_access_self(uuid, text, text, text, text, text, text)',
       'public.reveal_client_access_self(uuid)',
       'public.has_client_access_self(uuid)']) f),
  false, 'anon can execute none of them');

select is((select count(*) from audit_log where action = 'client_access.self_set')::int, 2,
  'each self set writes its own audit row; denials write none');

select is((select count(*) from audit_log where action = 'client_access.self_reveal')::int, 3,
  'each self reveal writes its own audit row; denials write none');

select is((select count(*) from audit_log where action like 'access.%')::int, 2,
  'owner audit actions stay distinguishable from the self actions');

select * from finish();
rollback;
