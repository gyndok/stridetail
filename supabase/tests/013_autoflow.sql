begin;
create extension if not exists pgtap with schema extensions;
select plan(86);

-- Plan 6 Task 1 — auto-invoice on finish_visit + payout statement RPCs.
-- Runs as superuser with request.jwt.claims driving the actor (012 pattern) for
-- the definer RPCs; the walker-visibility flip switches to `set local role
-- authenticated` (011 pattern) so RLS is exercised end-to-end. The per_visit /
-- per_sitting flows are driven by the WALKER calling finish_visit — invoice
-- creation must run in definer context despite the caller not being owner.

-- ===== fixtures =====
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000021', 'owner-a@test.dev'),
  ('00000000-0000-0000-0000-000000000022', 'walker-a1@test.dev'),
  ('00000000-0000-0000-0000-000000000023', 'walker-a2@test.dev'),
  ('00000000-0000-0000-0000-000000000024', 'owner-b@test.dev');

insert into businesses (id, name, slug, time_zone) values
  ('00000000-0000-0000-0000-00000000aaaa', 'Paw & Whisker', 'paw-whisker-013', 'America/Chicago'),
  ('00000000-0000-0000-0000-00000000bbbb', 'Other Dogs Co', 'other-dogs-013', 'America/New_York');

insert into memberships (business_id, user_id, role, status, payout_percent) values
  ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-000000000021', 'owner', 'active', 0),
  ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-000000000022', 'walker', 'active', 32.50),
  ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-000000000023', 'walker', 'active', 50),
  ('00000000-0000-0000-0000-00000000bbbb', '00000000-0000-0000-0000-000000000024', 'owner', 'active', 0);

insert into clients (id, business_id, name, email) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000aaaa', 'Dana Harper', 'dana@test.dev'),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-00000000aaaa', 'Sitting Sam', 'sam@test.dev');

insert into services (id, business_id, name, kind, base_price_cents, extra_pet_price_cents, duration_min, requires_gps) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-00000000aaaa', 'Walk', 'walk', 2500, 500, 30, true);

-- Held deposits for c1: d1 (older, 2500) fits the 3000 auto-invoice subtotal;
-- d2 (newer, 5000) does not — the whole-deposit rule must leave it held.
insert into deposits (id, business_id, client_id, amount_cents, status, received_on) values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-00000000aaaa',
   '00000000-0000-0000-0000-0000000000c1', 2500, 'held', '2026-08-01'),
  ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-00000000aaaa',
   '00000000-0000-0000-0000-0000000000c1', 5000, 'held', '2026-08-05');

-- a1 is the visit the walker will finish; a2 is a completed UN-invoiced visit for
-- the same client on the same local day — the single-visit rule must NOT pull it.
-- Fixture inserts take any status directly: the guards are UPDATE triggers.
insert into visits (id, business_id, client_id, service_id, walker_id, pet_ids,
                    scheduled_start, scheduled_end, business_tz, status, started_at, price_cents_snapshot) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000aaaa',
   '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000e1',
   '00000000-0000-0000-0000-000000000022', '{}', '2026-08-20 14:00+00', '2026-08-20 14:30+00',
   'America/Chicago', 'in_progress', now() - interval '30 minutes', 3000),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-00000000aaaa',
   '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000e1',
   '00000000-0000-0000-0000-000000000022', '{}', '2026-08-20 16:00+00', '2026-08-20 16:30+00',
   'America/Chicago', 'completed', null, 9999);

-- Captured ids from RPC returns, keyed by name (012 pattern). Readable under
-- `set local role authenticated/anon` too (the visibility sections).
create table pg_temp.ref (k text primary key, id uuid);
create function pg_temp.rid(text) returns uuid language sql
  as $$ select id from pg_temp.ref where k = $1 $$;
grant select on table pg_temp.ref to anon, authenticated;

