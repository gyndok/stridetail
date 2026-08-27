begin;
create extension if not exists pgtap with schema extensions;
select plan(91);

-- Plan 8 Task 1 — client portal suite: client_users links, booking_requests
-- machine + RPCs, and the client read scope. RLS blocks run as `authenticated`
-- with request.jwt.claims driving the actor (011 pattern); the RPC/trigger
-- blocks run as superuser with claims only (012 pattern — definer functions
-- bypass RLS, so the is_owner guards keyed on auth.uid() are what is tested).

-- ===== fixtures =====
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000021', 'owner-a@test.dev'),
  ('00000000-0000-0000-0000-000000000022', 'walker-a1@test.dev'),
  ('00000000-0000-0000-0000-000000000024', 'owner-b@test.dev'),
  ('00000000-0000-0000-0000-000000000031', 'client-one@test.dev'),
  ('00000000-0000-0000-0000-000000000032', 'client-two@test.dev'),
  ('00000000-0000-0000-0000-000000000033', 'stranger@test.dev');

insert into businesses (id, name, slug, time_zone) values
  ('00000000-0000-0000-0000-00000000aaaa', 'Paw & Whisker', 'paw-whisker-015', 'America/Chicago'),
  ('00000000-0000-0000-0000-00000000bbbb', 'Other Dogs Co', 'other-dogs-015', 'America/New_York');

insert into memberships (business_id, user_id, role, status) values
  ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-000000000021', 'owner', 'active'),
  ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-000000000022', 'walker', 'active'),
  ('00000000-0000-0000-0000-00000000bbbb', '00000000-0000-0000-0000-000000000024', 'owner', 'active');

insert into clients (id, business_id, name, email) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000aaaa', 'Dana Harper', 'dana@test.dev'),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-00000000aaaa', 'Nadia Brooks', 'nadia@test.dev'),
  ('00000000-0000-0000-0000-0000000000c9', '00000000-0000-0000-0000-00000000bbbb', 'Remote Client', 'remote@test.dev');

-- e2 is inactive (never bookable); e9 lives in business B.
insert into services (id, business_id, name, kind, base_price_cents, extra_pet_price_cents, duration_min, requires_gps, active) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-00000000aaaa', 'Walk', 'walk', 2500, 500, 30, true, true),
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-00000000aaaa', 'Retired Walk', 'walk', 9900, 0, 30, true, false),
  ('00000000-0000-0000-0000-0000000000e9', '00000000-0000-0000-0000-00000000bbbb', 'B Walk', 'walk', 2000, 0, 30, true, true);

insert into pets (id, client_id, business_id, name, feeding_md, meds_md) values
  ('00000000-0000-0000-0000-000000000a01', '00000000-0000-0000-0000-0000000000c1',
   '00000000-0000-0000-0000-00000000aaaa', 'Biscuit', 'one cup', 'none'),
  ('00000000-0000-0000-0000-000000000a02', '00000000-0000-0000-0000-0000000000c1',
   '00000000-0000-0000-0000-00000000aaaa', 'Waffles', null, null),
  ('00000000-0000-0000-0000-000000000a03', '00000000-0000-0000-0000-0000000000c2',
   '00000000-0000-0000-0000-00000000aaaa', 'Mochi', 'two cups', null);

-- user 31 is linked to c1 (business A) AND c9 (business B) — multi-business
-- linking is allowed; user 32 is linked to c2 only; user 33 to nobody.
insert into client_users (business_id, client_id, user_id, linked_via) values
  ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-0000000000c1',
   '00000000-0000-0000-0000-000000000031', 'invite'),
  ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-0000000000c2',
   '00000000-0000-0000-0000-000000000032', 'invite'),
  ('00000000-0000-0000-0000-00000000bbbb', '00000000-0000-0000-0000-0000000000c9',
   '00000000-0000-0000-0000-000000000031', 'claim');

