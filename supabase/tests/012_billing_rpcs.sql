begin;
create extension if not exists pgtap with schema extensions;
select plan(90);

-- Plan 5 Task 2 — billing RPC suite: create/send/pay/void invoice lifecycle,
-- deposit ledger transitions, numbering lock, totals helper, guards, audit.
-- Runs as superuser with request.jwt.claims driving the actor (011-matrix
-- pattern): the definer RPCs bypass RLS anyway, so the guards under test are
-- the is_owner checks keyed on auth.uid(). Grants get their own assertions.

-- ===== fixtures =====
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000021', 'owner-a@test.dev'),
  ('00000000-0000-0000-0000-000000000022', 'walker-a1@test.dev'),
  ('00000000-0000-0000-0000-000000000024', 'owner-b@test.dev');

insert into businesses (id, name, slug, time_zone) values
  ('00000000-0000-0000-0000-00000000aaaa', 'Paw & Whisker', 'paw-whisker-012', 'America/Chicago'),
  ('00000000-0000-0000-0000-00000000bbbb', 'Other Dogs Co', 'other-dogs-012', 'America/New_York');

insert into memberships (business_id, user_id, role, status) values
  ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-000000000021', 'owner', 'active'),
  ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-000000000022', 'walker', 'active'),
  ('00000000-0000-0000-0000-00000000bbbb', '00000000-0000-0000-0000-000000000024', 'owner', 'active');

-- c1 has an email (send queues), c2 has none (send skips).
insert into clients (id, business_id, name, email) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000aaaa', 'Dana Harper', 'dana@test.dev'),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-00000000aaaa', 'No Email Ned', null);

insert into services (id, business_id, name, kind, base_price_cents, extra_pet_price_cents, duration_min, requires_gps) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-00000000aaaa', 'Walk', 'walk', 2500, 500, 30, true);

-- Completed visits for c1. f6 is the local-date trap: 2026-08-21 03:00 UTC is
-- Aug 20, 22:00 in America/Chicago — a [Aug 20, Aug 20] range must catch it.
-- f4 is accepted (never invoiceable). f5 belongs to the email-less client.
-- Fixture inserts take any status directly: the guards are UPDATE triggers.
insert into visits (id, business_id, client_id, service_id, pet_ids,
                    scheduled_start, scheduled_end, business_tz, status, price_cents_snapshot) values
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000aaaa',
   '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000e1',
   '{}', '2026-08-20 14:00+00', '2026-08-20 14:30+00', 'America/Chicago', 'completed', 2500),
  ('00000000-0000-0000-0000-0000000000f6', '00000000-0000-0000-0000-00000000aaaa',
   '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000e1',
   '{}', '2026-08-21 03:00+00', '2026-08-21 03:30+00', 'America/Chicago', 'completed', 1000),
  ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-00000000aaaa',
   '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000e1',
   '{}', '2026-08-21 14:00+00', '2026-08-21 14:30+00', 'America/Chicago', 'completed', 3000),
  ('00000000-0000-0000-0000-0000000000f3', '00000000-0000-0000-0000-00000000aaaa',
   '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000e1',
   '{}', '2026-08-10 14:00+00', '2026-08-10 14:30+00', 'America/Chicago', 'completed', 1500),
  ('00000000-0000-0000-0000-0000000000f4', '00000000-0000-0000-0000-00000000aaaa',
   '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000e1',
   '{}', '2026-08-22 14:00+00', '2026-08-22 14:30+00', 'America/Chicago', 'accepted', 9900),
  ('00000000-0000-0000-0000-0000000000f5', '00000000-0000-0000-0000-00000000aaaa',
   '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000e1',
   '{}', '2026-08-19 14:00+00', '2026-08-19 14:30+00', 'America/Chicago', 'completed', 2000);

-- Captured ids from RPC returns, keyed by name.
create table pg_temp.ref (k text primary key, id uuid);
create function pg_temp.rid(text) returns uuid language sql
  as $$ select id from pg_temp.ref where k = $1 $$;

-- ===== create_invoice: range filter, descriptions, numbering =====
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000021","role":"authenticated"}';

insert into pg_temp.ref values ('inv1', public.create_invoice(
  '00000000-0000-0000-0000-0000000000c1', '2026-08-20', '2026-08-20'));