-- ===== businesses: auto_invoice setting + venmo handle =====
select is((select auto_invoice from businesses where id = '00000000-0000-0000-0000-00000000aaaa'),
  'per_visit', 'auto_invoice defaults to per_visit');

select throws_ok($$
  update businesses set auto_invoice = 'bogus'
   where id = '00000000-0000-0000-0000-00000000aaaa'
$$, '23514', null, 'auto_invoice is check-constrained to per_visit/per_sitting/manual');

update businesses set venmo_handle = 'paw-whisker'
 where id = '00000000-0000-0000-0000-00000000aaaa';
select is((select venmo_handle from businesses where id = '00000000-0000-0000-0000-00000000aaaa'),
  'paw-whisker', 'venmo_handle is stored (nullable text)');

-- ===== per_visit: the walker's finish auto-creates and sends the invoice =====
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000022","role":"authenticated"}';

select lives_ok($$
  select public.finish_visit('00000000-0000-0000-0000-0000000000a1', 'auto notes')
$$, 'the WALKER finishes the visit — invoice creation runs in definer context despite the non-owner caller');

select is((select status::text from visits where id = '00000000-0000-0000-0000-0000000000a1'),
  'completed', 'the visit completed');

select is((select count(*) from invoices
           where client_id = '00000000-0000-0000-0000-0000000000c1')::int, 1,
  'exactly one invoice was auto-created');

insert into pg_temp.ref values ('ainv',
  (select id from invoices where client_id = '00000000-0000-0000-0000-0000000000c1'));

select is((select status::text from invoices where id = pg_temp.rid('ainv')), 'sent',
  'the auto-invoice is already sent');

select ok((select public_token ~ '^[0-9a-f]{48}$' and sent_at is not null
           from invoices where id = pg_temp.rid('ainv')),
  'sent_at is stamped and a 24-byte hex public token issued');

select is((select count(*) from invoice_items
           where invoice_id = pg_temp.rid('ainv') and kind = 'visit')::int, 1,
  'the auto-invoice carries exactly ONE visit line');

select is((select visit_id from invoice_items
           where invoice_id = pg_temp.rid('ainv') and kind = 'visit'),
  '00000000-0000-0000-0000-0000000000a1'::uuid,
  'that line is the finished visit — not the other uninvoiced same-day visit');

select is((select count(*) from invoice_items
           where visit_id = '00000000-0000-0000-0000-0000000000a2')::int, 0,
  'the other completed un-invoiced visit stays un-invoiced');

select is((select amount_cents from invoice_items
           where invoice_id = pg_temp.rid('ainv') and kind = 'visit'), 3000,
  'the visit line carries the price snapshot');

select is((select amount_cents from invoice_items
           where invoice_id = pg_temp.rid('ainv') and kind = 'deposit_credit'), -2500,
  'the oldest held deposit auto-applied as a credit line');

select ok((select status = 'applied' and applied_invoice_id = pg_temp.rid('ainv')
           from deposits where id = '00000000-0000-0000-0000-0000000000d1'),
  'the applied deposit links to the auto-invoice');

select is((select status::text from deposits where id = '00000000-0000-0000-0000-0000000000d2'),
  'held', 'the 5000 deposit exceeds the 500 remaining subtotal and stays held (whole-deposit rule)');

select is((select count(*) from notifications
           where channel = 'email' and template = 'invoice_ready'
             and "to" = 'dana@test.dev')::int, 0,
  'no invoice_ready email from autoflow — the visit_finished report page carries the invoice (one email per walk)');

select is((select count(*) from notifications
           where template = 'visit_finished'
             and payload->>'visitId' = '00000000-0000-0000-0000-0000000000a1')::int, 1,
  'the visit_finished report email still queues (unchanged)');

select is((select issued_on from invoices where id = pg_temp.rid('ainv')),
  (now() at time zone 'America/Chicago')::date,
  'issued_on is stamped today in the BUSINESS time zone');

select is((select number from invoices where id = pg_temp.rid('ainv')), 1,
  'the auto-invoice took number 1 from the business counter');

