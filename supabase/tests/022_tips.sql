begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

-- Round 7: tips. A $30 payment on a $25 invoice = $25 toward the invoice +
-- $5 tip. The invoice closes at exactly its total (no phantom credit), and
-- the tip flows 100% to the walker's payout statement on top of the wage
-- share. A second statement never re-sweeps the same tip.

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000221', 'owner22@test.dev'),
  ('00000000-0000-0000-0000-000000000222', 'walker22@test.dev');
insert into businesses (id, name, slug, time_zone) values
  ('00000000-0000-0000-0000-00000022aaaa', 'Paw 022', 'paw-022', 'America/Chicago');
insert into memberships (business_id, user_id, role, status, payout_percent) values
  ('00000000-0000-0000-0000-00000022aaaa', '00000000-0000-0000-0000-000000000221', 'owner', 'active', 100),
  ('00000000-0000-0000-0000-00000022aaaa', '00000000-0000-0000-0000-000000000222', 'walker', 'active', 75);
insert into clients (id, business_id, name) values
  ('00000000-0000-0000-0000-0000000022c1', '00000000-0000-0000-0000-00000022aaaa', 'Casey 022');
insert into services (id, business_id, name, kind, base_price_cents, duration_min) values
  ('00000000-0000-0000-0000-000000220051', '00000000-0000-0000-0000-00000022aaaa',
   'Walk', 'walk', 2500, 30);
insert into visits (id, business_id, client_id, service_id, walker_id, pet_ids,
                    scheduled_start, scheduled_end, business_tz, status, price_cents_snapshot) values
  ('00000000-0000-0000-0000-000000220071', '00000000-0000-0000-0000-00000022aaaa',
   '00000000-0000-0000-0000-0000000022c1', '00000000-0000-0000-0000-000000220051',
   '00000000-0000-0000-0000-000000000222', '{}',
   '2026-09-03T15:00:00Z', '2026-09-03T15:30:00Z', 'America/Chicago', 'completed', 2500);
insert into invoices (id, business_id, client_id, number, status, issued_on) values
  ('00000000-0000-0000-0000-0000002200b1', '00000000-0000-0000-0000-00000022aaaa',
   '00000000-0000-0000-0000-0000000022c1', 1, 'draft', '2026-09-03');
insert into invoice_items (business_id, invoice_id, visit_id, description, amount_cents, kind) values
  ('00000000-0000-0000-0000-00000022aaaa', '00000000-0000-0000-0000-0000002200b1',
   '00000000-0000-0000-0000-000000220071', 'Walk — Thu, Sep 3', 2500, 'visit');
update invoices set status = 'sent', sent_at = now()
 where id = '00000000-0000-0000-0000-0000002200b1';

-- ===== owner records $25 + $5 tip =====
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000221","role":"authenticated"}';

select lives_ok($$
  select record_payment('00000000-0000-0000-0000-0000002200b1', 'venmo', 2500,
                        '2026-09-03', null, 500)
$$, 'record_payment accepts an invoice amount plus a tip');

select is((select status::text from invoices where id = '00000000-0000-0000-0000-0000002200b1'),
  'paid', 'the invoice closes at exactly its items total — the tip never counts toward it');

select is((select tip_cents from payments
            where invoice_id = '00000000-0000-0000-0000-0000002200b1'), 500,
  'the tip rides the payment row');

-- ===== owed-now shows the pending sweep before any statement exists =====
select results_eq($$
  select wages_cents, tips_cents from walker_owed_now('00000000-0000-0000-0000-00000022aaaa')
   where walker_id = '00000000-0000-0000-0000-000000000222'
$$, $$ values (1875::bigint, 500::bigint) $$,
  'walker_owed_now reports 75% wages + full tip before any statement');

-- ===== payout statement: wage share + 100% of the tip =====
select lives_ok($$
  select create_payout_statement('00000000-0000-0000-0000-000000000222',
                                 '2026-09-01', '2026-09-07')
$$, 'statement creation sweeps the period');

select is((select total_cents from payout_statements
            where walker_id = '00000000-0000-0000-0000-000000000222'
            order by created_at desc limit 1),
  2375, 'total = 75% wage on $25 (1875) + 100% of the $5 tip (500)');

-- ===== a second statement never re-sweeps =====
-- (Two statements: a same-statement subselect can't see rows the volatile
-- function inserts — statement snapshot.)
select lives_ok($$
  select create_payout_statement('00000000-0000-0000-0000-000000000222',
                                 '2026-09-01', '2026-09-07')
$$, 'a second sweep over the same period runs');
select is((select sum(total_cents)::int from payout_statements
            where walker_id = '00000000-0000-0000-0000-000000000222'),
  2375, 'visits and tips are claimed once — the second statement added nothing');

select results_eq($$
  select wages_cents, tips_cents from walker_owed_now('00000000-0000-0000-0000-00000022aaaa')
   where walker_id = '00000000-0000-0000-0000-000000000222'
$$, $$ values (0::bigint, 0::bigint) $$,
  'after the sweep, owed-now drops to zero');

set local request.jwt.claims to '{}';

select * from finish();
rollback;