select is((select count(*) from invoice_items where invoice_id = pg_temp.rid('inv1') and kind = 'visit')::int, 2,
  'a [Aug 20, Aug 20] range picks exactly the two visits on the LOCAL Aug 20 — including the UTC-Aug-21 late walk');

select is((select array_agg(amount_cents order by amount_cents) from invoice_items
           where invoice_id = pg_temp.rid('inv1')),
  array[1000, 2500], 'visit lines carry the price snapshots');

select is((select description from invoice_items
           where invoice_id = pg_temp.rid('inv1') and amount_cents = 2500),
  'Walk — Thu, Aug 20', 'line description is the service name plus the local date in the business tz');

select is((select number from invoices where id = pg_temp.rid('inv1')), 1,
  'the first invoice takes number 1');

select is((select status::text from invoices where id = pg_temp.rid('inv1')), 'draft',
  'a new invoice is a draft');

select is((select issued_on from invoices where id = pg_temp.rid('inv1')),
  (now() at time zone 'America/Chicago')::date,
  'issued_on is stamped today in the BUSINESS time zone, not the server zone');

select is((select invoice_next_number from businesses
           where id = '00000000-0000-0000-0000-00000000aaaa'), 2,
  'the business counter incremented to 2');

insert into pg_temp.ref values ('inv2', public.create_invoice(
  '00000000-0000-0000-0000-0000000000c1', null, null));

select is((select array_agg(amount_cents order by amount_cents) from invoice_items
           where invoice_id = pg_temp.rid('inv2')),
  array[1500, 3000], 'a dateless create sweeps the remaining completed un-invoiced visits');

select is((select number from invoices where id = pg_temp.rid('inv2')), 2,
  'two sequential creates take consecutive numbers');

select is((select invoice_next_number from businesses
           where id = '00000000-0000-0000-0000-00000000aaaa'), 3,
  'the counter incremented again');

select is((select count(*) from invoice_items
           where visit_id = '00000000-0000-0000-0000-0000000000f4')::int, 0,
  'a non-completed visit is never invoiced');

select ok(pg_get_functiondef('public.create_invoice(uuid, date, date)'::regprocedure)
  like '%for update%',
  'number allocation reads the business row under an explicit for-update lock (serializes concurrent creates)');

-- ===== deposits: auto-apply oldest-first, whole-deposit rule =====
insert into pg_temp.ref values ('d1', public.record_deposit(
  '00000000-0000-0000-0000-0000000000c1', 2500, 'venmo', '2026-08-01', 'first deposit'));
insert into pg_temp.ref values ('d2', public.record_deposit(
  '00000000-0000-0000-0000-0000000000c1', 2000, null, '2026-08-05', null));

select is((select status::text from deposits where id = pg_temp.rid('d1')), 'held',
  'record_deposit lands in held (requested reserved for future UI)');

insert into visits (id, business_id, client_id, service_id, pet_ids,
                    scheduled_start, scheduled_end, business_tz, status, price_cents_snapshot) values
  ('00000000-0000-0000-0000-0000000000f7', '00000000-0000-0000-0000-00000000aaaa',
   '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000e1',
   '{}', '2026-08-23 14:00+00', '2026-08-23 14:30+00', 'America/Chicago', 'completed', 3000);

insert into pg_temp.ref values ('inv3', public.create_invoice(
  '00000000-0000-0000-0000-0000000000c1', null, null));

select is((select amount_cents from invoice_items
           where invoice_id = pg_temp.rid('inv3') and kind = 'visit'), 3000,
  'the third invoice carries the one remaining completed visit');

select is((select amount_cents from invoice_items
           where invoice_id = pg_temp.rid('inv3') and kind = 'deposit_credit'), -2500,
  'the OLDEST held deposit (2500 ≤ 3000 subtotal) auto-applies as a negative credit line');

select is((select applied_invoice_id from deposits
           where id = pg_temp.rid('d1') and status = 'applied'), pg_temp.rid('inv3'),
  'the applied deposit links to its invoice');

select is((select status::text from deposits where id = pg_temp.rid('d2')), 'held',
  'the newer 2000 deposit exceeds the 500 remaining subtotal and stays held (whole-deposit rule)');

select is((select (t.items_cents, t.payments_cents, t.balance_cents)::text
           from public.invoice_totals(pg_temp.rid('inv3')) t),
  '(500,0,500)', 'invoice_totals nets the deposit credit against the visit line');