select is((select invoice_next_number from businesses
           where id = '00000000-0000-0000-0000-00000000aaaa'), 2,
  'the counter advanced under the same for-update lock rule');

select ok((select meta->>'auto' = 'true'
              and actor_user_id = '00000000-0000-0000-0000-000000000022'
           from audit_log where action = 'invoice.create' and entity_id = pg_temp.rid('ainv')),
  'invoice.create audited with auto flag; the actor is the finishing walker (system-on-behalf-of-business)');

select ok((select meta->>'auto' = 'true'
           from audit_log where action = 'invoice.send' and entity_id = pg_temp.rid('ainv')),
  'invoice.send audited with auto flag');

-- ===== per_visit failure path: finish is sacred =====
-- Pre-invoice the next visit on a draft (superuser insert), so the auto-flow's
-- item insert trips the invoiced-once unique index.
set local request.jwt.claims to '{}';

insert into visits (id, business_id, client_id, service_id, walker_id, pet_ids,
                    scheduled_start, scheduled_end, business_tz, status, started_at, price_cents_snapshot) values
  ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-00000000aaaa',
   '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000e1',
   '00000000-0000-0000-0000-000000000022', '{}', '2026-08-21 14:00+00', '2026-08-21 14:30+00',
   'America/Chicago', 'in_progress', now() - interval '25 minutes', 1500);

insert into invoices (id, business_id, client_id, number, status, issued_on) values
  ('00000000-0000-0000-0000-000000000900', '00000000-0000-0000-0000-00000000aaaa',
   '00000000-0000-0000-0000-0000000000c1', 900, 'draft', '2026-08-21');
insert into invoice_items (business_id, invoice_id, visit_id, description, amount_cents, kind) values
  ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-000000000900',
   '00000000-0000-0000-0000-0000000000a3', 'Prebooked', 1500, 'visit');

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000022","role":"authenticated"}';

select lives_ok($$
  select public.finish_visit('00000000-0000-0000-0000-0000000000a3', null)
$$, 'finish_visit succeeds even though auto-invoicing raises (visit completion is sacred)');

select is((select status::text from visits where id = '00000000-0000-0000-0000-0000000000a3'),
  'completed', 'the visit still completed');

select is((select count(*) from invoices
           where business_id = '00000000-0000-0000-0000-00000000aaaa')::int, 2,
  'no new invoice appeared (the failed subtransaction rolled back)');

select is((select invoice_next_number from businesses
           where id = '00000000-0000-0000-0000-00000000aaaa'), 2,
  'the number allocation rolled back with it — the counter did not advance');

select ok((select meta->>'error' like '%duplicate key%'
           from audit_log where action = 'invoice.autocreate_failed'
             and entity = 'visit'
             and entity_id = '00000000-0000-0000-0000-0000000000a3'),
  'the failure wrote an invoice.autocreate_failed audit row carrying sqlerrm');

select is((select count(*) from notifications
           where template = 'invoice_ready'
             and "to" = 'dana@test.dev')::int, 0,
  'still no invoice_ready email after the rolled-back second flow');

-- ===== per_sitting: finishes accumulate on ONE draft, never sent =====
set local request.jwt.claims to '{}';
update businesses set auto_invoice = 'per_sitting'
 where id = '00000000-0000-0000-0000-00000000aaaa';

insert into visits (id, business_id, client_id, service_id, walker_id, pet_ids,
                    scheduled_start, scheduled_end, business_tz, status, started_at, price_cents_snapshot) values
  ('00000000-0000-0000-0000-0000000000a4', '00000000-0000-0000-0000-00000000aaaa',
   '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000e1',
   '00000000-0000-0000-0000-000000000022', '{}', '2026-08-22 14:00+00', '2026-08-22 14:30+00',
   'America/Chicago', 'in_progress', now() - interval '30 minutes', 2000),
  ('00000000-0000-0000-0000-0000000000a5', '00000000-0000-0000-0000-00000000aaaa',
   '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000e1',
   '00000000-0000-0000-0000-000000000022', '{}', '2026-08-22 16:00+00', '2026-08-22 16:30+00',
   'America/Chicago', 'in_progress', now() - interval '20 minutes', 2600);

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000022","role":"authenticated"}';