-- Visits: f1 (c1, completed, walker A1), f2 (c2, completed), f9 (c9, business B).
insert into visits (id, business_id, client_id, service_id, walker_id, pet_ids,
                    scheduled_start, scheduled_end, business_tz, status, price_cents_snapshot) values
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000aaaa',
   '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000e1',
   '00000000-0000-0000-0000-000000000022', '{}', '2026-08-20 14:00+00', '2026-08-20 14:30+00',
   'America/Chicago', 'completed', 2500),
  ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-00000000aaaa',
   '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000e1',
   null, '{}', '2026-08-21 14:00+00', '2026-08-21 14:30+00',
   'America/Chicago', 'completed', 3000),
  ('00000000-0000-0000-0000-0000000000f9', '00000000-0000-0000-0000-00000000bbbb',
   '00000000-0000-0000-0000-0000000000c9', '00000000-0000-0000-0000-0000000000e9',
   null, '{}', '2026-08-22 14:00+00', '2026-08-22 14:30+00',
   'America/New_York', 'completed', 2000);

insert into visit_reports (id, business_id, visit_id, public_token, summary) values
  ('00000000-0000-0000-0000-000000000b01', '00000000-0000-0000-0000-00000000aaaa',
   '00000000-0000-0000-0000-0000000000f1', 'tok-015-r1', '{}'),
  ('00000000-0000-0000-0000-000000000b02', '00000000-0000-0000-0000-00000000aaaa',
   '00000000-0000-0000-0000-0000000000f2', 'tok-015-r2', '{}');

insert into visit_events (id, business_id, visit_id, type, occurred_at, client_uuid) values
  ('00000000-0000-0000-0000-000000000d01', '00000000-0000-0000-0000-00000000aaaa',
   '00000000-0000-0000-0000-0000000000f1', 'pee', now(), '00000000-0000-0000-0000-00000000d0a1'),
  ('00000000-0000-0000-0000-000000000d02', '00000000-0000-0000-0000-00000000aaaa',
   '00000000-0000-0000-0000-0000000000f2', 'poop', now(), '00000000-0000-0000-0000-00000000d0a2');

insert into visit_tracks (id, business_id, visit_id, segment_no, points, client_uuid) values
  ('00000000-0000-0000-0000-000000000e01', '00000000-0000-0000-0000-00000000aaaa',
   '00000000-0000-0000-0000-0000000000f1', 0, '[]', '00000000-0000-0000-0000-00000000e0a1'),
  ('00000000-0000-0000-0000-000000000e02', '00000000-0000-0000-0000-00000000aaaa',
   '00000000-0000-0000-0000-0000000000f2', 0, '[]', '00000000-0000-0000-0000-00000000e0a2');

-- Invoices: i1 SENT for c1 (visible to its client), i2 DRAFT for c1 (never
-- client-visible), i3 SENT for c2 (the cross-client control).
insert into invoices (id, business_id, client_id, number, status, issued_on, public_token, sent_at) values
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-00000000aaaa',
   '00000000-0000-0000-0000-0000000000c1', 1, 'sent', '2026-08-25', 'tok-015-i1', now()),
  ('00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-00000000aaaa',
   '00000000-0000-0000-0000-0000000000c1', 2, 'draft', '2026-08-25', null, null),
  ('00000000-0000-0000-0000-000000000103', '00000000-0000-0000-0000-00000000aaaa',
   '00000000-0000-0000-0000-0000000000c2', 3, 'sent', '2026-08-25', 'tok-015-i3', now());

insert into invoice_items (id, business_id, invoice_id, visit_id, description, amount_cents, kind) values
  ('00000000-0000-0000-0000-000000000111', '00000000-0000-0000-0000-00000000aaaa',
   '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-0000000000f1', 'Walk 8/20', 2500, 'visit'),
  ('00000000-0000-0000-0000-000000000112', '00000000-0000-0000-0000-00000000aaaa',
   '00000000-0000-0000-0000-000000000102', null, 'Draft line', 100, 'manual'),
  ('00000000-0000-0000-0000-000000000113', '00000000-0000-0000-0000-00000000aaaa',
   '00000000-0000-0000-0000-000000000103', '00000000-0000-0000-0000-0000000000f2', 'Walk 8/21', 3000, 'visit');

