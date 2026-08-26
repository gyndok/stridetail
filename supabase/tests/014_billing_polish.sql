begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

-- Plan 6 Task 4 — billing polish RPCs: resend_invoice_email (re-queues the
-- invoice_ready email for a sent|paid invoice without touching the token) and
-- uninvoiced_visit_amounts (true price snapshots for the new-invoice preview).
-- Runs as superuser with request.jwt.claims driving the actor (012 pattern):
-- the definer RPCs bypass RLS, so the is_owner guards are what is under test.

-- ===== fixtures =====
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000031', 'owner-a@test.dev'),
  ('00000000-0000-0000-0000-000000000032', 'walker-a1@test.dev'),
  ('00000000-0000-0000-0000-000000000034', 'owner-b@test.dev');

insert into businesses (id, name, slug, time_zone) values
  ('00000000-0000-0000-0000-00000000aaaa', 'Paw & Whisker', 'paw-whisker-014', 'America/Chicago'),
  ('00000000-0000-0000-0000-00000000bbbb', 'Other Dogs Co', 'other-dogs-014', 'America/New_York');

insert into memberships (business_id, user_id, role, status) values
  ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-000000000031', 'owner', 'active'),
  ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-000000000032', 'walker', 'active'),
  ('00000000-0000-0000-0000-00000000bbbb', '00000000-0000-0000-0000-000000000034', 'owner', 'active');

-- c1 has an email (resend queues), c2 has none (resend must raise),
-- c3 carries the uninvoiced-amounts fixtures.
insert into clients (id, business_id, name, email) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000aaaa', 'Dana Harper', 'dana@test.dev'),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-00000000aaaa', 'No Email Ned', null),
  ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-00000000aaaa', 'Amount Annie', 'annie@test.dev');

insert into services (id, business_id, name, kind, base_price_cents, extra_pet_price_cents, duration_min, requires_gps) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-00000000aaaa', 'Walk', 'walk', 2500, 500, 30, true);

-- Fixture inserts take any status directly: the guards are UPDATE triggers.
-- The c3 snapshots deliberately DIFFER from the current service price (2500):
-- uninvoiced_visit_amounts must return the stored snapshot, never recompute.
insert into visits (id, business_id, client_id, service_id, pet_ids,
                    scheduled_start, scheduled_end, business_tz, status, price_cents_snapshot) values
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000aaaa',
   '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000e1',
   '{}', '2026-08-20 14:00+00', '2026-08-20 14:30+00', 'America/Chicago', 'completed', 2500),
  ('00000000-0000-0000-0000-0000000000f5', '00000000-0000-0000-0000-00000000aaaa',
   '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000e1',
   '{}', '2026-08-19 14:00+00', '2026-08-19 14:30+00', 'America/Chicago', 'completed', 2000),
  -- c3: g1 stays uninvoiced (snapshot 1234 ≠ service 2500 — the pin),
  -- g2 gets invoiced (excluded), g3 is accepted (never eligible),
  -- g5 stays uninvoiced (order check: g1 then g5 by scheduled_start).
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000aaaa',
   '00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000e1',
   '{}', '2026-08-18 14:00+00', '2026-08-18 14:30+00', 'America/Chicago', 'completed', 1234),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-00000000aaaa',
   '00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000e1',
   '{}', '2026-08-19 14:00+00', '2026-08-19 14:30+00', 'America/Chicago', 'completed', 2000),
  ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-00000000aaaa',
   '00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000e1',
   '{}', '2026-08-22 14:00+00', '2026-08-22 14:30+00', 'America/Chicago', 'accepted', 9900),
  ('00000000-0000-0000-0000-0000000000a5', '00000000-0000-0000-0000-00000000aaaa',
   '00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000e1',
   '{}', '2026-08-21 14:00+00', '2026-08-21 14:30+00', 'America/Chicago', 'completed', 700);

-- Captured ids from RPC returns, keyed by name (012 pattern).
create table pg_temp.ref (k text primary key, id uuid);
create function pg_temp.rid(text) returns uuid language sql
  as $$ select id from pg_temp.ref where k = $1 $$;

