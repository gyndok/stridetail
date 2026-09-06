begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

-- Money-review fix A (2026-09-05): walker_owed_now must report the COMPLETE
-- unpaid balance — un-statemented wages + unclaimed tips + unpaid statement
-- balances — with the invariant that drafting/finalizing a statement only
-- moves money between columns; only marking it paid reduces the total. Also:
-- a removed walker with an unpaid statement stays visible (frozen statement
-- totals, null percent, no invented wages).

-- ===== fixtures =====
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000251', 'owner25@test.dev'),
  ('00000000-0000-0000-0000-000000000252', 'walker25@test.dev'),
  ('00000000-0000-0000-0000-000000000253', 'walker25b@test.dev');
insert into businesses (id, name, slug, time_zone, auto_invoice) values
  ('00000000-0000-0000-0000-00000025aaaa', 'Paw 025', 'paw-025', 'America/Chicago', 'manual');
insert into memberships (id, business_id, user_id, role, status, payout_percent) values
  ('00000000-0000-0000-0000-0000002500a1', '00000000-0000-0000-0000-00000025aaaa',
   '00000000-0000-0000-0000-000000000251', 'owner', 'active', 100),
  ('00000000-0000-0000-0000-0000002500a2', '00000000-0000-0000-0000-00000025aaaa',
   '00000000-0000-0000-0000-000000000252', 'walker', 'active', 75),
  ('00000000-0000-0000-0000-0000002500a3', '00000000-0000-0000-0000-00000025aaaa',
   '00000000-0000-0000-0000-000000000253', 'walker', 'active', 60);
insert into clients (id, business_id, name, phones, email) values
  ('00000000-0000-0000-0000-0000000025c1', '00000000-0000-0000-0000-00000025aaaa',
   'Casey 025', '{}', null);
insert into services (id, business_id, name, kind, base_price_cents, duration_min) values
  ('00000000-0000-0000-0000-000000250051', '00000000-0000-0000-0000-00000025aaaa',
   'Walk', 'walk', 2500, 30);
-- Walker A (75%): v1, v2 completed two days ago at $25 each.
-- Walker B (60%): v3 completed two days ago at $20 (goes on a statement),
--                 v4 completed today at $20 (outside the statement period).
insert into visits (id, business_id, client_id, service_id, walker_id, pet_ids,
                    scheduled_start, scheduled_end, business_tz, status, price_cents_snapshot) values
  ('00000000-0000-0000-0000-000000250071', '00000000-0000-0000-0000-00000025aaaa',
   '00000000-0000-0000-0000-0000000025c1', '00000000-0000-0000-0000-000000250051',
   '00000000-0000-0000-0000-000000000252', '{}',
   now() - interval '2 days', now() - interval '2 days' + interval '30 minutes',
   'America/Chicago', 'completed', 2500),
  ('00000000-0000-0000-0000-000000250072', '00000000-0000-0000-0000-00000025aaaa',
   '00000000-0000-0000-0000-0000000025c1', '00000000-0000-0000-0000-000000250051',
   '00000000-0000-0000-0000-000000000252', '{}',
   now() - interval '2 days', now() - interval '2 days' + interval '30 minutes',
   'America/Chicago', 'completed', 2500),
  ('00000000-0000-0000-0000-000000250073', '00000000-0000-0000-0000-00000025aaaa',
   '00000000-0000-0000-0000-0000000025c1', '00000000-0000-0000-0000-000000250051',
   '00000000-0000-0000-0000-000000000253', '{}',
   now() - interval '2 days', now() - interval '2 days' + interval '30 minutes',
   'America/Chicago', 'completed', 2000),
  ('00000000-0000-0000-0000-000000250074', '00000000-0000-0000-0000-00000025aaaa',
   '00000000-0000-0000-0000-0000000025c1', '00000000-0000-0000-0000-000000250051',
   '00000000-0000-0000-0000-000000000253', '{}',
   now(), now() + interval '30 minutes',
   'America/Chicago', 'completed', 2000);
-- A $25 invoice for v1 (all lines walker A) paid with a $10 tip.
insert into invoices (id, business_id, client_id, number, status, issued_on, sent_at) values
  ('00000000-0000-0000-0000-0000002500b1', '00000000-0000-0000-0000-00000025aaaa',
   '00000000-0000-0000-0000-0000000025c1', 1, 'sent', (now() - interval '2 days')::date, now());