insert into payments (id, business_id, invoice_id, method, amount_cents, received_on) values
  ('00000000-0000-0000-0000-000000000121', '00000000-0000-0000-0000-00000000aaaa',
   '00000000-0000-0000-0000-000000000101', 'venmo', 1000, '2026-08-25'),
  ('00000000-0000-0000-0000-000000000122', '00000000-0000-0000-0000-00000000aaaa',
   '00000000-0000-0000-0000-000000000103', 'zelle', 3000, '2026-08-25');

-- ===== schema =====
select has_table('public', 'client_users', 'client_users exists');
select has_table('public', 'booking_requests', 'booking_requests exists');

select throws_ok($$
  insert into client_users (business_id, client_id, user_id, linked_via)
  values ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-0000000000c1',
          '00000000-0000-0000-0000-000000000031', 'claim')
$$, '23505', null, 'a user links to the same client exactly once (unique client_id, user_id)');

select throws_ok($$
  insert into client_users (business_id, client_id, user_id, linked_via)
  values ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-0000000000c2',
          '00000000-0000-0000-0000-000000000033', 'stolen')
$$, '23514', null, 'linked_via allows only invite/claim');

select throws_ok($$
  insert into booking_requests (business_id, client_id, service_id, window_start, window_end, created_by)
  values ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-0000000000c1',
          '00000000-0000-0000-0000-0000000000e1', '2026-09-01 15:00+00', '2026-09-01 14:00+00',
          '00000000-0000-0000-0000-000000000031')
$$, '23514', null, 'a request window cannot end before it starts');

select throws_ok($$
  insert into booking_requests (business_id, client_id, service_id, window_start, window_end, status, created_by)
  values ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-0000000000c1',
          '00000000-0000-0000-0000-0000000000e1', '2026-09-01 14:00+00', '2026-09-01 15:00+00',
          'bogus', '00000000-0000-0000-0000-000000000031')
$$, '23514', null, 'booking_requests.status allows only pending/approved/declined');

-- ===== owner A: manages links, sees requests =====
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000021","role":"authenticated"}';

select is((select count(id) from client_users)::int, 2,
  'owner sees exactly the two links of their own business');

select throws_ok($$
  insert into client_users (business_id, client_id, user_id, linked_via)
  values ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-0000000000c2',
          '00000000-0000-0000-0000-000000000033', 'invite')
$$, '42501', null,
  'even the owner cannot insert a link directly — linking is the Task-3 definer RPC''s job');

-- ===== client 31 (linked to c1 in A and c9 in B): the read scope =====
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000031","role":"authenticated"}';

select is((select count(id) from client_users)::int, 2,
  'the linked user sees their own two links — one per business (multi-business linking allowed)');

select is((select array_agg(id order by id) from clients),
  array['00000000-0000-0000-0000-0000000000c1',
        '00000000-0000-0000-0000-0000000000c9']::uuid[],
  'the client sees exactly their own client rows across both linked businesses — never c2');

select lives_ok($$
  update clients set name = 'Hacked' where id = '00000000-0000-0000-0000-0000000000c1'
$$, 'client update of their own client row matches zero rows (read-only in v1)');

select is((select array_agg(id order by id) from pets),
  array['00000000-0000-0000-0000-000000000a01',
        '00000000-0000-0000-0000-000000000a02']::uuid[],
  'the client sees exactly their own client''s pets');

select is((select array_agg(id order by id) from services),
  array['00000000-0000-0000-0000-0000000000e1',
        '00000000-0000-0000-0000-0000000000e9']::uuid[],
  'the client sees the ACTIVE services of their linked businesses — the inactive one is hidden');

select is((select array_agg(id order by id) from visits),
  array['00000000-0000-0000-0000-0000000000f1',
        '00000000-0000-0000-0000-0000000000f9']::uuid[],
  'the client sees exactly their own visits — both businesses, never another client''s');

select throws_ok($$
  select price_cents_snapshot from visits where id = '00000000-0000-0000-0000-0000000000f1'
$$, '42501', null,
  'the client cannot read price_cents_snapshot even on their own visit (column-level grant)');

select is((select array_agg(id) from visit_reports),
  array['00000000-0000-0000-0000-000000000b01']::uuid[],
  'the client sees exactly their own visits'' reports');