select public.finish_visit('00000000-0000-0000-0000-0000000000a4', null);

select is((select count(*) from invoices
           where client_id = '00000000-0000-0000-0000-0000000000c2')::int, 1,
  'the first per_sitting finish created a draft invoice');

insert into pg_temp.ref values ('sinv',
  (select id from invoices where client_id = '00000000-0000-0000-0000-0000000000c2'));

select ok((select status = 'draft' and public_token is null and sent_at is null
           from invoices where id = pg_temp.rid('sinv')),
  'the per_sitting invoice stays an unsent draft — no token, no sent_at');

select is((select count(*) from invoice_items
           where invoice_id = pg_temp.rid('sinv'))::int, 1,
  'the draft carries the first visit line');

select public.finish_visit('00000000-0000-0000-0000-0000000000a5', null);

select is((select count(*) from invoices
           where client_id = '00000000-0000-0000-0000-0000000000c2')::int, 1,
  'the second finish appended to the SAME draft — no second invoice');

select is((select array_agg(amount_cents order by amount_cents) from invoice_items
           where invoice_id = pg_temp.rid('sinv')),
  array[2000, 2600], 'both visits accumulated as lines at their snapshots');

select is((select count(*) from notifications
           where template = 'invoice_ready'
             and payload->>'invoiceId' = pg_temp.rid('sinv')::text)::int, 0,
  'per_sitting never sends — no invoice_ready email queued');

select is((select number from invoices where id = pg_temp.rid('sinv')), 2,
  'the draft took the next business number');

select is((select invoice_next_number from businesses
           where id = '00000000-0000-0000-0000-00000000aaaa'), 3,
  'the counter advanced once for the one draft (the append allocated nothing)');

-- ===== manual: today's behavior, untouched =====
set local request.jwt.claims to '{}';
update businesses set auto_invoice = 'manual'
 where id = '00000000-0000-0000-0000-00000000aaaa';

insert into visits (id, business_id, client_id, service_id, walker_id, pet_ids,
                    scheduled_start, scheduled_end, business_tz, status, started_at, price_cents_snapshot) values
  ('00000000-0000-0000-0000-0000000000a6', '00000000-0000-0000-0000-00000000aaaa',
   '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000e1',
   '00000000-0000-0000-0000-000000000022', '{}', '2026-08-23 14:00+00', '2026-08-23 14:30+00',
   'America/Chicago', 'in_progress', now() - interval '30 minutes', 1200);

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000022","role":"authenticated"}';

select public.finish_visit('00000000-0000-0000-0000-0000000000a6', null);

select is((select status::text from visits where id = '00000000-0000-0000-0000-0000000000a6'),
  'completed', 'manual mode: the visit completes');

select is((select count(*) from invoices
           where business_id = '00000000-0000-0000-0000-00000000aaaa')::int, 3,
  'manual mode creates no invoice');

select is((select count(*) from audit_log where action = 'invoice.autocreate_failed')::int, 1,
  'manual mode is not an error path — still only the forced failure''s audit row');

-- ===== payout fixtures: July visits, isolated from the flows above by range =====
set local request.jwt.claims to '{}';