-- ===== resend_invoice_email: happy path on sent, then paid =====
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000031","role":"authenticated"}';

insert into pg_temp.ref values ('inv1', public.create_invoice(
  '00000000-0000-0000-0000-0000000000c1', null, null));
-- DO blocks keep non-TAP result rows out of the pg_prove stream.
do $$ begin perform public.send_invoice(pg_temp.rid('inv1')); end $$;

select is((select count(*) from notifications
           where channel = 'email' and template = 'invoice_ready'
             and payload->>'invoiceId' = pg_temp.rid('inv1')::text)::int, 1,
  'baseline: send_invoice queued exactly one invoice_ready email');

select lives_ok($$
  select public.resend_invoice_email(pg_temp.rid('inv1'))
$$, 'the owner resends the email on a SENT invoice');

select is((select count(*) from notifications
           where channel = 'email' and template = 'invoice_ready'
             and "to" = 'dana@test.dev'
             and payload->>'invoiceId' = pg_temp.rid('inv1')::text
             and payload->>'invoiceToken' = (select public_token from invoices
                                             where id = pg_temp.rid('inv1')))::int, 2,
  'resend queues exactly one MORE row with the same payload shape and the LIVE token (never rotated)');

select is((select count(*) from audit_log
           where action = 'invoice.resend_email'
             and entity_id = pg_temp.rid('inv1'))::int, 1,
  'resend writes exactly one invoice.resend_email audit row');

select ok((select meta @> '{"number": 1}' from audit_log
           where action = 'invoice.resend_email' and entity_id = pg_temp.rid('inv1')),
  'the resend audit row carries the invoice number');

-- Flip inv1 to paid (2500 visit line, no deposits) — resend stays allowed.
insert into pg_temp.ref values ('p1', public.record_payment(
  pg_temp.rid('inv1'), 'venmo', 2500, '2026-08-25', null));

select lives_ok($$
  select public.resend_invoice_email(pg_temp.rid('inv1'))
$$, 'resend is also allowed on a PAID invoice (receipt re-delivery)');

select is((select count(*) from notifications
           where template = 'invoice_ready'
             and payload->>'invoiceId' = pg_temp.rid('inv1')::text)::int, 3,
  'the paid-state resend queued a third row');

-- ===== resend rejections: draft, void, revoked, no token, no email =====
insert into pg_temp.ref values ('inv2', public.create_invoice(
  '00000000-0000-0000-0000-0000000000c1', null, null));

select throws_ok($$
  select public.resend_invoice_email(pg_temp.rid('inv2'))
$$, 'P0001', 'invoice is not sent (status: draft)', 'a draft cannot be resent');

do $$ begin perform public.void_invoice(pg_temp.rid('inv2')); end $$;
select throws_ok($$
  select public.resend_invoice_email(pg_temp.rid('inv2'))
$$, 'P0001', 'invoice is not sent (status: void)', 'a void invoice cannot be resent');

insert into pg_temp.ref values ('inv3', public.create_invoice(
  '00000000-0000-0000-0000-0000000000c1', null, null));
do $$ begin perform public.send_invoice(pg_temp.rid('inv3')); end $$;
update invoices set revoked_at = now() where id = pg_temp.rid('inv3');

select throws_ok($$
  select public.resend_invoice_email(pg_temp.rid('inv3'))
$$, 'P0001', 'invoice link has been revoked',
  'a revoked link is never re-emailed');

-- Belt and braces: a sent invoice can never lack a token via the RPCs, but
-- the precondition still guards a direct-write slip.
update invoices set revoked_at = null, public_token = null where id = pg_temp.rid('inv3');
select throws_ok($$
  select public.resend_invoice_email(pg_temp.rid('inv3'))
$$, 'P0001', 'invoice has no public link', 'a tokenless invoice cannot be resent');

insert into pg_temp.ref values ('inv4', public.create_invoice(
  '00000000-0000-0000-0000-0000000000c2', null, null));
select lives_ok($$
  select public.send_invoice(pg_temp.rid('inv4'))
$$, 'sending for the email-less client still succeeds (silent-skip, Task 2 behavior)');