select is((select array_agg(id) from visit_events),
  array['00000000-0000-0000-0000-000000000d01']::uuid[],
  'the client sees exactly their own visits'' events');

select is((select array_agg(id) from visit_tracks),
  array['00000000-0000-0000-0000-000000000e01']::uuid[],
  'the client sees exactly their own visits'' tracks');

select is((select array_agg(id) from invoices),
  array['00000000-0000-0000-0000-000000000101']::uuid[],
  'the client sees exactly their own SENT invoice — never the draft, never another client''s');

select is((select array_agg(id) from invoice_items),
  array['00000000-0000-0000-0000-000000000111']::uuid[],
  'invoice items follow the visible-invoice chain (no draft leakage)');

select is((select array_agg(id) from payments),
  array['00000000-0000-0000-0000-000000000121']::uuid[],
  'payments follow the visible-invoice chain too');

-- pets self-service: care notes, vet info, photo — nothing else.
select lives_ok($$
  update pets set feeding_md = 'two cups, morning only', reactivity_md = 'shy with bikes',
                  vet_name = 'Dr. Patel', vet_phone = '555-0100', photo_path = 'a/b/biscuit.jpg'
  where id = '00000000-0000-0000-0000-000000000a01'
$$, 'the linked client edits the self-service pet columns');

select is((select feeding_md from pets where id = '00000000-0000-0000-0000-000000000a01'),
  'two cups, morning only', 'the self-service edit stuck');

select throws_ok($$
  update pets set name = 'Renamed' where id = '00000000-0000-0000-0000-000000000a01'
$$, 'P0001', 'clients may edit only care notes, vet info, and the photo',
  'a client cannot rename the pet (identity columns are owner-only)');

select throws_ok($$
  update pets set meds_md = 'double the dose' where id = '00000000-0000-0000-0000-000000000a01'
$$, 'P0001', 'clients may edit only care notes, vet info, and the photo',
  'a client cannot edit meds_md (walker-safety instructions stay owner-curated)');

select lives_ok($$
  update pets set feeding_md = 'sabotage' where id = '00000000-0000-0000-0000-000000000a03'
$$, 'a client update against another client''s pet matches zero rows');

-- booking requests: own pending inserts only.
select lives_ok($$
  insert into booking_requests (id, business_id, client_id, service_id, pet_ids,
                                window_start, window_end, note_md, created_by)
  values ('00000000-0000-0000-0000-000000000f01', '00000000-0000-0000-0000-00000000aaaa',
          '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000e1',
          array['00000000-0000-0000-0000-000000000a01',
                '00000000-0000-0000-0000-000000000a02']::uuid[],
          '2026-09-01 14:00+00', '2026-09-01 15:00+00', 'Both dogs please',
          '00000000-0000-0000-0000-000000000031')
$$, 'the linked client requests a booking for their own client (pending, both pets)');

select throws_ok($$
  insert into booking_requests (business_id, client_id, service_id, window_start, window_end, created_by)
  values ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-0000000000c2',
          '00000000-0000-0000-0000-0000000000e1', '2026-09-01 14:00+00', '2026-09-01 15:00+00',
          '00000000-0000-0000-0000-000000000031')
$$, '42501', null, 'the client cannot request for ANOTHER client');

select throws_ok($$
  insert into booking_requests (business_id, client_id, service_id, window_start, window_end, status, created_by)
  values ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-0000000000c1',
          '00000000-0000-0000-0000-0000000000e1', '2026-09-01 14:00+00', '2026-09-01 15:00+00',
          'approved', '00000000-0000-0000-0000-000000000031')
$$, '42501', null, 'the client cannot insert a pre-approved request (status forced pending)');

select throws_ok($$
  insert into booking_requests (business_id, client_id, service_id, window_start, window_end, created_by)
  values ('00000000-0000-0000-0000-00000000bbbb', '00000000-0000-0000-0000-0000000000c1',
          '00000000-0000-0000-0000-0000000000e9', '2026-09-01 14:00+00', '2026-09-01 15:00+00',
          '00000000-0000-0000-0000-000000000031')
$$, '42501', null, 'business/client mismatch is rejected (c1 is not linked in business B)');

