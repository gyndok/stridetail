begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

-- Plan 8 Task 3 — invite-your-client + claim linking suite.
-- Both RPCs are security definer keyed on auth.uid(), so the blocks run as
-- superuser with request.jwt.claims only (012/015 pattern); grant checks flip
-- to `set local role anon` like 015.

-- ===== fixtures =====
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000041', 'owner-a16@test.dev'),
  ('00000000-0000-0000-0000-000000000042', 'walker-a16@test.dev'),
  ('00000000-0000-0000-0000-000000000043', 'owner-b16@test.dev'),
  ('00000000-0000-0000-0000-000000000044', 'pet.parent16@test.dev'),
  ('00000000-0000-0000-0000-000000000045', 'stranger16@test.dev');

insert into businesses (id, name, slug, time_zone) values
  ('00000000-0000-0000-0000-0000000000a6', 'Paw & Whisker 016', 'paw-whisker-016', 'America/Chicago'),
  ('00000000-0000-0000-0000-0000000000b6', 'Other Dogs Co 016', 'other-dogs-016', 'America/New_York');

insert into memberships (business_id, user_id, role, status) values
  ('00000000-0000-0000-0000-0000000000a6', '00000000-0000-0000-0000-000000000041', 'owner', 'active'),
  ('00000000-0000-0000-0000-0000000000a6', '00000000-0000-0000-0000-000000000042', 'walker', 'active'),
  ('00000000-0000-0000-0000-0000000000b6', '00000000-0000-0000-0000-000000000043', 'owner', 'active');

-- cA1: invitable (email deliberately mixed-case + padded — claim must match it
-- case/space-insensitively while the queued notification keeps the raw value).
-- cA2: no email (invite must refuse). cA3: same email as cA1 but NEVER invited
-- (claim must skip it). cB1: same parent email in the other business (invited
-- there too -> cross-business claim links both).
insert into clients (id, business_id, name, email) values
  ('00000000-0000-0000-0000-000000000c01', '00000000-0000-0000-0000-0000000000a6', 'Pat Parent',   ' Pet.Parent16@Test.dev '),
  ('00000000-0000-0000-0000-000000000c02', '00000000-0000-0000-0000-0000000000a6', 'No Email Ned', null),
  ('00000000-0000-0000-0000-000000000c03', '00000000-0000-0000-0000-0000000000a6', 'Uninvited Twin', 'pet.parent16@test.dev'),
  ('00000000-0000-0000-0000-000000000c04', '00000000-0000-0000-0000-0000000000b6', 'Pat Parent B', 'pet.parent16@test.dev');

-- ===== invite_client_to_portal =====
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000042","role":"authenticated"}';
select throws_ok($$
  select public.invite_client_to_portal('00000000-0000-0000-0000-000000000c01')
$$, 'P0001', 'only the business owner can invite clients to the portal',
  'a walker cannot invite a client to the portal');

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000043","role":"authenticated"}';
select throws_ok($$
  select public.invite_client_to_portal('00000000-0000-0000-0000-000000000c01')
$$, 'P0001', 'only the business owner can invite clients to the portal',
  'the owner of another business cannot invite this client');

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000041","role":"authenticated"}';
select throws_ok($$
  select public.invite_client_to_portal('00000000-0000-0000-0000-000000000c02')
$$, 'P0001', 'client has no email on file — add one before inviting',
  'inviting a client without an email fails with a clear message');

select lives_ok($$
  select public.invite_client_to_portal('00000000-0000-0000-0000-000000000c01')
$$, 'the owner invites their emailed client');

select ok((select portal_invited_at is not null
             from clients where id = '00000000-0000-0000-0000-000000000c01'),
  'the invite stamps portal_invited_at');

select is((select count(*)::int from notifications
            where template = 'client_invite'
              and business_id = '00000000-0000-0000-0000-0000000000a6'), 1,
  'exactly one client_invite email is queued');