-- ===== manual items and totals math =====
insert into pg_temp.ref values ('it1', public.add_invoice_item(
  pg_temp.rid('inv3'), 'Tip received', 500));
insert into pg_temp.ref values ('it2', public.add_invoice_item(
  pg_temp.rid('inv3'), 'Loyalty discount', -300));

select is((select (t.items_cents, t.payments_cents, t.balance_cents)::text
           from public.invoice_totals(pg_temp.rid('inv3')) t),
  '(700,0,700)', 'totals include positive and negative manual lines');

select throws_ok($$
  select public.add_invoice_item(pg_temp.rid('inv3'), 'nothing', 0)
$$, 'P0001', 'a manual line cannot be zero', 'a zero manual line is rejected');

select lives_ok($$
  select public.remove_invoice_item(pg_temp.rid('it2'))
$$, 'a manual line can be removed while the invoice is draft/sent');

select is((select (t.items_cents, t.payments_cents, t.balance_cents)::text
           from public.invoice_totals(pg_temp.rid('inv3')) t),
  '(1000,0,1000)', 'removing the discount restores the subtotal');

select throws_ok($$
  select public.remove_invoice_item((select id from invoice_items
    where invoice_id = pg_temp.rid('inv3') and kind = 'visit'))
$$, 'P0001', 'only manual lines can be removed',
  'a visit line cannot be removed (it leaves via void)');

select throws_ok($$
  select public.remove_invoice_item((select id from invoice_items
    where invoice_id = pg_temp.rid('inv3') and kind = 'deposit_credit'))
$$, 'P0001', 'only manual lines can be removed',
  'a deposit credit cannot be removed (it leaves via void)');

-- ===== send_invoice: token, email queue, skip-if-no-email =====
select lives_ok($$
  select public.send_invoice(pg_temp.rid('inv3'))
$$, 'the owner sends the draft invoice');

select is((select status::text from invoices where id = pg_temp.rid('inv3')), 'sent',
  'send moves the invoice to sent (transition trigger validated)');

select ok((select sent_at is not null and public_token ~ '^[0-9a-f]{48}$'
           from invoices where id = pg_temp.rid('inv3')),
  'sent_at is stamped and a 24-byte hex public token issued');

select is((select count(*) from notifications
           where channel = 'email' and template = 'invoice_ready'
             and "to" = 'dana@test.dev'
             and payload->>'invoiceId' = pg_temp.rid('inv3')::text
             and payload->>'invoiceToken' = (select public_token from invoices
                                             where id = pg_temp.rid('inv3')))::int, 1,
  'send queues exactly one invoice_ready email carrying the invoice id and token');

select throws_ok($$
  select public.send_invoice(pg_temp.rid('inv3'))
$$, 'P0001', 'invoice is not a draft (status: sent)',
  're-sending a sent invoice raises instead of silently rotating the token');

insert into pg_temp.ref values ('inv4', public.create_invoice(
  '00000000-0000-0000-0000-0000000000c2', null, null));

select lives_ok($$
  select public.send_invoice(pg_temp.rid('inv4'))
$$, 'sending succeeds for a client with no email (skip-if-no-email, visit-flow behavior)');

select is((select count(*) from notifications
           where template = 'invoice_ready'
             and payload->>'invoiceId' = pg_temp.rid('inv4')::text)::int, 0,
  'no email row is queued for the email-less client');

-- ===== record_payment: partial, completing, overpay, preconditions =====
select throws_ok($$
  select public.record_payment(pg_temp.rid('inv3'), 'venmo', 0, '2026-08-25', null)
$$, 'P0001', 'payment amount must be positive', 'a zero payment is rejected');

insert into pg_temp.ref values ('p1', public.record_payment(
  pg_temp.rid('inv3'), 'venmo', 400, '2026-08-25', 'part 1'));

select is((select status::text from invoices where id = pg_temp.rid('inv3')), 'sent',
  'a partial payment leaves the invoice sent');

select is((select (t.items_cents, t.payments_cents, t.balance_cents)::text
           from public.invoice_totals(pg_temp.rid('inv3')) t),
  '(1000,400,600)', 'the balance reflects the partial payment');

insert into pg_temp.ref values ('p2', public.record_payment(
  pg_temp.rid('inv3'), 'zelle', 600, '2026-08-25', null));

