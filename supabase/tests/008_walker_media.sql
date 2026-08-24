begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

-- fixtures: owner A + two walkers in business A, owner B in business B (004/007 style).
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000031', 'owner-a@test.dev'),
  ('00000000-0000-0000-0000-000000000032', 'walker-a1@test.dev'),
  ('00000000-0000-0000-0000-000000000033', 'walker-a2@test.dev'),
  ('00000000-0000-0000-0000-000000000034', 'owner-b@test.dev');

insert into businesses (id, name, slug, time_zone) values
  ('00000000-0000-0000-0000-00000000aaaa', 'Paw & Whisker', 'paw-whisker-008', 'America/Chicago'),
  ('00000000-0000-0000-0000-00000000bbbb', 'Other Dogs Co', 'other-dogs-008', 'America/New_York');

insert into memberships (business_id, user_id, role, status) values
  ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-000000000031', 'owner', 'active'),
  ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-000000000032', 'walker', 'active'),
  ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-000000000033', 'walker', 'active'),
  ('00000000-0000-0000-0000-00000000bbbb', '00000000-0000-0000-0000-000000000034', 'owner', 'active');

insert into clients (id, business_id, name, phones) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000aaaa', 'Dana Harper', '{+15550001111}');

insert into services (id, business_id, name, kind, base_price_cents, extra_pet_price_cents, duration_min, requires_gps) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-00000000aaaa', 'Walk', 'walk', 2500, 500, 30, true);

-- g1: in_progress, walker A1 (the upload path); g2: accepted, walker A1 (not running);
-- fixture inserts take any status directly: the transition guard is an UPDATE trigger.
insert into visits (id, business_id, client_id, service_id, walker_id, pet_ids,
                    scheduled_start, scheduled_end, business_tz, status, price_cents_snapshot, started_at) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000aaaa',
   '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000e1',
   '00000000-0000-0000-0000-000000000032', '{}',
   '2026-09-01 14:00+00', '2026-09-01 14:30+00', 'America/Chicago', 'in_progress', 2500, now()),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-00000000aaaa',
   '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000e1',
   '00000000-0000-0000-0000-000000000032', '{}',
   '2026-09-02 14:00+00', '2026-09-02 14:30+00', 'America/Chicago', 'accepted', 2500, null);

-- ===== helper parses safely (null, never a 22P02 cast error) =====
select is(public.storage_second_uuid(
  '00000000-0000-0000-0000-00000000aaaa/00000000-0000-0000-0000-0000000000a1/photo.jpg'),
  '00000000-0000-0000-0000-0000000000a1'::uuid,
  'helper parses the visit-id second segment');
select is(public.storage_second_uuid('00000000-0000-0000-0000-00000000aaaa/pets/p1/photo.jpg'),
  null::uuid, 'helper returns null when the second segment is not a uuid');
select is(public.storage_second_uuid('not-a-uuid/00000000-0000-0000-0000-0000000000a1/x.jpg'),
  null::uuid, 'helper returns null when the first segment is not a uuid');
select is(public.storage_second_uuid(
  '00000000-0000-0000-0000-00000000aaaa/------------------------------------/x.jpg'),
  null::uuid, 'helper returns null for a 36-hyphen second segment (invalid-cast trap)');

-- ===== walker A1: insert under own in_progress visit prefix =====
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000032","role":"authenticated"}';

select lives_ok($$
  insert into storage.objects (bucket_id, name)
  values ('media', '00000000-0000-0000-0000-00000000aaaa/00000000-0000-0000-0000-0000000000a1/00000000-0000-0000-0000-00000000ff01.jpg')
$$, 'walker can insert a photo under their own in_progress visit prefix');

select is((select count(*) from storage.objects where bucket_id = 'media')::int, 1,
  'walker reads the uploaded object back (member read covers walkers)');

-- not-in-progress visit: denied
select throws_ok($$
  insert into storage.objects (bucket_id, name)
  values ('media', '00000000-0000-0000-0000-00000000aaaa/00000000-0000-0000-0000-0000000000a2/00000000-0000-0000-0000-00000000ff02.jpg')
$$, '42501', null, 'walker cannot upload under their own visit while it is not in_progress');

-- wrong business prefix: the visit is real and theirs, but the tenant segment lies
select throws_ok($$
  insert into storage.objects (bucket_id, name)
  values ('media', '00000000-0000-0000-0000-00000000bbbb/00000000-0000-0000-0000-0000000000a1/00000000-0000-0000-0000-00000000ff03.jpg')
$$, '42501', null, 'wrong business prefix is denied even for the visit''s own walker');

-- non-uuid second segment: policy denial, not a cast error
select throws_ok($$
  insert into storage.objects (bucket_id, name)
  values ('media', '00000000-0000-0000-0000-00000000aaaa/pets/sneak.jpg')
$$, '42501', null, 'non-uuid second segment is denied by policy, not an invalid-cast error');

-- ===== walker A2: not the visit's walker =====
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000033","role":"authenticated"}';

select throws_ok($$
  insert into storage.objects (bucket_id, name)
  values ('media', '00000000-0000-0000-0000-00000000aaaa/00000000-0000-0000-0000-0000000000a1/00000000-0000-0000-0000-00000000ff04.jpg')
$$, '42501', null, 'another walker cannot upload under someone else''s visit');

-- Plan-2 member read is business-wide by design: teammates can read the object.
select is((select count(*) from storage.objects where bucket_id = 'media')::int, 1,
  'another member of the business can read the object (Plan-2 member read, unchanged)');

-- ===== owner A reads; walker writes beyond insert stay denied =====
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000031","role":"authenticated"}';

select is((select count(*) from storage.objects where bucket_id = 'media')::int, 1,
  'owner reads the walker-uploaded object');

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000032","role":"authenticated"}';

-- RLS filters (no matched rows) rather than erroring on update — the 004 delete pattern.
select lives_ok($$
  update storage.objects set user_metadata = '{"note":"edit"}'::jsonb
  where bucket_id = 'media'
$$, 'walker update runs without error (RLS filters, no matched rows)');

reset role;
select is((select count(*) from storage.objects
           where bucket_id = 'media' and user_metadata->>'note' = 'edit')::int, 0,
  'walker update matched zero rows (update stays owner-only)');
set local role authenticated;

-- ===== owner B: cross-business isolation =====
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000034","role":"authenticated"}';

select is((select count(*) from storage.objects where bucket_id = 'media')::int, 0,
  'cross-business: owner B sees zero objects of business A');

select * from finish();
rollback;
