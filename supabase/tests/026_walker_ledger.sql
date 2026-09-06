begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

-- Walker ledger + financial-correctness round 2 (2026-09-06 review).
-- Invariants pinned here:
--   • sum(earned kinds) − sum(payout) = walker_owed_now total
--   • rate changes NEVER rewrite completed earnings (payout_percent_snapshot)
--   • a swept tip keeps its payment's date across sweep/finalize/paid
--   • adjustments are structural — a tip-shaped description cannot fake one
--   • removing a walker preserves and keeps PAYABLE everything they earned

-- ===== fixtures =====
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
-- v1: completed 2 days ago (goes on statement #1); v2: completed today.
-- Both carry the completion-time rate snapshot, as finish_visit now stamps.
insert into visits (id, business_id, client_id, service_id, walker_id, pet_ids,
                    scheduled_start, scheduled_end, business_tz, status, price_cents_snapshot,
                    payout_percent_snapshot) values
  ('00000000-0000-0000-0000-000000260071', '00000000-0000-0000-0000-00000026aaaa',
   '00000000-0000-0000-0000-0000000026c1', '00000000-0000-0000-0000-000000260051',
   '00000000-0000-0000-0000-000000000262', '{}',
   now() - interval '2 days', now() - interval '2 days' + interval '30 minutes',
   'America/Chicago', 'completed', 2500, 75),
  ('00000000-0000-0000-0000-000000260072', '00000000-0000-0000-0000-00000026aaaa',
   '00000000-0000-0000-0000-0000000026c1', '00000000-0000-0000-0000-000000260051',
   '00000000-0000-0000-0000-000000000262', '{}',
   now(), now() + interval '30 minutes',
   'America/Chicago', 'completed', 2500, 75);
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

-- Statement #1 over v1's period: sweeps v1's wage + the $10 tip, then paid.
select create_payout_statement('00000000-0000-0000-0000-000000000262',
  (now() at time zone 'America/Chicago')::date - 30,
  (now() at time zone 'America/Chicago')::date - 1);
select finalize_payout((select ps.id from payout_statements ps
  where ps.walker_id = '00000000-0000-0000-0000-000000000262'));
select mark_payout_paid((select ps.id from payout_statements ps
  where ps.walker_id = '00000000-0000-0000-0000-000000000262'));

-- ===== 1-8: ledger shape (round-1 assertions, snapshot-backed now) =====
select is((select count(*)::int from walker_ledger(
    '00000000-0000-0000-0000-00000026aaaa', '00000000-0000-0000-0000-000000000262') l
   where l.kind = 'wage'), 2,
  'two wage rows: one frozen statement item, one unswept visit');
select is((select l.amount_cents from walker_ledger(
    '00000000-0000-0000-0000-00000026aaaa', '00000000-0000-0000-0000-000000000262') l
   where l.kind = 'wage' and l.statement_id is null), 1875::bigint,
  'the unswept visit earns round(2500 × 75%) from its snapshot');
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
  'the paid statement appears once, at its frozen total');
select is((select count(*)::int from walker_ledger(
    '00000000-0000-0000-0000-00000026aaaa', '00000000-0000-0000-0000-000000000262') l
   where l.kind = 'adjustment'), 0,
  'no adjustments were added, none invented');
select is(
  (select (coalesce(sum(l.amount_cents) filter (where l.kind in ('wage','tip','adjustment')), 0)
        - coalesce(sum(l.amount_cents) filter (where l.kind = 'payout'), 0))::bigint
     from walker_ledger('00000000-0000-0000-0000-00000026aaaa',
                        '00000000-0000-0000-0000-000000000262') l),
  (select o.wages_cents + o.tips_cents + o.statement_cents
     from walker_owed_now('00000000-0000-0000-0000-00000026aaaa') o
    where o.walker_id = '00000000-0000-0000-0000-000000000262'),
  'INVARIANT: ledger earned minus paid equals the owed-now total');
select is((select at::date from walker_ledger(
    '00000000-0000-0000-0000-00000026aaaa', '00000000-0000-0000-0000-000000000262') l
   where l.kind = 'tip' and l.statement_id is not null),
  (now() - interval '2 days')::date,
  'FINDING 3: a swept tip is dated by its PAYMENT, not the statement sweep');