select throws_ok($$
  insert into booking_requests (business_id, client_id, service_id, window_start, window_end, created_by)
  values ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-0000000000c1',
          '00000000-0000-0000-0000-0000000000e2', '2026-09-01 14:00+00', '2026-09-01 15:00+00',
          '00000000-0000-0000-0000-000000000031')
$$, '42501', null, 'an inactive service cannot be requested');

select throws_ok($$
  insert into booking_requests (business_id, client_id, service_id, window_start, window_end, created_by)
  values ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-0000000000c1',
          '00000000-0000-0000-0000-0000000000e9', '2026-09-01 14:00+00', '2026-09-01 15:00+00',
          '00000000-0000-0000-0000-000000000031')
$$, '42501', null, 'a service from another business cannot be requested');

select throws_ok($$
  insert into booking_requests (business_id, client_id, service_id, pet_ids, window_start, window_end, created_by)
  values ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-0000000000c1',
          '00000000-0000-0000-0000-0000000000e1',
          array['00000000-0000-0000-0000-000000000a03']::uuid[],
          '2026-09-01 14:00+00', '2026-09-01 15:00+00', '00000000-0000-0000-0000-000000000031')
$$, '42501', null, 'another client''s pet in pet_ids is rejected');

select throws_ok($$
  insert into booking_requests (business_id, client_id, service_id, window_start, window_end, created_by)
  values ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-0000000000c1',
          '00000000-0000-0000-0000-0000000000e1', '2026-09-01 14:00+00', '2026-09-01 15:00+00',
          '00000000-0000-0000-0000-000000000021')
$$, '42501', null, 'created_by must be the caller themselves');

select is((select count(id) from booking_requests)::int, 1,
  'the client sees exactly their own request');

select lives_ok($$
  update booking_requests set note_md = 'edited after the fact'
  where id = '00000000-0000-0000-0000-000000000f01'
$$, 'client update of a request matches zero rows (no client update policy)');

select throws_ok($$
  select public.approve_booking_request('00000000-0000-0000-0000-000000000f01')
$$, 'P0001', 'only the business owner can approve booking requests',
  'the client cannot approve their own request');

select throws_ok($$
  select public.decline_booking_request('00000000-0000-0000-0000-000000000f01', 'nope')
$$, 'P0001', 'only the business owner can decline booking requests',
  'the client cannot decline a request either');

-- ===== client 32: cross-client isolation inside the same business =====
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000032","role":"authenticated"}';

select is((select array_agg(id) from visits),
  array['00000000-0000-0000-0000-0000000000f2']::uuid[],
  'the second client sees only their own visit');

select is((select array_agg(id) from clients),
  array['00000000-0000-0000-0000-0000000000c2']::uuid[],
  'the second client sees only their own client row');

select is((select count(id) from booking_requests)::int, 0,
  'the second client does not see the first client''s request');

select lives_ok($$
  insert into booking_requests (id, business_id, client_id, service_id, pet_ids,
                                window_start, window_end, created_by)
  values ('00000000-0000-0000-0000-000000000f02', '00000000-0000-0000-0000-00000000aaaa',
          '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000e1',
          array['00000000-0000-0000-0000-000000000a03']::uuid[],
          '2026-09-02 14:00+00', '2026-09-02 16:00+00',
          '00000000-0000-0000-0000-000000000032'),
         ('00000000-0000-0000-0000-000000000f03', '00000000-0000-0000-0000-00000000aaaa',
          '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000e1',
          array['00000000-0000-0000-0000-000000000a03']::uuid[],
          '2026-09-03 14:00+00', '2026-09-03 16:00+00',
          '00000000-0000-0000-0000-000000000032')
$$, 'the second client files two requests of their own');

-- ===== owner A sees every request in the business =====
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000021","role":"authenticated"}';

select is((select count(id) from booking_requests)::int, 3,
  'the owner sees every request in the business, whichever client filed it');

-- ===== unlinked authenticated user: nothing =====
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000033","role":"authenticated"}';

select is((select count(id) from visits)::int, 0, 'unlinked user sees zero visits');
select is((select count(id) from clients)::int, 0, 'unlinked user sees zero client rows');
select is((select count(id) from booking_requests)::int, 0, 'unlinked user sees zero requests');
select is((select count(id) from client_users)::int, 0, 'unlinked user sees zero links');

