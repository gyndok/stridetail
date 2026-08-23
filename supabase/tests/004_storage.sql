begin;
create extension if not exists pgtap with schema extensions;
select plan(21);

-- fixtures: owner A + walker in business A, owner B in business B (same shape as 002/003).
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000011', 'owner-a@test.dev'),
  ('00000000-0000-0000-0000-000000000012', 'walker-a@test.dev'),
  ('00000000-0000-0000-0000-000000000014', 'owner-b@test.dev');

insert into businesses (id, name, slug, time_zone) values
  ('00000000-0000-0000-0000-00000000aaaa', 'Paw & Whisker', 'paw-whisker-004', 'America/Chicago'),
  ('00000000-0000-0000-0000-00000000bbbb', 'Other Dogs Co', 'other-dogs-004', 'America/New_York');

insert into memberships (business_id, user_id, role, status) values
  ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-000000000011', 'owner', 'active'),
  ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-000000000012', 'walker', 'active'),
  ('00000000-0000-0000-0000-00000000bbbb', '00000000-0000-0000-0000-000000000014', 'owner', 'active');

-- This stack's storage image adds a statement-level BEFORE DELETE trigger
-- (storage.protect_delete) that rejects any direct delete unless the GUC below is set —
-- the Storage API sets it for its own deletes. Setting it here lets the delete policies
-- be exercised under RLS exactly as the API would.
set local "storage.allow_delete_query" to 'true';

-- ===== bucket exists and is private (checked as superuser: storage.buckets has RLS
-- enabled with no policies, so authenticated would see zero rows) =====
select is((select public from storage.buckets where id = 'media'), false,
  'media bucket exists and is private');
select is((select count(*) from storage.buckets where id = 'media')::int, 1,
  'exactly one media bucket row (idempotent insert)');

-- ===== path helper parses safely (null, never a 22P02 cast error) =====
select is(public.storage_business_id('00000000-0000-0000-0000-00000000aaaa/pets/p1/photo.jpg'),
  '00000000-0000-0000-0000-00000000aaaa'::uuid, 'helper parses the business-id prefix');
select is(public.storage_business_id('not-a-uuid/file.jpg'), null::uuid,
  'helper returns null for a non-uuid prefix');
select is(public.storage_business_id('------------------------------------/file.jpg'), null::uuid,
  'helper returns null for a 36-hyphen prefix (invalid-cast trap)');

-- ===== owner A: insert under own business prefix; bad paths denied, not erroring =====
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000011","role":"authenticated"}';

select lives_ok($$
  insert into storage.objects (bucket_id, name)
  values ('media', '00000000-0000-0000-0000-00000000aaaa/pets/p1/photo.jpg')
$$, 'owner can insert an object under own business prefix');

select is((select count(*) from storage.objects where bucket_id = 'media')::int, 1,
  'owner sees own-business object');

select throws_ok($$
  insert into storage.objects (bucket_id, name)
  values ('media', '00000000-0000-0000-0000-00000000bbbb/sneak.jpg')
$$, '42501', null, 'owner A cannot insert under business B prefix');

select throws_ok($$
  insert into storage.objects (bucket_id, name)
  values ('media', 'not-a-uuid/file.jpg')
$$, '42501', null, 'non-uuid prefix is denied by policy, not an invalid-uuid error');

select throws_ok($$
  insert into storage.objects (bucket_id, name)
  values ('media', '------------------------------------/file.jpg')
$$, '42501', null, '36-hyphen prefix is denied by policy, not a cast error');

-- ===== walker of business A: member read, no writes =====
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000012","role":"authenticated"}';

select is((select count(*) from storage.objects where bucket_id = 'media')::int, 1,
  'walker (member) can read own-business object');

select throws_ok($$
  insert into storage.objects (bucket_id, name)
  values ('media', '00000000-0000-0000-0000-00000000aaaa/walker.jpg')
$$, '42501', null, 'walker cannot insert into own-business prefix');

select lives_ok($$
  delete from storage.objects where bucket_id = 'media'
$$, 'walker delete runs without error (RLS filters, no matched rows)');
select is((select count(*) from storage.objects where bucket_id = 'media')::int, 1,
  'object survives walker delete: zero rows matched');

-- ===== owner B: cross-business isolation =====
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000014","role":"authenticated"}';

select is((select count(*) from storage.objects where bucket_id = 'media')::int, 0,
  'cross-business: owner B sees zero objects of business A');

select lives_ok($$
  delete from storage.objects where bucket_id = 'media'
$$, 'cross-business delete runs without error');

reset role;
select is((select count(*) from storage.objects where bucket_id = 'media')::int, 1,
  'object survives cross-business delete (checked as superuser)');

-- ===== owner A: update and delete of own object =====
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000011","role":"authenticated"}';

select lives_ok($$
  update storage.objects set user_metadata = '{"note":"updated"}'::jsonb
  where bucket_id = 'media'
$$, 'owner can update own-business object');

select is((select user_metadata->>'note' from storage.objects where bucket_id = 'media'), 'updated',
  'owner update actually landed on the row');

select lives_ok($$
  delete from storage.objects where bucket_id = 'media'
$$, 'owner can delete own-business object');

reset role;
select is((select count(*) from storage.objects where bucket_id = 'media')::int, 0,
  'owner delete removed the object (checked as superuser)');
select * from finish();
rollback;
