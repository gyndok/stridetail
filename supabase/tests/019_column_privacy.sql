begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

-- 2026-08-29 security: staff-private columns must not be readable by linked
-- portal clients, and anon must hold zero table grants. Catalog assertions plus
-- a functional block proving a linked client is denied the visits columns and
-- sees no rows in the staff-only visit_private_fields view.

-- ===== column-privilege catalog checks (the four exposed columns) =====
select ok(not has_column_privilege('authenticated', 'public.visits', 'owner_notes_md', 'SELECT'),
  'authenticated has no SELECT on visits.owner_notes_md');
select ok(not has_column_privilege('authenticated', 'public.visits', 'decline_reason', 'SELECT'),
  'authenticated has no SELECT on visits.decline_reason');
select ok(not has_column_privilege('authenticated', 'public.visit_reports', 'private_notes_md', 'SELECT'),
  'authenticated has no SELECT on visit_reports.private_notes_md');

-- kept columns still readable (owner/walker read paths must keep working)
select ok(has_column_privilege('authenticated', 'public.visits', 'status', 'SELECT'),
  'visits.status stays readable');
select ok(has_column_privilege('authenticated', 'public.visits', 'scheduled_start', 'SELECT'),
  'visits.scheduled_start stays readable');
select ok(has_column_privilege('authenticated', 'public.visit_reports', 'summary', 'SELECT'),
  'visit_reports.summary stays readable');

-- clients.notes_md: the client's row policy is gone, so the whole clients row is
-- out of the portal's reach (the portal never reads clients directly anyway).
select is((select count(*)::int from pg_policies
            where schemaname = 'public' and tablename = 'clients'
              and policyname = 'client reads own client row'), 0,
  'the client SELECT policy on clients is removed');

-- ===== visit_private_fields view: staff-only, service_role/anon locked out ====
select ok(has_table_privilege('authenticated', 'public.visit_private_fields', 'SELECT'),
  'authenticated may SELECT the staff view (row filter does the gating)');
select ok(not has_table_privilege('anon', 'public.visit_private_fields', 'SELECT'),
  'anon may not SELECT the staff view');

-- ===== anon holds zero table grants in schema public (CI-red root cause) =====
select is((select count(*)::int from information_schema.role_table_grants
            where grantee = 'anon' and table_schema = 'public'), 0,
  'anon holds no table privileges anywhere in schema public');

-- ===== functional: a linked client is denied, staff are served =====
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000191', 'owner19@test.dev'),
  ('00000000-0000-0000-0000-000000000192', 'walker19@test.dev'),
  ('00000000-0000-0000-0000-000000000193', 'client19@test.dev');
insert into businesses (id, name, slug, time_zone) values
  ('00000000-0000-0000-0000-00000019aaaa', 'Paw 019', 'paw-019', 'America/Chicago');
insert into memberships (business_id, user_id, role, status) values
  ('00000000-0000-0000-0000-00000019aaaa', '00000000-0000-0000-0000-000000000191', 'owner', 'active'),
  ('00000000-0000-0000-0000-00000019aaaa', '00000000-0000-0000-0000-000000000192', 'walker', 'active');
insert into clients (id, business_id, name, email, notes_md) values
  ('00000000-0000-0000-0000-0000000019c1', '00000000-0000-0000-0000-00000019aaaa',
   'Casey Client', 'client19@test.dev', 'PRIVATE: owner notes about Casey');
insert into client_users (business_id, client_id, user_id, linked_via) values
  ('00000000-0000-0000-0000-00000019aaaa', '00000000-0000-0000-0000-0000000019c1',
   '00000000-0000-0000-0000-000000000193', 'invite');
insert into services (id, business_id, name, kind, base_price_cents, duration_min) values
  ('00000000-0000-0000-0000-000000190051', '00000000-0000-0000-0000-00000019aaaa',
   'Walk', 'walk', 2500, 30);
insert into visits (id, business_id, client_id, service_id, walker_id, pet_ids,
                    scheduled_start, scheduled_end, business_tz, status,
                    owner_notes_md, decline_reason) values
  ('00000000-0000-0000-0000-000000190071', '00000000-0000-0000-0000-00000019aaaa',
   '00000000-0000-0000-0000-0000000019c1', '00000000-0000-0000-0000-000000190051',
   '00000000-0000-0000-0000-000000000192', '{}',
   '2026-09-01T14:00:00Z', '2026-09-01T14:30:00Z', 'America/Chicago', 'completed',
   'PRIVATE owner note', 'PRIVATE decline reason');

-- linked client 193: can see their visit ROW (child policies depend on it) but
-- is DENIED the two private columns, and the staff view returns them nothing.
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000193","role":"authenticated"}';

select is((select count(*)::int from visits where id = '00000000-0000-0000-0000-000000190071'), 1,
  'the linked client still sees their own visit row (safe columns)');
select throws_ok($$
  select owner_notes_md from public.visits where id = '00000000-0000-0000-0000-000000190071'
$$, '42501', null, 'the linked client is denied visits.owner_notes_md (42501)');
select throws_ok($$
  select decline_reason from public.visits where id = '00000000-0000-0000-0000-000000190071'
$$, '42501', null, 'the linked client is denied visits.decline_reason (42501)');
select is((select count(*)::int from public.visit_private_fields
            where visit_id = '00000000-0000-0000-0000-000000190071'), 0,
  'the staff view returns no rows to a client (not a member)');
select is((select count(*)::int from clients where id = '00000000-0000-0000-0000-0000000019c1'), 0,
  'the linked client can no longer read their clients row at all');

-- owner 191: served the private fields via the staff view
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000191","role":"authenticated"}';
select is((select owner_notes_md from public.visit_private_fields
            where visit_id = '00000000-0000-0000-0000-000000190071'),
  'PRIVATE owner note', 'the owner reads owner_notes_md through the staff view');
select is((select decline_reason from public.visit_private_fields
            where visit_id = '00000000-0000-0000-0000-000000190071'),
  'PRIVATE decline reason', 'the owner reads decline_reason through the staff view');

-- walker 192: sees the private fields for their OWN assigned visit
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000192","role":"authenticated"}';
select is((select count(*)::int from public.visit_private_fields
            where visit_id = '00000000-0000-0000-0000-000000190071'), 1,
  'the assigned walker sees the private fields for their visit');

reset role;
set local request.jwt.claims to '{}';

select * from finish();
rollback;
