begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

-- Transactions page, walker side (2026-09-05): walker_ledger returns every
-- money line — frozen statement items, unswept wages at the current percent,
-- unclaimed tips, and paid statements. The invariant this file pins:
--   sum(earned kinds) − sum(payout) = walker_owed_now total
-- so the statement page, the owed-now card, and the payout flow can never
-- disagree about a walker's money.

-- ===== fixtures (025 pattern) =====
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000261', 'owner26@test.dev'),
  ('00000000-0000-0000-0000-000000000262', 'walker26@test.dev');
insert into businesses (id, name, slug, time_zone, auto_invoice) values
  ('00000000-0000-0000-0000-00000026aaaa', 'Paw 026', 'paw-026', 'America/Chicago', 'manual');
insert into memberships (business_id, user_id, role, status, payout_percent) values
  ('00000000-0000-0000-0000-00000026aaaa', '00000000-0000-0000-0000-000000000261', 'owner', 'active', 100),
  ('00000000-0000-0000-0000-00000026aaaa', '00000000-0000-0000-0000-000000000262', 'walker', 'active', 75);
insert into clients (id, business_id, name, phones, email) values
  ('00000000-0000-0000-0000-0000000026c1', '00000000-0000-0000-0000-00000026aaaa',
   'Casey 026', '{}', null);
insert into services (id, business_id, name, kind, base_price_cents, duration_min) values
  ('00000000-0000-0000-0000-000000260051', '00000000-0000-0000-0000-00000026aaaa',
   'Walk', 'walk', 2500, 30);
-- v1: completed 2 days ago (goes on a statement); v2: completed today (unswept).
insert into visits (id, business_id, client_id, service_id, walker_id, pet_ids,
                    scheduled_start, scheduled_end, business_tz, status, price_cents_snapshot) values
  ('00000000-0000-0000-0000-000000260071', '00000000-0000-0000-0000-00000026aaaa',
   '00000000-0000-0000-0000-0000000026c1', '00000000-0000-0000-0000-000000260051',
   '00000000-0000-0000-0000-000000000262', '{}',
   now() - interval '2 days', now() - interval '2 days' + interval '30 minutes',
   'America/Chicago', 'completed', 2500),
  ('00000000-0000-0000-0000-000000260072', '00000000-0000-0000-0000-00000026aaaa',
   '00000000-0000-0000-0000-0000000026c1', '00000000-0000-0000-0000-000000260051',
   '00000000-0000-0000-0000-000000000262', '{}',
   now(), now() + interval '30 minutes',
   'America/Chicago', 'completed', 2500);
-- Invoice+tip for v1 (claimed by the statement) and for v2 (stays unclaimed).
insert into invoices (id, business_id, client_id, number, status, issued_on, sent_at) values
  ('00000000-0000-0000-0000-0000002600b1', '00000000-0000-0000-0000-00000026aaaa',
   '00000000-0000-0000-0000-0000000026c1', 1, 'sent', (now() - interval '2 days')::date, now()),
  ('00000000-0000-0000-0000-0000002600b2', '00000000-0000-0000-0000-00000026aaaa',
   '00000000-0000-0000-0000-0000000026c1', 2, 'sent', now()::date, now());
insert into invoice_items (business_id, invoice_id, visit_id, description, amount_cents, kind) values
  ('00000000-0000-0000-0000-00000026aaaa', '00000000-0000-0000-0000-0000002600b1',
   '00000000-0000-0000-0000-000000260071', 'Walk', 2500, 'visit'),
  ('00000000-0000-0000-0000-00000026aaaa', '00000000-0000-0000-0000-0000002600b2',
   '00000000-0000-0000-0000-000000260072', 'Walk', 2500, 'visit');
insert into payments (business_id, invoice_id, method, amount_cents, received_on, tip_cents) values
  ('00000000-0000-0000-0000-00000026aaaa', '00000000-0000-0000-0000-0000002600b1',
   'venmo', 2500, (now() - interval '2 days')::date, 1000),
  ('00000000-0000-0000-0000-00000026aaaa', '00000000-0000-0000-0000-0000002600b2',
   'venmo', 2500, now()::date, 500);

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000261","role":"authenticated"}';

-- Statement over v1's period only: sweeps v1's wage + the $10 tip, then paid.
select create_payout_statement('00000000-0000-0000-0000-000000000262',
  (now() at time zone 'America/Chicago')::date - 30,
  (now() at time zone 'America/Chicago')::date - 1);
select finalize_payout((select ps.id from payout_statements ps
  where ps.walker_id = '00000000-0000-0000-0000-000000000262'));
select mark_payout_paid((select ps.id from payout_statements ps
  where ps.walker_id = '00000000-0000-0000-0000-000000000262'));

-- ===== ledger shape =====
select is((select count(*)::int from walker_ledger(
    '00000000-0000-0000-0000-00000026aaaa', '00000000-0000-0000-0000-000000000262') l
   where l.kind = 'wage'), 2,
  'two wage rows: one frozen statement item, one unswept visit');
select is((select l.amount_cents from walker_ledger(
    '00000000-0000-0000-0000-00000026aaaa', '00000000-0000-0000-0000-000000000262') l
   where l.kind = 'wage' and l.statement_id is null), 1875::bigint,
  'the unswept visit earns round(2500 × 75%) at the current percent');
select is((select count(*)::int from walker_ledger(
    '00000000-0000-0000-0000-00000026aaaa', '00000000-0000-0000-0000-000000000262') l
   where l.kind = 'tip'), 2,
  'two tip rows: the statement-frozen $10 and the unclaimed $5');
select is((select l.amount_cents from walker_ledger(
    '00000000-0000-0000-0000-00000026aaaa', '00000000-0000-0000-0000-000000000262') l
   where l.kind = 'tip' and l.statement_id is null), 500::bigint,
  'the unclaimed tip rides at 100%');
select is((select l.amount_cents from walker_ledger(
    '00000000-0000-0000-0000-00000026aaaa', '00000000-0000-0000-0000-000000000262') l
   where l.kind = 'payout'), 2875::bigint,
  'the paid statement appears once, at its frozen total (1875 wage + 1000 tip)');
select is((select count(*)::int from walker_ledger(
    '00000000-0000-0000-0000-00000026aaaa', '00000000-0000-0000-0000-000000000262') l
   where l.kind = 'adjustment'), 0,
  'no adjustments were added, none invented');

-- ===== INVARIANT: earned − paid == owed now =====
select is(
  (select (coalesce(sum(l.amount_cents) filter (where l.kind in ('wage','tip','adjustment')), 0)
        - coalesce(sum(l.amount_cents) filter (where l.kind = 'payout'), 0))::bigint
     from walker_ledger('00000000-0000-0000-0000-00000026aaaa',
                        '00000000-0000-0000-0000-000000000262') l),
  (select o.wages_cents + o.tips_cents + o.statement_cents
     from walker_owed_now('00000000-0000-0000-0000-00000026aaaa') o
    where o.walker_id = '00000000-0000-0000-0000-000000000262'),
  'INVARIANT: ledger earned minus paid equals the owed-now total');

-- ===== owner-gated =====
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000262","role":"authenticated"}';
select throws_ok(
  $$select * from walker_ledger('00000000-0000-0000-0000-00000026aaaa',
                                '00000000-0000-0000-0000-000000000262')$$,
  'only the business owner can view walker ledgers',
  'a walker cannot read ledgers, not even their own');

select * from finish();
rollback;
