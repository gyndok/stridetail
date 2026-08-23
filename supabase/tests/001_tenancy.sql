begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

-- four users: two owners, one walker, one outsider
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'owner@test.dev'),
  ('00000000-0000-0000-0000-000000000002', 'walker@test.dev'),
  ('00000000-0000-0000-0000-000000000003', 'outsider@test.dev'),
  ('00000000-0000-0000-0000-000000000004', 'owner2@test.dev');

select is((select count(*) from profiles where user_id in ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000004'))::int, 4, 'profile row created per auth user');

-- owner creates a business via RPC
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}';
select lives_ok($$ select create_business('Paw & Whisker', 'America/Chicago', '#E8642C') $$, 'owner can create business');
select is((select count(*) from businesses)::int, 1, 'owner sees own business');
select is((select count(*) from services)::int, 8, 'services are seeded');
select is((select role from memberships where user_id = '00000000-0000-0000-0000-000000000001'), 'owner', 'creator is owner');

-- owner invites walker by email
select lives_ok($$ select create_invite((select id from businesses limit 1), 'walker', null, 'walker@test.dev') $$, 'owner can invite');
select create_invite((select id from businesses limit 1), 'walker', null, 'walker2@test.dev');

-- a second owner creates a second business (cross-business isolation)
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000004","role":"authenticated"}';
select lives_ok($$ select create_business('Other Dogs Co', 'America/New_York', null) $$, 'second owner can create business');
select is((select count(*) from businesses)::int, 1, 'second owner sees only own business');
select is((select count(*) from services where business_id in (select id from businesses where slug = 'paw-whisker'))::int, 0, 'cross-business: second owner sees zero rows of first business services');

-- outsider sees nothing
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000003","role":"authenticated"}';
select is((select count(*) from businesses)::int, 0, 'outsider sees no business');
select is((select count(*) from services)::int, 0, 'outsider sees no services');

-- invited walker sees nothing until active
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}';
select is((select count(*) from businesses)::int, 0, 'invited-but-inactive walker sees no business');

-- activate and check walker cannot see prices
reset role;
update memberships set user_id = '00000000-0000-0000-0000-000000000002', status = 'active' where invited_email = 'walker@test.dev';
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}';
-- RLS denies silently: the walker gets zero rows from the priced table but sees the price-free view
select is((select count(*) from services)::int, 0, 'walker cannot read priced services table');
select is((select count(*) from services_public)::int, 8, 'walker sees price-free services view');
-- profiles: own + teammates in active businesses (owner + self), not the outsider or the second owner
select is((select count(*) from profiles)::int, 2, 'walker reads only teammate profiles');

-- service role accepts the second invite on behalf of the outsider (edge function path)
reset role;
select lives_ok($$ select accept_invite((select invite_token from memberships where invited_email = 'walker2@test.dev'), '00000000-0000-0000-0000-000000000003') $$, 'service role accepts invite');
select is((select status::text from memberships where user_id = '00000000-0000-0000-0000-000000000003'), 'active', 'accepted membership is active');

select * from finish();
rollback;