select ok((select channel = 'email'
             and "to" = ' Pet.Parent16@Test.dev '
             and status = 'queued'
             and payload->>'clientId' = '00000000-0000-0000-0000-000000000c01'
             and payload->>'businessName' = 'Paw & Whisker 016'
             and payload->>'portalUrl' = 'https://stridetail.app/portal-login'
            from notifications where template = 'client_invite'
             and business_id = '00000000-0000-0000-0000-0000000000a6'),
  'the queued invite carries channel/to/clientId/businessName/portalUrl');

select is((select count(*)::int from audit_log
            where action = 'client.portal_invite'
              and entity = 'client'
              and entity_id = '00000000-0000-0000-0000-000000000c01'
              and actor_user_id = '00000000-0000-0000-0000-000000000041'), 1,
  'the invite writes an audit row');

select lives_ok($$
  select public.invite_client_to_portal('00000000-0000-0000-0000-000000000c01')
$$, 're-inviting the same client is allowed');

select is((select count(*)::int from notifications
            where template = 'client_invite'
              and business_id = '00000000-0000-0000-0000-0000000000a6'), 2,
  'the re-invite queues a second email');

-- Business B invites the same parent email — cross-business setup for claim.
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000043","role":"authenticated"}';
select lives_ok($$
  select public.invite_client_to_portal('00000000-0000-0000-0000-000000000c04')
$$, 'the other business invites the same email for its own client');

-- ===== claim_client_links =====
set local request.jwt.claims to '{}';
select throws_ok($$
  select public.claim_client_links()
$$, 'P0001', 'not signed in',
  'claim without an authenticated user is refused');

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000045","role":"authenticated"}';
select is((select (public.claim_client_links())->>'linked'), '0',
  'a stranger whose email matches no invited client links nothing');

select is((select count(*)::int from client_users
            where user_id = '00000000-0000-0000-0000-000000000045'), 0,
  'no client_users rows appear for the stranger');

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000044","role":"authenticated"}';
select is((select (public.claim_client_links())->>'linked'), '2',
  'the invited parent links both businesses in one claim (case/space-insensitive email match)');

select is((select array_agg(client_id order by client_id) from client_users
            where user_id = '00000000-0000-0000-0000-000000000044'),
  array['00000000-0000-0000-0000-000000000c01',
        '00000000-0000-0000-0000-000000000c04']::uuid[],
  'exactly the two INVITED clients are linked — cross-business, both rows');

select is((select count(*)::int from client_users
            where client_id = '00000000-0000-0000-0000-000000000c03'), 0,
  'the uninvited email-matching client is NOT linked');

select ok((select bool_and(linked_via = 'invite') from client_users
            where user_id = '00000000-0000-0000-0000-000000000044'),
  'v1 links record linked_via = invite (portal_invited_at is required)');

select is((select count(*)::int from audit_log
            where action = 'client_user.link'
              and actor_user_id = '00000000-0000-0000-0000-000000000044'), 2,
  'one client_user.link audit row per created link');

select is((select (public.claim_client_links())->>'linked'), '0',
  'a second claim is idempotent — nothing new to link');

select is((select count(*)::int from client_users
            where user_id = '00000000-0000-0000-0000-000000000044'), 2,
  'the idempotent re-claim leaves exactly the two rows');

-- ===== grants =====
set local role anon;

select throws_ok($$
  select public.invite_client_to_portal('00000000-0000-0000-0000-000000000c01')
$$, '42501', null, 'anon has no execute on invite_client_to_portal');

reset role;
set local request.jwt.claims to '{}';

select is(
  (select bool_and(has_function_privilege('authenticated', f, 'execute'))
     from unnest(array[
       'public.invite_client_to_portal(uuid)',
       'public.claim_client_links()']) f),
  true, 'authenticated can execute both linking RPCs');

select is(
  (select bool_or(has_function_privilege('anon', f, 'execute'))
     from unnest(array[
       'public.invite_client_to_portal(uuid)',
       'public.claim_client_links()']) f),
  false, 'anon can execute neither linking RPC');

select * from finish();
rollback;