select is((select status::text from invoices where id = pg_temp.rid('inv3')), 'paid',
  'payments reaching the items total flip the invoice to paid');

select ok((select paid_at is not null from invoices where id = pg_temp.rid('inv3')),
  'paid_at is stamped on the flip');

select lives_ok($$
  select public.record_payment(pg_temp.rid('inv3'), 'cash', 100, '2026-08-25', 'extra')
$$, 'an extra payment on a paid invoice is still recorded');

select is((select meta->>'overpaid' from audit_log
           where action = 'payment.record' and (meta->>'amount_cents')::int = 100),
  'true', 'the overpayment audit row is flagged overpaid');

insert into pg_temp.ref values ('inv5', public.create_invoice(
  '00000000-0000-0000-0000-0000000000c1', null, null));

select is((select count(*) from invoice_items where invoice_id = pg_temp.rid('inv5'))::int, 0,
  'zero eligible visits still creates an empty draft (owner can add manual lines)');

select is((select status::text from deposits where id = pg_temp.rid('d2')), 'held',
  'no deposit is applied against a zero subtotal');

select throws_ok($$
  select public.record_payment(pg_temp.rid('inv5'), 'cash', 100, '2026-08-25', null)
$$, 'P0001', 'invoice is not sent (status: draft)', 'a payment on a draft is rejected');

select throws_ok($$
  select public.add_invoice_item(pg_temp.rid('inv3'), 'Late line', 100)
$$, 'P0001', 'invoice lines can only change while draft or sent (status: paid)',
  'a paid invoice''s lines are frozen');

-- ===== void_invoice: releases visits and deposits, keeps payments =====
select throws_ok($$
  select public.void_invoice(pg_temp.rid('inv3'))
$$, 'P0001', 'invoice cannot be voided (status: paid)', 'a paid invoice cannot be voided');

insert into visits (id, business_id, client_id, service_id, pet_ids,
                    scheduled_start, scheduled_end, business_tz, status, price_cents_snapshot) values
  ('00000000-0000-0000-0000-0000000000f8', '00000000-0000-0000-0000-00000000aaaa',
   '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000e1',
   '{}', '2026-08-24 14:00+00', '2026-08-24 14:30+00', 'America/Chicago', 'completed', 2500);

insert into pg_temp.ref values ('inv6', public.create_invoice(
  '00000000-0000-0000-0000-0000000000c1', null, null));

select is((select applied_invoice_id from deposits
           where id = pg_temp.rid('d2') and status = 'applied'), pg_temp.rid('inv6'),
  'the held 2000 deposit fits the new 2500 subtotal and applies');

select lives_ok($$
  select public.void_invoice(pg_temp.rid('inv6'))
$$, 'the owner voids the draft invoice');

select is((select status::text from invoices where id = pg_temp.rid('inv6')), 'void',
  'the invoice is void');

select is((select count(*) from invoice_items where invoice_id = pg_temp.rid('inv6'))::int, 0,
  'voiding deletes the items (releases the visit''s unique slot)');

select ok((select status = 'held' and applied_invoice_id is null
           from deposits where id = pg_temp.rid('d2')),
  'the applied deposit returns to held with the invoice link cleared');

insert into pg_temp.ref values ('inv7', public.create_invoice(
  '00000000-0000-0000-0000-0000000000c1', null, null));

select is((select visit_id from invoice_items
           where invoice_id = pg_temp.rid('inv7') and kind = 'visit'),
  '00000000-0000-0000-0000-0000000000f8'::uuid,
  'the voided visit is re-invoiceable — the next create picks it up');

select is((select count(*) from invoice_items
           where invoice_id = pg_temp.rid('inv7') and kind = 'deposit_credit')::int, 1,
  'the released deposit applies again');

select lives_ok($$
  select public.send_invoice(pg_temp.rid('inv7'))
$$, 'the re-created invoice can be sent');

insert into pg_temp.ref values ('p4', public.record_payment(
  pg_temp.rid('inv7'), 'cash', 200, '2026-08-25', null));

select lives_ok($$
  select public.void_invoice(pg_temp.rid('inv7'))
$$, 'a SENT invoice with a partial payment can be voided');

select is((select count(*) from payments where invoice_id = pg_temp.rid('inv7'))::int, 1,
  'payment rows stay attached to the voided invoice (history)');

