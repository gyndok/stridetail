begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

-- fixtures: owner A + walker in business A, owner B in business B. Fixed uuids so
-- cross-business RLS failures can target real rows without selectable subqueries.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000011', 'owner-a@test.dev'),
  ('00000000-0000-0000-0000-000000000012', 'walker-a@test.dev'),
  ('00000000-0000-0000-0000-000000000014', 'owner-b@test.dev');

insert into businesses (id, name, slug, time_zone) values
  ('00000000-0000-0000-0000-00000000aaaa', 'Paw & Whisker', 'paw-whisker-002', 'America/Chicago'),
  ('00000000-0000-0000-0000-00000000bbbb', 'Other Dogs Co', 'other-dogs-002', 'America/New_York');

insert into memberships (business_id, user_id, role, status) values
  ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-000000000011', 'owner', 'active'),
  ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-000000000012', 'walker', 'active'),
  ('00000000-0000-0000-0000-00000000bbbb', '00000000-0000-0000-0000-000000000014', 'owner', 'active');

-- ===== owner A: full CRUD on own business =====
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000011","role":"authenticated"}';

select lives_ok($$
  insert into clients (id, business_id, name, phones, email, address, notes_md)
  values ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000aaaa',
          'Dana Harper', array['+15550001111'], 'dana@test.dev', '100 Main St, Houston, TX', 'gate sticks')
$$, 'owner can insert client');

select is((select count(*) from clients)::int, 1, 'owner sees own client');

select lives_ok($$
  update clients set mg_completed_at = now()
  where id = '00000000-0000-0000-0000-0000000000c1'
$$, 'owner can update client');

select lives_ok($$
  insert into pets (id, client_id, business_id, name, species, breed, reactivity_md)
  values ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000c1',
          '00000000-0000-0000-0000-00000000aaaa', 'Biscuit', 'dog', 'corgi', 'lunges at bikes')
$$, 'owner can insert pet');

select lives_ok($$
  insert into pet_documents (pet_id, business_id, type, storage_path, expires_on)
  values ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-00000000aaaa',
          'rabies', '00000000-0000-0000-0000-00000000aaaa/pets/00000000-0000-0000-0000-0000000000d1/docs/rabies.pdf',
          current_date + 200)
$$, 'owner can insert pet document');

-- seed audit rows (definer-function / service-role path) as table owner
reset role;
insert into audit_log (business_id, actor_user_id, action, entity, entity_id) values
  ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-000000000011',
   'access.reveal_owner', 'client', '00000000-0000-0000-0000-0000000000c1'),
  ('00000000-0000-0000-0000-00000000bbbb', '00000000-0000-0000-0000-000000000014',
   'access.set', 'client', null);

-- ===== walker of business A: no client visibility until visits (plan 3) =====
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000012","role":"authenticated"}';

select is((select count(*) from clients)::int, 0, 'walker of business A cannot read its clients (no visit path yet)');
select is((select count(*) from pets)::int, 0, 'walker cannot read pets');
select is((select count(*) from pet_documents)::int, 0, 'walker cannot read pet documents');

select throws_ok($$
  insert into clients (business_id, name)
  values ('00000000-0000-0000-0000-00000000aaaa', 'Sneaky Add')
$$, '42501', null, 'walker cannot insert a client');

select is((select count(*) from audit_log)::int, 0, 'walker sees no audit rows');

-- ===== owner B: cross-business isolation =====
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000014","role":"authenticated"}';

select is((select count(*) from clients)::int, 0, 'cross-business: owner B sees zero clients of business A');

select throws_ok($$
  insert into clients (business_id, name)
  values ('00000000-0000-0000-0000-00000000aaaa', 'Wrong Tenant')
$$, '42501', null, 'owner B cannot insert into business A');

select is((select count(*) from audit_log)::int, 1, 'owner B reads only own-business audit rows');

-- ===== owner A: audit log is read-only for authenticated; delete cascades =====
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000011","role":"authenticated"}';

select is((select count(*) from audit_log)::int, 1, 'owner A reads own-business audit row');

select throws_ok($$
  insert into audit_log (business_id, actor_user_id, action)
  values ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-000000000011', 'sneaky')
$$, '42501', null, 'authenticated cannot insert into audit_log');

select lives_ok($$
  delete from clients where id = '00000000-0000-0000-0000-0000000000c1'
$$, 'owner can delete client');

reset role;
select is((select count(*) from pets)::int, 0, 'pets cascade with client delete');
select is((select count(*) from pet_documents)::int, 0, 'pet documents cascade with pet delete');

select * from finish();
rollback;