select throws_ok($$
  select public.resend_invoice_email(pg_temp.rid('inv4'))
$$, 'P0001', 'client has no email on file',
  'resend RAISES for a client with no email — an explicit resend must not silently no-op');

select is((select count(*) from notifications
           where template = 'invoice_ready'
             and payload->>'invoiceId' = pg_temp.rid('inv4')::text)::int, 0,
  'no email row ever queued for the email-less client');

-- ===== uninvoiced_visit_amounts: true snapshots, invoiced/non-completed excluded =====
select is((select base_price_cents from services
           where id = '00000000-0000-0000-0000-0000000000e1'), 2500,
  'fixture pin: the current service price (2500) differs from the stored snapshots (1234/700)');

-- Invoice exactly g2 via its local-date range (Aug 19 in America/Chicago).
insert into pg_temp.ref values ('invR', public.create_invoice(
  '00000000-0000-0000-0000-0000000000c3', '2026-08-19', '2026-08-19'));

select is((select count(*) from invoice_items
           where invoice_id = pg_temp.rid('invR') and kind = 'visit')::int, 1,
  'the range invoice picked exactly the Aug 19 visit');

select results_eq(
  $$ select visit_id, amount_cents
       from public.uninvoiced_visit_amounts('00000000-0000-0000-0000-0000000000c3') $$,
  $$ values ('00000000-0000-0000-0000-0000000000a1'::uuid, 1234),
            ('00000000-0000-0000-0000-0000000000a5'::uuid, 700) $$,
  'amounts are the STORED snapshots (not recomputed from the 2500 service price), '
  || 'completed-only, invoiced excluded, ordered by scheduled_start');

select lives_ok($$
  select public.void_invoice(pg_temp.rid('invR'))
$$, 'voiding the range invoice releases its visit');

select results_eq(
  $$ select visit_id, amount_cents
       from public.uninvoiced_visit_amounts('00000000-0000-0000-0000-0000000000c3') $$,
  $$ values ('00000000-0000-0000-0000-0000000000a1'::uuid, 1234),
            ('00000000-0000-0000-0000-0000000000a2'::uuid, 2000),
            ('00000000-0000-0000-0000-0000000000a5'::uuid, 700) $$,
  'the released visit re-appears in the amounts at its stored snapshot');

-- ===== guards: walker and cross-business owner rejected, anon cannot execute =====
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000032","role":"authenticated"}';

select throws_ok($$
  select public.resend_invoice_email(pg_temp.rid('inv1'))
$$, 'P0001', null, 'walker: resend_invoice_email rejected');
select throws_ok($$
  select * from public.uninvoiced_visit_amounts('00000000-0000-0000-0000-0000000000c3')
$$, 'P0001', null, 'walker: uninvoiced_visit_amounts rejected');

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000034","role":"authenticated"}';

select throws_ok($$
  select public.resend_invoice_email(pg_temp.rid('inv1'))
$$, 'P0001', null, 'cross-owner: resend_invoice_email rejected');
select throws_ok($$
  select * from public.uninvoiced_visit_amounts('00000000-0000-0000-0000-0000000000c3')
$$, 'P0001', null, 'cross-owner: uninvoiced_visit_amounts rejected');

set local role anon;

select throws_ok($$
  select public.resend_invoice_email(pg_temp.rid('inv1'))
$$, '42501', null, 'anon has no execute on resend_invoice_email');
select throws_ok($$
  select * from public.uninvoiced_visit_amounts('00000000-0000-0000-0000-0000000000c3')
$$, '42501', null, 'anon has no execute on uninvoiced_visit_amounts');

reset role;
set local request.jwt.claims to '{}';

-- ===== grants =====
select is(
  (select bool_and(has_function_privilege('authenticated', f, 'execute'))
     from unnest(array[
       'public.resend_invoice_email(uuid)',
       'public.uninvoiced_visit_amounts(uuid)']) f),
  true, 'authenticated can execute both polish RPCs');

select is(
  (select bool_or(has_function_privilege('anon', f, 'execute'))
     from unnest(array[
       'public.resend_invoice_email(uuid)',
       'public.uninvoiced_visit_amounts(uuid)']) f),
  false, 'anon can execute neither');

select * from finish();
rollback;