select ok((select revoked_at is not null from invoices where id = pg_temp.rid('inv7')),
  'voiding a sent invoice revokes its public link');

select is((select status::text from deposits where id = pg_temp.rid('d2')), 'held',
  'the deposit is back to held after the second void');

-- ===== deposit lifecycle: forfeit and refund are held-only =====
select throws_ok($$
  select public.record_deposit('00000000-0000-0000-0000-0000000000c1', 0)
$$, 'P0001', 'deposit amount must be positive', 'a zero deposit is rejected');

insert into pg_temp.ref values ('d3', public.record_deposit(
  '00000000-0000-0000-0000-0000000000c1', 1000));

select lives_ok($$
  select public.forfeit_deposit(pg_temp.rid('d3'))
$$, 'the owner forfeits a held deposit');

select is((select status::text from deposits where id = pg_temp.rid('d3')), 'forfeited',
  'the deposit is forfeited');

select throws_ok($$
  select public.forfeit_deposit(pg_temp.rid('d3'))
$$, 'P0001', 'deposit is not held (status: forfeited)', 'forfeit is held-only');

select throws_ok($$
  select public.refund_deposit(pg_temp.rid('d3'))
$$, 'P0001', 'deposit is not held (status: forfeited)', 'refund is held-only');

insert into pg_temp.ref values ('d4', public.record_deposit(
  '00000000-0000-0000-0000-0000000000c1', 1500, 'zelle', '2026-08-20', 'refund me'));

select lives_ok($$
  select public.refund_deposit(pg_temp.rid('d4'))
$$, 'the owner refunds a held deposit');

select is((select status::text from deposits where id = pg_temp.rid('d4')), 'refunded',
  'the deposit is refunded');

-- ===== guards: the walker is rejected by every RPC =====
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000022","role":"authenticated"}';

select throws_ok($$
  select public.create_invoice('00000000-0000-0000-0000-0000000000c1', null, null)
$$, 'P0001', null, 'walker: create_invoice rejected');
select throws_ok($$
  select public.add_invoice_item(pg_temp.rid('inv5'), 'sneak', 100)
$$, 'P0001', null, 'walker: add_invoice_item rejected');
select throws_ok($$
  select public.remove_invoice_item(pg_temp.rid('it1'))
$$, 'P0001', null, 'walker: remove_invoice_item rejected');
select throws_ok($$
  select public.send_invoice(pg_temp.rid('inv5'))
$$, 'P0001', null, 'walker: send_invoice rejected');
select throws_ok($$
  select public.record_payment(pg_temp.rid('inv3'), 'cash', 100, '2026-08-25', null)
$$, 'P0001', null, 'walker: record_payment rejected');
select throws_ok($$
  select public.void_invoice(pg_temp.rid('inv5'))
$$, 'P0001', null, 'walker: void_invoice rejected');
select throws_ok($$
  select public.record_deposit('00000000-0000-0000-0000-0000000000c1', 1000)
$$, 'P0001', null, 'walker: record_deposit rejected');
select throws_ok($$
  select public.forfeit_deposit(pg_temp.rid('d2'))
$$, 'P0001', null, 'walker: forfeit_deposit rejected');
select throws_ok($$
  select public.refund_deposit(pg_temp.rid('d2'))
$$, 'P0001', null, 'walker: refund_deposit rejected');
select throws_ok($$
  select * from public.invoice_totals(pg_temp.rid('inv3'))
$$, 'P0001', null, 'walker: invoice_totals rejected');

-- ===== guards: the cross-business owner is rejected by every RPC =====
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000024","role":"authenticated"}';