-- b1 is the local-date trap: 2026-07-11 03:00 UTC is Jul 10, 22:00 in
-- America/Chicago — a [Jul 1, Jul 10] period must catch it.
-- b3 is out of that range, b4 belongs to walker A2, b5 is not completed.
insert into visits (id, business_id, client_id, service_id, walker_id, pet_ids,
                    scheduled_start, scheduled_end, business_tz, status, price_cents_snapshot) values
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000aaaa',
   '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000e1',
   '00000000-0000-0000-0000-000000000022', '{}', '2026-07-11 03:00+00', '2026-07-11 03:30+00',
   'America/Chicago', 'completed', 3333),
  ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-00000000aaaa',
   '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000e1',
   '00000000-0000-0000-0000-000000000022', '{}', '2026-07-05 14:00+00', '2026-07-05 14:30+00',
   'America/Chicago', 'completed', 2500),
  ('00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-00000000aaaa',
   '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000e1',
   '00000000-0000-0000-0000-000000000022', '{}', '2026-07-20 14:00+00', '2026-07-20 14:30+00',
   'America/Chicago', 'completed', 2000),
  ('00000000-0000-0000-0000-0000000000b4', '00000000-0000-0000-0000-00000000aaaa',
   '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000e1',
   '00000000-0000-0000-0000-000000000023', '{}', '2026-07-05 14:00+00', '2026-07-05 14:30+00',
   'America/Chicago', 'completed', 1000),
  ('00000000-0000-0000-0000-0000000000b5', '00000000-0000-0000-0000-00000000aaaa',
   '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000e1',
   '00000000-0000-0000-0000-000000000022', '{}', '2026-07-06 14:00+00', '2026-07-06 14:30+00',
   'America/Chicago', 'accepted', 4000);

-- ===== create_payout_statement: range, rounding, exclusions =====
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000021","role":"authenticated"}';

insert into pg_temp.ref values ('ps1', public.create_payout_statement(
  '00000000-0000-0000-0000-000000000022', '2026-07-01', '2026-07-10'));

select ok((select status = 'draft'
              and period_start = '2026-07-01' and period_end = '2026-07-10'
           from payout_statements where id = pg_temp.rid('ps1')),
  'the statement drafts with its period stored');

select is((select count(*) from payout_items where statement_id = pg_temp.rid('ps1'))::int, 2,
  'the [Jul 1, Jul 10] LOCAL range picks exactly two visits — the UTC-Jul-11 late walk in, out-of-range/other-walker/uncompleted out');

select is((select amount_cents from payout_items
           where statement_id = pg_temp.rid('ps1')
             and visit_id = '00000000-0000-0000-0000-0000000000b1'), 1083,
  'percent rounding: 3333 × 32.5% = 1083.225 → 1083');

select is((select amount_cents from payout_items
           where statement_id = pg_temp.rid('ps1')
             and visit_id = '00000000-0000-0000-0000-0000000000b2'), 813,
  'percent rounding: 2500 × 32.5% = 812.50 rounds half-up to 813');

select is((select total_cents from payout_statements where id = pg_temp.rid('ps1')), 1896,
  'total_cents is maintained (1083 + 813)');

select ok((select meta @> '{"visit_count": 2, "total_cents": 1896}'
           from audit_log where action = 'payout.create' and entity_id = pg_temp.rid('ps1')),
  'payout.create audited with the money amounts');

-- ===== add_payout_item: signed manual adjustments =====
insert into pg_temp.ref values ('padj', public.add_payout_item(
  pg_temp.rid('ps1'), 'Gas adjustment', -100));

select is((select amount_cents from payout_items where id = pg_temp.rid('padj')), -100,
  'a signed (negative) manual adjustment lands as an item');

select is((select total_cents from payout_statements where id = pg_temp.rid('ps1')), 1796,
  'total_cents recomputed after the adjustment');

select throws_ok($$
  select public.add_payout_item(pg_temp.rid('ps1'), 'nothing', 0)
$$, 'P0001', 'a payout adjustment cannot be zero', 'a zero adjustment is rejected');

select throws_ok($$
  select public.add_payout_item(pg_temp.rid('ps1'), '  ', 500)
$$, 'P0001', 'a payout adjustment needs a description', 'a blank description is rejected');

-- ===== a visit pays out once; void releases =====
insert into pg_temp.ref values ('ps2', public.create_payout_statement(
  '00000000-0000-0000-0000-000000000022', '2026-07-01', '2026-07-31'));