select throws_ok($$
  insert into booking_requests (business_id, client_id, service_id, window_start, window_end, created_by)
  values ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-0000000000c1',
          '00000000-0000-0000-0000-0000000000e1', '2026-09-01 14:00+00', '2026-09-01 15:00+00',
          '00000000-0000-0000-0000-000000000033')
$$, '42501', null, 'an unlinked user cannot file a request at all');

-- ===== owner B: zero rows in business A =====
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000024","role":"authenticated"}';

select is((select count(id) from booking_requests)::int, 0,
  'cross-business owner sees zero requests of business A');
select is((select count(id) from client_users
           where business_id = '00000000-0000-0000-0000-00000000aaaa')::int, 0,
  'cross-business owner sees zero links of business A');

-- ===== anon: nothing =====
set local role anon;

select throws_ok($$ select * from client_users $$, '42501', null,
  'anon cannot select client_users');
select throws_ok($$ select * from booking_requests $$, '42501', null,
  'anon cannot select booking_requests');

-- ===== superuser checks: the blocked writes changed nothing =====
reset role;
set local request.jwt.claims to '{}';

select is((select name from clients where id = '00000000-0000-0000-0000-0000000000c1'),
  'Dana Harper', 'the client-row rename attempt changed nothing');

select is((select feeding_md from pets where id = '00000000-0000-0000-0000-000000000a03'),
  'two cups', 'the cross-client pet edit changed nothing');

select is((select note_md from booking_requests
           where id = '00000000-0000-0000-0000-000000000f01'),
  'Both dogs please', 'the client''s request-update attempt changed nothing');

select is((select count(*) from notifications
           where channel = 'email' and template = 'booking_request_received'
             and "to" = 'owner-a@test.dev')::int, 3,
  'every client-filed request queued exactly one booking_request_received email to the owner');

select ok((select payload @> jsonb_build_object(
             'clientName', 'Dana Harper', 'serviceName', 'Walk')
           from notifications
           where template = 'booking_request_received'
             and payload->>'requestId' = '00000000-0000-0000-0000-000000000f01'),
  'the owner email payload carries the client and service names');

-- ===== approve: creates the visit, stamps, queues, audits =====
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000021","role":"authenticated"}';

create table pg_temp.ref (k text primary key, id uuid);
create function pg_temp.rid(text) returns uuid language sql
  as $$ select id from pg_temp.ref where k = $1 $$;

insert into pg_temp.ref values ('v1', public.approve_booking_request(
  '00000000-0000-0000-0000-000000000f01', '00000000-0000-0000-0000-000000000022'));

select ok((select status = 'offered' and walker_id = '00000000-0000-0000-0000-000000000022'
           from visits where id = pg_temp.rid('v1')),
  'approve with a walker creates an OFFERED visit assigned to that walker');

select is((select price_cents_snapshot from visits where id = pg_temp.rid('v1')), 3000,
  'the visit price is base + extra_pet x (pets - 1): 2500 + 500 for the two-dog request');

select ok((select scheduled_start = '2026-09-01 14:00+00'::timestamptz
              and scheduled_end   = '2026-09-01 14:30+00'::timestamptz
              and business_tz     = 'America/Chicago'
           from visits where id = pg_temp.rid('v1')),
  'the visit sits at window_start for the service''s duration in the business tz');

select ok((select status = 'approved' and visit_id = pg_temp.rid('v1')
              and decided_by = '00000000-0000-0000-0000-000000000021'
              and decided_at is not null
           from booking_requests where id = '00000000-0000-0000-0000-000000000f01'),
  'the request is stamped approved with the visit, decider, and time');

select is((select count(*) from notifications
           where channel = 'email' and template = 'booking_request_approved'
             and "to" = 'dana@test.dev'
             and payload->>'requestId' = '00000000-0000-0000-0000-000000000f01'
             and payload->>'visitId' = pg_temp.rid('v1')::text)::int, 1,
  'approve queues exactly one booking_request_approved email carrying request and visit ids');