insert into invoice_items (business_id, invoice_id, visit_id, description, amount_cents, kind) values
  ('00000000-0000-0000-0000-00000025aaaa', '00000000-0000-0000-0000-0000002500b1',
   '00000000-0000-0000-0000-000000250071', 'Walk', 2500, 'visit');
insert into payments (business_id, invoice_id, method, amount_cents, received_on, tip_cents) values
  ('00000000-0000-0000-0000-00000025aaaa', '00000000-0000-0000-0000-0000002500b1',
   'venmo', 2500, (now() - interval '2 days')::date, 1000);

-- ===== as the owner =====
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000251","role":"authenticated"}';

-- Baseline for walker A: 2 × round(2500 × 75%) = 3750 wages, $10 tip, no statements.
select is((select o.wages_cents from walker_owed_now('00000000-0000-0000-0000-00000025aaaa') o
            where o.walker_id = '00000000-0000-0000-0000-000000000252'), 3750::bigint,
  'un-statemented wages: two completed visits at the payout percent');
select is((select o.tips_cents from walker_owed_now('00000000-0000-0000-0000-00000025aaaa') o
            where o.walker_id = '00000000-0000-0000-0000-000000000252'), 1000::bigint,
  'unclaimed tip counted for the walker whose visits fill the invoice');
select is((select o.statement_cents from walker_owed_now('00000000-0000-0000-0000-00000025aaaa') o
            where o.walker_id = '00000000-0000-0000-0000-000000000252'), 0::bigint,
  'no statements yet — statement_cents starts at zero');

-- Draft a statement sweeping BOTH visits and the tip: the money must MOVE
-- columns (wages/tips -> statement), never shrink.
select lives_ok(
  $$select create_payout_statement('00000000-0000-0000-0000-000000000252',
      (now() at time zone 'America/Chicago')::date - 30,
      (now() at time zone 'America/Chicago')::date)$$,
  'owner drafts a statement for walker A');
select is((select o.wages_cents + o.tips_cents
             from walker_owed_now('00000000-0000-0000-0000-00000025aaaa') o
            where o.walker_id = '00000000-0000-0000-0000-000000000252'), 0::bigint,
  'drafting sweeps the loose wages and tip onto the statement');
select is((select o.wages_cents + o.tips_cents + o.statement_cents
             from walker_owed_now('00000000-0000-0000-0000-00000025aaaa') o
            where o.walker_id = '00000000-0000-0000-0000-000000000252'), 4750::bigint,
  'INVARIANT: drafting a statement does not change the total owed');

select finalize_payout((select ps.id from payout_statements ps
  where ps.walker_id = '00000000-0000-0000-0000-000000000252'));
select is((select o.wages_cents + o.tips_cents + o.statement_cents
             from walker_owed_now('00000000-0000-0000-0000-00000025aaaa') o
            where o.walker_id = '00000000-0000-0000-0000-000000000252'), 4750::bigint,
  'INVARIANT: finalizing does not change the total owed');

select mark_payout_paid((select ps.id from payout_statements ps
  where ps.walker_id = '00000000-0000-0000-0000-000000000252'));
select is((select o.wages_cents + o.tips_cents + o.statement_cents
             from walker_owed_now('00000000-0000-0000-0000-00000025aaaa') o
            where o.walker_id = '00000000-0000-0000-0000-000000000252'), 0::bigint,
  'only marking the statement PAID settles the balance');

-- ===== a removed walker's unpaid statement stays visible =====
-- Statement covers only v3 (v4 is today, outside the period), then walker B
-- leaves the team (remove_walker DELETES the membership row).
select create_payout_statement('00000000-0000-0000-0000-000000000253',
  (now() at time zone 'America/Chicago')::date - 30,
  (now() at time zone 'America/Chicago')::date - 1);
select remove_walker('00000000-0000-0000-0000-0000002500a3');

select is((select o.statement_cents from walker_owed_now('00000000-0000-0000-0000-00000025aaaa') o
            where o.walker_id = '00000000-0000-0000-0000-000000000253'), 1200::bigint,
  'a removed walker with an unpaid statement is still listed with its frozen total');
select ok((select o.payout_percent is null and o.wages_cents = 0
             from walker_owed_now('00000000-0000-0000-0000-00000025aaaa') o
            where o.walker_id = '00000000-0000-0000-0000-000000000253'),
  'departed walker: no membership rate, so no percent and no invented wages');

select * from finish();
rollback;
