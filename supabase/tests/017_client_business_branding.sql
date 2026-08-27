begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

-- Plan 8 Task 4 — "client reads linked businesses": a linked client reads the
-- branding row of exactly the businesses they are linked to; strangers and
-- anon read nothing new; staff visibility is unchanged (015/011 pattern).

-- ===== fixtures =====
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000121', 'owner-a-017@test.dev'),
  ('00000000-0000-0000-0000-000000000131', 'client-one-017@test.dev'),
  ('00000000-0000-0000-0000-000000000133', 'stranger-017@test.dev');

insert into businesses (id, name, slug, time_zone, brand_color) values
  ('00000000-0000-0000-0000-000000017aaa', 'Paw & Whisker 017', 'paw-whisker-017', 'America/Chicago', '#336699'),
  ('00000000-0000-0000-0000-000000017bbb', 'Other Dogs 017', 'other-dogs-017', 'America/New_York', '#E8642C');

insert into memberships (business_id, user_id, role, status) values
  ('00000000-0000-0000-0000-000000017aaa', '00000000-0000-0000-0000-000000000121', 'owner', 'active');

insert into clients (id, business_id, name, email) values
  ('00000000-0000-0000-0000-0000000017c1', '00000000-0000-0000-0000-000000017aaa',
   'Dana Harper 017', 'client-one-017@test.dev');

insert into client_users (business_id, client_id, user_id, linked_via) values
  ('00000000-0000-0000-0000-000000017aaa', '00000000-0000-0000-0000-0000000017c1',
   '00000000-0000-0000-0000-000000000131', 'invite');

-- ===== linked client =====
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000131","role":"authenticated"}';

select results_eq(
  $$select name, brand_color from businesses where id = '00000000-0000-0000-0000-000000017aaa'$$,
  $$values ('Paw & Whisker 017'::text, '#336699'::text)$$,
  'linked client reads their business name and brand_color');

select is(
  (select count(*) from businesses where id = '00000000-0000-0000-0000-000000017bbb'),
  0::bigint,
  'linked client cannot read an unlinked business');

-- ===== stranger (authenticated, no links, no memberships) =====
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000133","role":"authenticated"}';

select is(
  (select count(*) from businesses where id in
    ('00000000-0000-0000-0000-000000017aaa', '00000000-0000-0000-0000-000000017bbb')),
  0::bigint,
  'an unlinked authenticated user reads no businesses');

-- ===== owner unchanged =====
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000121","role":"authenticated"}';

select is(
  (select count(*) from businesses where id = '00000000-0000-0000-0000-000000017aaa'),
  1::bigint,
  'owner still reads their own business');

select is(
  (select count(*) from businesses where id = '00000000-0000-0000-0000-000000017bbb'),
  0::bigint,
  'owner still cannot read a foreign business');

-- ===== anon =====
-- anon has no select GRANT on businesses at all — stronger than zero rows.
set local role anon;
set local request.jwt.claims to '{}';

select throws_ok(
  $$select count(*) from businesses$$,
  '42501',
  'permission denied for table businesses',
  'anon has no select grant on businesses at all');

select * from finish();
rollback;