select ok((select meta @> jsonb_build_object('price_cents', 3000,
             'walker_id', '00000000-0000-0000-0000-000000000022')
           from audit_log
           where action = 'booking_request.approve'
             and entity_id = '00000000-0000-0000-0000-000000000f01'),
  'the approve audit row carries the price and walker');

select throws_ok($$
  select public.approve_booking_request('00000000-0000-0000-0000-000000000f01')
$$, 'P0001', 'booking request is not pending (status: approved)',
  're-approving raises instead of double-booking');

select throws_ok($$
  select public.decline_booking_request('00000000-0000-0000-0000-000000000f01', 'too late')
$$, 'P0001', 'booking request is not pending (status: approved)',
  'declining an approved request raises too');

select throws_ok($$
  select public.approve_booking_request('00000000-0000-0000-0000-000000000f02',
                                        '00000000-0000-0000-0000-000000000033')
$$, 'P0001', 'walker is not an active member of this business',
  'approve validates the walker''s active membership (offer_visit rule)');

insert into pg_temp.ref values ('v2', public.approve_booking_request(
  '00000000-0000-0000-0000-000000000f02'));

select ok((select status = 'unassigned' and walker_id is null
           from visits where id = pg_temp.rid('v2')),
  'approve without a walker creates an UNASSIGNED visit');

select is((select price_cents_snapshot from visits where id = pg_temp.rid('v2')), 2500,
  'a one-pet request takes the bare base price');

-- ===== decline: stamps, queues with the reason, audits =====
select throws_ok($$
  select public.decline_booking_request('00000000-0000-0000-0000-000000000f03', '  ')
$$, 'P0001', 'a decline requires a reason', 'a blank decline reason is rejected');

select lives_ok($$
  select public.decline_booking_request('00000000-0000-0000-0000-000000000f03',
                                        'Fully booked that day')
$$, 'the owner declines the remaining request');

select ok((select status = 'declined' and decline_reason = 'Fully booked that day'
              and decided_by = '00000000-0000-0000-0000-000000000021'
              and decided_at is not null and visit_id is null
           from booking_requests where id = '00000000-0000-0000-0000-000000000f03'),
  'the request is stamped declined with the reason, decider, and time');

select is((select count(*) from notifications
           where channel = 'email' and template = 'booking_request_declined'
             and "to" = 'nadia@test.dev'
             and payload->>'requestId' = '00000000-0000-0000-0000-000000000f03'
             and payload->>'reason' = 'Fully booked that day')::int, 1,
  'decline queues exactly one booking_request_declined email carrying the reason');

select ok((select meta @> '{"reason": "Fully booked that day"}'
           from audit_log
           where action = 'booking_request.decline'
             and entity_id = '00000000-0000-0000-0000-000000000f03'),
  'the decline audit row carries the reason');

-- ===== guards: walker and cross-business owner are rejected =====
-- A fresh pending request; the fixture insert (superuser) also exercises the
-- notify trigger, which is fine — the owner-email count was asserted above it.
set local request.jwt.claims to '{}';
insert into booking_requests (id, business_id, client_id, service_id,
                              window_start, window_end, created_by) values
  ('00000000-0000-0000-0000-000000000f04', '00000000-0000-0000-0000-00000000aaaa',
   '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000e1',
   '2026-09-04 14:00+00', '2026-09-04 15:00+00', '00000000-0000-0000-0000-000000000031');

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000022","role":"authenticated"}';

select throws_ok($$
  select public.approve_booking_request('00000000-0000-0000-0000-000000000f04')
$$, 'P0001', null, 'walker: approve rejected');
select throws_ok($$
  select public.decline_booking_request('00000000-0000-0000-0000-000000000f04', 'no')
$$, 'P0001', null, 'walker: decline rejected');

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000024","role":"authenticated"}';

select throws_ok($$
  select public.approve_booking_request('00000000-0000-0000-0000-000000000f04')
$$, 'P0001', null, 'cross-owner: approve rejected');
select throws_ok($$
  select public.decline_booking_request('00000000-0000-0000-0000-000000000f04', 'no')
$$, 'P0001', null, 'cross-owner: decline rejected');