select is((select count(*) from payout_items where statement_id = pg_temp.rid('ps2'))::int, 1,
  'the wider second statement picks only the visit not already on a statement');

select is((select visit_id from payout_items where statement_id = pg_temp.rid('ps2')),
  '00000000-0000-0000-0000-0000000000b3'::uuid, 'that visit is the Jul 20 walk');

select is((select amount_cents from payout_items where statement_id = pg_temp.rid('ps2')), 650,
  '2000 × 32.5% = 650');

select lives_ok($$
  select public.void_payout_statement(pg_temp.rid('ps2'))
$$, 'the owner voids the draft statement');

select is((select count(*) from payout_statements where id = pg_temp.rid('ps2'))::int, 0,
  'voiding removes the draft statement (payout_status has no void label)');

select is((select count(*) from payout_items where statement_id = pg_temp.rid('ps2'))::int, 0,
  'its items are gone — the visits are released');

insert into pg_temp.ref values ('ps3', public.create_payout_statement(
  '00000000-0000-0000-0000-000000000022', '2026-07-20', '2026-07-20'));

select is((select count(*) from payout_items where statement_id = pg_temp.rid('ps3'))::int, 1,
  'the released visit lands on the next statement');

-- ===== status machine: draft -> finalized -> paid, enforced in the RPCs =====
select throws_ok($$
  select public.mark_payout_paid(pg_temp.rid('ps1'))
$$, 'P0001', 'payout statement is not finalized (status: draft)',
  'a draft cannot be marked paid');

select lives_ok($$
  select public.finalize_payout(pg_temp.rid('ps1'))
$$, 'the owner finalizes the statement');

select ok((select status = 'finalized' and finalized_at is not null and total_cents = 1796
           from payout_statements where id = pg_temp.rid('ps1')),
  'finalize stamps finalized_at and the recomputed total');

select throws_ok($$
  select public.add_payout_item(pg_temp.rid('ps1'), 'late tweak', 100)
$$, 'P0001', 'payout statement is not a draft (status: finalized)',
  'a finalized statement''s items are frozen');

select throws_ok($$
  select public.void_payout_statement(pg_temp.rid('ps1'))
$$, 'P0001', 'payout statement is not a draft (status: finalized)',
  'void is draft-only');

select throws_ok($$
  select public.finalize_payout(pg_temp.rid('ps1'))
$$, 'P0001', 'payout statement is not a draft (status: finalized)',
  'finalize is draft-only');

-- ===== walker visibility flip, end-to-end under RLS =====
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000022","role":"authenticated"}';

select is((select count(*) from payout_statements)::int, 1,
  'the walker sees exactly one statement — the finalized own one, not the draft');

select is((select id from payout_statements), pg_temp.rid('ps1'),
  'and it is the finalized statement');

select is((select count(*) from payout_items)::int, 3,
  'its three items are readable through the statement chain');

update payout_statements set total_cents = 999999;
select is((select total_cents from payout_statements where id = pg_temp.rid('ps1')), 1796,
  'the walker''s write attempt matched zero rows (read-only visibility)');

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000023","role":"authenticated"}';

select is((select count(*) from payout_statements)::int, 0,
  'the other walker sees no statements at all');

reset role;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000021","role":"authenticated"}';

select lives_ok($$
  select public.mark_payout_paid(pg_temp.rid('ps1'))
$$, 'the owner marks the finalized statement paid');

select ok((select status = 'paid' and paid_at is not null
           from payout_statements where id = pg_temp.rid('ps1')),
  'paid_at is stamped');

select throws_ok($$
  select public.mark_payout_paid(pg_temp.rid('ps1'))
$$, 'P0001', 'payout statement is not finalized (status: paid)',
  'paid is terminal — marking again raises');

-- ===== guards: the walker is rejected by every payout RPC =====
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000022","role":"authenticated"}';