-- ===== 9-11: FINDING 2 — a rate change cannot rewrite history =====
update memberships set payout_percent = 80
 where business_id = '00000000-0000-0000-0000-00000026aaaa'
   and user_id = '00000000-0000-0000-0000-000000000262';
select is((select l.amount_cents from walker_ledger(
    '00000000-0000-0000-0000-00000026aaaa', '00000000-0000-0000-0000-000000000262') l
   where l.kind = 'wage' and l.statement_id is null), 1875::bigint,
  'FINDING 2: 75→80 rate change leaves the completed visit at its 75% snapshot');
select is((select o.wages_cents from walker_owed_now('00000000-0000-0000-0000-00000026aaaa') o
            where o.walker_id = '00000000-0000-0000-0000-000000000262'), 1875::bigint,
  'FINDING 2: owed-now agrees — no retroactive re-pricing');
select create_payout_statement('00000000-0000-0000-0000-000000000262',
  (now() at time zone 'America/Chicago')::date,
  (now() at time zone 'America/Chicago')::date);
select is((select pi.amount_cents::bigint from payout_items pi
            join payout_statements ps on ps.id = pi.statement_id
           where ps.status = 'draft' and pi.visit_id is not null), 1875::bigint,
  'FINDING 2: statement creation also pays the snapshot rate, not today''s');

-- ===== 12-13: structural kinds =====
select add_payout_item((select ps.id from payout_statements ps where ps.status = 'draft'),
  'Tip — sneaky', 100);
select is((select count(*)::int from walker_ledger(
    '00000000-0000-0000-0000-00000026aaaa', '00000000-0000-0000-0000-000000000262') l
   where l.kind = 'adjustment'), 1,
  'an adjustment DESCRIBED like a tip is still an adjustment (no text heuristics)');
select is((select count(*)::int from walker_ledger(
    '00000000-0000-0000-0000-00000026aaaa', '00000000-0000-0000-0000-000000000262') l
   where l.kind = 'tip'), 2,
  'tip count is unchanged by the tip-shaped adjustment');

-- ===== 14-16: FINDING 1 — removal preserves and keeps everything payable ==
select remove_walker((select m.id from memberships m
  where m.user_id = '00000000-0000-0000-0000-000000000262' and m.role = 'walker'));
select is((select o.statement_cents from walker_owed_now('00000000-0000-0000-0000-00000026aaaa') o
            where o.walker_id = '00000000-0000-0000-0000-000000000262'), 2475::bigint,
  'after removal the draft statement (wage+tip+adjustment) stays visible');
select void_payout_statement((select ps.id from payout_statements ps where ps.status = 'draft'));
select is((select o.wages_cents + o.tips_cents + o.statement_cents
             from walker_owed_now('00000000-0000-0000-0000-00000026aaaa') o
            where o.walker_id = '00000000-0000-0000-0000-000000000262'), 2375::bigint,
  'voiding the draft releases snapshot wages + tip — nothing vanishes for a FORMER walker');
select create_payout_statement('00000000-0000-0000-0000-000000000262',
  (now() at time zone 'America/Chicago')::date,
  (now() at time zone 'America/Chicago')::date);
select is((select ps.total_cents::bigint from payout_statements ps where ps.status = 'draft'),
  2375::bigint,
  'FINDING 1: a former walker with no membership row is still PAYABLE at the snapshot rate');

-- ===== 17: the central invariant survives all of the above =====
select is(
  (select (coalesce(sum(l.amount_cents) filter (where l.kind in ('wage','tip','adjustment')), 0)
        - coalesce(sum(l.amount_cents) filter (where l.kind = 'payout'), 0))::bigint
     from walker_ledger('00000000-0000-0000-0000-00000026aaaa',
                        '00000000-0000-0000-0000-000000000262') l),
  (select o.wages_cents + o.tips_cents + o.statement_cents
     from walker_owed_now('00000000-0000-0000-0000-00000026aaaa') o
    where o.walker_id = '00000000-0000-0000-0000-000000000262'),
  'INVARIANT holds after rate change, removal, void, and re-statement');

-- ===== 18: owner-gated, even for the walker themself =====
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000262","role":"authenticated"}';
select throws_ok(
  $$select * from walker_ledger('00000000-0000-0000-0000-00000026aaaa',
                                '00000000-0000-0000-0000-000000000262')$$,
  'only the business owner can view walker ledgers',
  'a walker cannot read ledgers, not even their own');

select * from finish();
rollback;