select throws_ok($$
  select public.create_invoice('00000000-0000-0000-0000-0000000000c1', null, null)
$$, 'P0001', null, 'cross-owner: create_invoice rejected');
select throws_ok($$
  select public.add_invoice_item(pg_temp.rid('inv5'), 'sneak', 100)
$$, 'P0001', null, 'cross-owner: add_invoice_item rejected');
select throws_ok($$
  select public.remove_invoice_item(pg_temp.rid('it1'))
$$, 'P0001', null, 'cross-owner: remove_invoice_item rejected');
select throws_ok($$
  select public.send_invoice(pg_temp.rid('inv5'))
$$, 'P0001', null, 'cross-owner: send_invoice rejected');
select throws_ok($$
  select public.record_payment(pg_temp.rid('inv3'), 'cash', 100, '2026-08-25', null)
$$, 'P0001', null, 'cross-owner: record_payment rejected');
select throws_ok($$
  select public.void_invoice(pg_temp.rid('inv5'))
$$, 'P0001', null, 'cross-owner: void_invoice rejected');
select throws_ok($$
  select public.record_deposit('00000000-0000-0000-0000-0000000000c1', 1000)
$$, 'P0001', null, 'cross-owner: record_deposit rejected');
select throws_ok($$
  select public.forfeit_deposit(pg_temp.rid('d2'))
$$, 'P0001', null, 'cross-owner: forfeit_deposit rejected');
select throws_ok($$
  select public.refund_deposit(pg_temp.rid('d2'))
$$, 'P0001', null, 'cross-owner: refund_deposit rejected');
select throws_ok($$
  select * from public.invoice_totals(pg_temp.rid('inv3'))
$$, 'P0001', null, 'cross-owner: invoice_totals rejected');

-- ===== anon cannot even execute =====
set local role anon;

select throws_ok($$
  select public.create_invoice('00000000-0000-0000-0000-0000000000c1', null, null)
$$, '42501', null, 'anon has no execute on create_invoice');

reset role;
set local request.jwt.claims to '{}';

-- ===== grants =====
select is(
  (select bool_and(has_function_privilege('authenticated', f, 'execute'))
     from unnest(array[
       'public.create_invoice(uuid, date, date)',
       'public.add_invoice_item(uuid, text, int)',
       'public.remove_invoice_item(uuid)',
       'public.send_invoice(uuid)',
       'public.record_payment(uuid, public.payment_method, int, date, text)',
       'public.void_invoice(uuid)',
       'public.record_deposit(uuid, int, public.payment_method, date, text)',
       'public.forfeit_deposit(uuid)',
       'public.refund_deposit(uuid)',
       'public.invoice_totals(uuid)']) f),
  true, 'authenticated can execute every billing RPC');

select is(
  (select bool_or(has_function_privilege('anon', f, 'execute'))
     from unnest(array[
       'public.create_invoice(uuid, date, date)',
       'public.add_invoice_item(uuid, text, int)',
       'public.remove_invoice_item(uuid)',
       'public.send_invoice(uuid)',
       'public.record_payment(uuid, public.payment_method, int, date, text)',
       'public.void_invoice(uuid)',
       'public.record_deposit(uuid, int, public.payment_method, date, text)',
       'public.forfeit_deposit(uuid)',
       'public.refund_deposit(uuid)',
       'public.invoice_totals(uuid)']) f),
  false, 'anon can execute none of them');

-- ===== audit accounting: one row per mutation, amounts in meta =====
select is(
  (select string_agg(action || ':' || n, ',' order by action)
     from (select action, count(*) as n
             from audit_log
            where business_id = '00000000-0000-0000-0000-00000000aaaa'
            group by action) t),
  'deposit.apply:3,deposit.forfeit:1,deposit.record:4,deposit.refund:1,'
  || 'deposit.release:2,invoice.create:7,invoice.item_add:2,invoice.item_remove:1,'
  || 'invoice.paid:1,invoice.send:3,invoice.void:2,payment.record:4',
  'every RPC mutation wrote exactly its audit rows — creates, sends, payments, voids, deposit transitions');

select ok((select meta @> '{"visit_items_cents": 3000, "deposit_applied_cents": 2500}'
           from audit_log
           where action = 'invoice.create' and entity_id = pg_temp.rid('inv3')),
  'the invoice.create audit row carries the money amounts');

select ok((select meta @> ('{"amount_cents": 2500, "invoice_id": "'
                           || pg_temp.rid('inv3') || '"}')::jsonb
           from audit_log
           where action = 'deposit.apply' and entity_id = pg_temp.rid('d1')),
  'the deposit.apply audit row carries the amount and target invoice');

select ok((select meta @> '{"items_cents": 1000, "payments_cents": 1000}'
           from audit_log
           where action = 'invoice.paid' and entity_id = pg_temp.rid('inv3')),
  'the invoice.paid audit row carries both totals');

select ok((select bool_and(actor_user_id = '00000000-0000-0000-0000-000000000021')
           from audit_log where business_id = '00000000-0000-0000-0000-00000000aaaa'),
  'every audit row stamps the acting owner');

select * from finish();
rollback;
