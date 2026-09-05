begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

-- Review fix #1 (P1, 2026-09-05): client_prices policies proved ownership of
-- the supplied business_id but nothing tied client_id/service_id to that
-- business, so owner A could plant an override on B's client+service that
-- expand-series (service role, no business filter then) would honor. The fix
-- is composite FKs: (client_id, business_id) and (service_id, business_id)
-- must exist as pairs. This file pins the constraint from both sides.

-- ===== fixtures: two businesses, one owner each, a client+service in each ==
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000231', 'owner23a@test.dev'),
  ('00000000-0000-0000-0000-000000000232', 'owner23b@test.dev');
insert into businesses (id, name, slug, time_zone) values
  ('00000000-0000-0000-0000-00000023aaaa', 'Paw 023A', 'paw-023a', 'America/Chicago'),
  ('00000000-0000-0000-0000-00000023bbbb', 'Paw 023B', 'paw-023b', 'America/Chicago');
insert into memberships (business_id, user_id, role, status) values
  ('00000000-0000-0000-0000-00000023aaaa', '00000000-0000-0000-0000-000000000231', 'owner', 'active'),
  ('00000000-0000-0000-0000-00000023bbbb', '00000000-0000-0000-0000-000000000232', 'owner', 'active');
insert into clients (id, business_id, name) values
  ('00000000-0000-0000-0000-0000000023c1', '00000000-0000-0000-0000-00000023aaaa', 'Casey 023A'),
  ('00000000-0000-0000-0000-0000000023c2', '00000000-0000-0000-0000-00000023bbbb', 'Bram 023B');
insert into services (id, business_id, name, kind, base_price_cents, duration_min) values
  ('00000000-0000-0000-0000-000000230051', '00000000-0000-0000-0000-00000023aaaa',
   'Walk A', 'walk', 2500, 30),
  ('00000000-0000-0000-0000-000000230052', '00000000-0000-0000-0000-00000023bbbb',
   'Walk B', 'walk', 3000, 30);

-- ===== owner A: a legitimate override still works =====
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000231","role":"authenticated"}';

insert into client_prices (business_id, client_id, service_id, base_price_cents) values
  ('00000000-0000-0000-0000-00000023aaaa', '00000000-0000-0000-0000-0000000023c1',
   '00000000-0000-0000-0000-000000230051', 2000);
select is((select count(*)::int from client_prices
            where client_id = '00000000-0000-0000-0000-0000000023c1'), 1,
  'owner A creates an override for their own client and service');

-- ===== owner A: cannot reference business B''s client or service =====
select throws_ok(
  $$insert into client_prices (business_id, client_id, service_id, base_price_cents) values
    ('00000000-0000-0000-0000-00000023aaaa', '00000000-0000-0000-0000-0000000023c2',
     '00000000-0000-0000-0000-000000230051', 100)$$,
  '23503', null,
  'owner A cannot insert an override pointing at business B''s client');
select throws_ok(
  $$insert into client_prices (business_id, client_id, service_id, base_price_cents) values
    ('00000000-0000-0000-0000-00000023aaaa', '00000000-0000-0000-0000-0000000023c1',
     '00000000-0000-0000-0000-000000230052', 100)$$,
  '23503', null,
  'owner A cannot insert an override pointing at business B''s service');
select throws_ok(
  $$update client_prices set client_id = '00000000-0000-0000-0000-0000000023c2'
     where client_id = '00000000-0000-0000-0000-0000000023c1'$$,
  '23503', null,
  'owner A cannot re-point an existing override at business B''s client');

-- ===== owner A: RLS still refuses writing under B''s business_id =====
select throws_ok(
  $$insert into client_prices (business_id, client_id, service_id, base_price_cents) values
    ('00000000-0000-0000-0000-00000023bbbb', '00000000-0000-0000-0000-0000000023c2',
     '00000000-0000-0000-0000-000000230052', 100)$$,
  '42501', null,
  'owner A cannot write an override under business B''s id at all');

select * from finish();
rollback;