-- ===== direct-update transition matrix (trigger under test, 011 pattern) =====
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000021","role":"authenticated"}';

select throws_ok($$
  update booking_requests set status = 'approved'
  where id = '00000000-0000-0000-0000-000000000f04'
$$, 'P0001', 'an approved booking request needs a visit',
  'a direct approve without a visit is rejected (the RPC is the path that creates one)');

select throws_ok($$
  update booking_requests set status = 'declined'
  where id = '00000000-0000-0000-0000-000000000f04'
$$, 'P0001', 'a decline requires a reason',
  'a direct decline without a reason is rejected');

select throws_ok($$
  update booking_requests set status = 'approved',
    visit_id = '00000000-0000-0000-0000-0000000000f1'
  where id = '00000000-0000-0000-0000-000000000f03'
$$, 'P0001', 'illegal booking request transition: declined -> approved',
  'a decided request never changes state again');

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000022","role":"authenticated"}';

select throws_ok($$
  update booking_requests set status = 'declined', decline_reason = 'walker says no'
  where id = '00000000-0000-0000-0000-000000000f04'
$$, 'P0001', 'only the business owner can decide booking requests',
  'the walker cannot decide a request even through a direct update');

set local request.jwt.claims to '{}';

select lives_ok($$
  update booking_requests set status = 'declined', decline_reason = 'window closed'
  where id = '00000000-0000-0000-0000-000000000f04'
$$, 'elevated (no JWT) skips only the who-check — the matrix itself still applies');

select ok((select decided_at is not null and updated_at >= created_at
           from booking_requests where id = '00000000-0000-0000-0000-000000000f04'),
  'the trigger stamps decided_at and updated_at on the transition');

-- ===== grants =====
set local role anon;

select throws_ok($$
  select public.approve_booking_request('00000000-0000-0000-0000-000000000f01')
$$, '42501', null, 'anon has no execute on approve_booking_request');

reset role;
set local request.jwt.claims to '{}';

select is(
  (select bool_and(has_function_privilege('authenticated', f, 'execute'))
     from unnest(array[
       'public.approve_booking_request(uuid, uuid)',
       'public.decline_booking_request(uuid, text)']) f),
  true, 'authenticated can execute both booking RPCs');

select is(
  (select bool_or(has_function_privilege('anon', f, 'execute'))
     from unnest(array[
       'public.approve_booking_request(uuid, uuid)',
       'public.decline_booking_request(uuid, text)']) f),
  false, 'anon can execute neither');

select ok(
  has_table_privilege('authenticated', 'public.client_users', 'select')
  and has_table_privilege('authenticated', 'public.client_users', 'delete')
  and not has_table_privilege('authenticated', 'public.client_users', 'insert')
  and not has_table_privilege('authenticated', 'public.client_users', 'update'),
  'authenticated holds select/delete on client_users and NO insert/update (linking is definer-only)');

select ok(
  has_table_privilege('authenticated', 'public.booking_requests', 'select')
  and has_table_privilege('authenticated', 'public.booking_requests', 'insert')
  and has_table_privilege('authenticated', 'public.booking_requests', 'update')
  and not has_table_privilege('authenticated', 'public.booking_requests', 'delete'),
  'authenticated holds select/insert/update on booking_requests and NO delete (requests are history)');

select is(
  (select bool_and(has_table_privilege('service_role', t, p))
     from unnest(array['public.client_users', 'public.booking_requests']) t
    cross join unnest(array['select', 'insert', 'update', 'delete']) p),
  true, 'service_role holds full DML on both new tables');

select is(
  (select bool_or(has_table_privilege('anon', t, p))
     from unnest(array['public.client_users', 'public.booking_requests']) t
    cross join unnest(array['select', 'insert', 'update', 'delete']) p),
  false, 'anon holds no privilege on either new table');

select is(
  (select bool_or(has_function_privilege('authenticated', f, 'execute'))
     from unnest(array[
       'public.enforce_booking_request_transition()',
       'public.notify_owner_booking_request()',
       'public.enforce_pet_client_columns()',
       'public.queue_owner_email(uuid, text, jsonb)']) f),
  false, 'no trigger/queue helper is directly executable by clients');

select * from finish();
rollback;