select throws_ok($$
  select public.create_payout_statement('00000000-0000-0000-0000-000000000022', '2026-07-01', '2026-07-31')
$$, 'P0001', null, 'walker: create_payout_statement rejected');
select throws_ok($$
  select public.add_payout_item(pg_temp.rid('ps3'), 'sneak', 100)
$$, 'P0001', null, 'walker: add_payout_item rejected');
select throws_ok($$
  select public.finalize_payout(pg_temp.rid('ps3'))
$$, 'P0001', null, 'walker: finalize_payout rejected');
select throws_ok($$
  select public.mark_payout_paid(pg_temp.rid('ps1'))
$$, 'P0001', null, 'walker: mark_payout_paid rejected');
select throws_ok($$
  select public.void_payout_statement(pg_temp.rid('ps3'))
$$, 'P0001', null, 'walker: void_payout_statement rejected');

-- ===== guards: the cross-business owner is rejected by every payout RPC =====
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000024","role":"authenticated"}';

select throws_ok($$
  select public.create_payout_statement('00000000-0000-0000-0000-000000000022', '2026-07-01', '2026-07-31')
$$, 'P0001', null, 'cross-owner: create_payout_statement rejected');
select throws_ok($$
  select public.add_payout_item(pg_temp.rid('ps3'), 'sneak', 100)
$$, 'P0001', null, 'cross-owner: add_payout_item rejected');
select throws_ok($$
  select public.finalize_payout(pg_temp.rid('ps3'))
$$, 'P0001', null, 'cross-owner: finalize_payout rejected');
select throws_ok($$
  select public.mark_payout_paid(pg_temp.rid('ps1'))
$$, 'P0001', null, 'cross-owner: mark_payout_paid rejected');
select throws_ok($$
  select public.void_payout_statement(pg_temp.rid('ps3'))
$$, 'P0001', null, 'cross-owner: void_payout_statement rejected');

-- ===== anon cannot even execute =====
set local role anon;

select throws_ok($$
  select public.create_payout_statement('00000000-0000-0000-0000-000000000022', '2026-07-01', '2026-07-31')
$$, '42501', null, 'anon has no execute on create_payout_statement');

reset role;
set local request.jwt.claims to '{}';

-- ===== grants =====
select is(
  (select bool_and(has_function_privilege('authenticated', f, 'execute'))
     from unnest(array[
       'public.create_payout_statement(uuid, date, date)',
       'public.add_payout_item(uuid, text, int)',
       'public.finalize_payout(uuid)',
       'public.mark_payout_paid(uuid)',
       'public.void_payout_statement(uuid)']) f),
  true, 'authenticated can execute every payout RPC');

select is(
  (select bool_or(has_function_privilege('anon', f, 'execute'))
     from unnest(array[
       'public.create_payout_statement(uuid, date, date)',
       'public.add_payout_item(uuid, text, int)',
       'public.finalize_payout(uuid)',
       'public.mark_payout_paid(uuid)',
       'public.void_payout_statement(uuid)']) f),
  false, 'anon can execute none of them');

select ok(
  not has_function_privilege('authenticated', 'public.autoflow_invoice_for_visit(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.autoflow_invoice_for_visit(uuid)', 'execute'),
  'the internal auto-invoice helper is not client-callable');

-- ===== audit accounting =====
select is(
  (select string_agg(action || ':' || n, ',' order by action)
     from (select action, count(*) as n
             from audit_log
            where business_id = '00000000-0000-0000-0000-00000000aaaa'
              and action like 'payout.%'
            group by action) t),
  'payout.create:3,payout.finalize:1,payout.item_add:1,payout.paid:1,payout.void:1',
  'every payout mutation wrote exactly its audit rows');

select ok((select meta @> '{"amount_cents": -100}'
           from audit_log
           where action = 'payout.item_add' and entity_id = pg_temp.rid('padj')),
  'the payout.item_add audit row carries the signed amount');

select * from finish();
rollback;
