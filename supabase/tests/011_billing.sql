begin;
create extension if not exists pgtap with schema extensions;
select plan(60);

-- fixtures: owner A + two walkers in business A, owner B in business B. Fixed uuids so
-- cross-walker/cross-business failure tests can target real row ids (002/003/005/007 style).
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000021', 'owner-a@test.dev'),
  ('00000000-0000-0000-0000-000000000022', 'walker-a1@test.dev'),
  ('00000000-0000-0000-0000-000000000023', 'walker-a2@test.dev'),
  ('00000000-0000-0000-0000-000000000024', 'owner-b@test.dev');

insert into businesses (id, name, slug, time_zone) values
  ('00000000-0000-0000-0000-00000000aaaa', 'Paw & Whisker', 'paw-whisker-011', 'America/Chicago'),
  ('00000000-0000-0000-0000-00000000bbbb', 'Other Dogs Co', 'other-dogs-011', 'America/New_York');

insert into memberships (business_id, user_id, role, status) values
  ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-000000000021', 'owner', 'active'),
  ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-000000000022', 'walker', 'active'),
  ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-000000000023', 'walker', 'active'),
  ('00000000-0000-0000-0000-00000000bbbb', '00000000-0000-0000-0000-000000000024', 'owner', 'active');

insert into clients (id, business_id, name) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000aaaa', 'Dana Harper'),
  ('00000000-0000-0000-0000-0000000000c9', '00000000-0000-0000-0000-00000000bbbb', 'Remote Client');

insert into services (id, business_id, name, kind, base_price_cents, extra_pet_price_cents, duration_min, requires_gps) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-00000000aaaa', 'Walk', 'walk', 2500, 500, 30, true);

-- Completed visits: f1 (walker A1, 2500) and f2 (walker A2, 3000) feed both the
-- invoice-item and payout-item visit links (separate unique indexes — the same visit
-- may legally appear once in each table). Fixture inserts take any status directly:
-- the transition guards are UPDATE triggers.
insert into visits (id, business_id, client_id, service_id, walker_id, pet_ids,
                    scheduled_start, scheduled_end, business_tz, status, price_cents_snapshot) values
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000aaaa',
   '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000e1',
   '00000000-0000-0000-0000-000000000022', '{}', '2026-08-20 14:00+00', '2026-08-20 14:30+00',
   'America/Chicago', 'completed', 2500),
  ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-00000000aaaa',
   '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000e1',
   '00000000-0000-0000-0000-000000000023', '{}', '2026-08-21 14:00+00', '2026-08-21 14:30+00',
   'America/Chicago', 'completed', 3000);

-- Payout fixtures (superuser): ps1 = walker A1 FINALIZED (visible to A1),
-- ps2 = walker A1 DRAFT (invisible to A1), ps3 = walker A2 finalized (invisible to A1).
insert into payout_statements (id, business_id, walker_id, period_start, period_end, status, total_cents, finalized_at) values
  ('00000000-0000-0000-0000-000000000141', '00000000-0000-0000-0000-00000000aaaa',
   '00000000-0000-0000-0000-000000000022', '2026-08-17', '2026-08-23', 'finalized', 2000, now()),
  ('00000000-0000-0000-0000-000000000142', '00000000-0000-0000-0000-00000000aaaa',
   '00000000-0000-0000-0000-000000000022', '2026-08-24', '2026-08-30', 'draft', 0, null),
  ('00000000-0000-0000-0000-000000000143', '00000000-0000-0000-0000-00000000aaaa',
   '00000000-0000-0000-0000-000000000023', '2026-08-17', '2026-08-23', 'finalized', 1500, now());

insert into payout_items (id, business_id, statement_id, visit_id, description, amount_cents) values
  ('00000000-0000-0000-0000-000000000151', '00000000-0000-0000-0000-00000000aaaa',
   '00000000-0000-0000-0000-000000000141', '00000000-0000-0000-0000-0000000000f1', 'Walk 8/20', 2000),
  ('00000000-0000-0000-0000-000000000152', '00000000-0000-0000-0000-00000000aaaa',
   '00000000-0000-0000-0000-000000000141', null, 'Adjustment', -250),
  ('00000000-0000-0000-0000-000000000153', '00000000-0000-0000-0000-00000000aaaa',
   '00000000-0000-0000-0000-000000000142', null, 'Draft line', 100),
  ('00000000-0000-0000-0000-000000000154', '00000000-0000-0000-0000-00000000aaaa',
   '00000000-0000-0000-0000-000000000143', '00000000-0000-0000-0000-0000000000f2', 'Walk 8/21', 1500);

-- An invoice on number 900 so the per-business number uniqueness can be probed.
insert into invoices (id, business_id, client_id, number, status, issued_on) values
  ('00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-00000000aaaa',
   '00000000-0000-0000-0000-0000000000c1', 900, 'draft', '2026-08-25');

-- ===== enums, columns, defaults, sanity checks =====
select enum_has_labels('public', 'invoice_status', array['draft', 'sent', 'paid', 'void'],
  'invoice_status carries exactly draft/sent/paid/void');
select enum_has_labels('public', 'deposit_status',
  array['requested', 'held', 'applied', 'refunded', 'forfeited'],
  'deposit_status carries the five ledger states');
select enum_has_labels('public', 'payment_method', array['venmo', 'zelle', 'cash', 'check', 'other'],
  'payment_method carries the five manual methods');
select enum_has_labels('public', 'payout_status', array['draft', 'finalized', 'paid'],
  'payout_status carries draft/finalized/paid');

select has_column('public', 'businesses', 'payment_instructions_md',
  'businesses.payment_instructions_md exists (public invoice page copy)');

select is((select invoice_next_number from businesses
           where id = '00000000-0000-0000-0000-00000000aaaa'), 1,
  'businesses.invoice_next_number defaults to 1');

select is((select payout_percent from memberships
           where business_id = '00000000-0000-0000-0000-00000000aaaa'
             and user_id = '00000000-0000-0000-0000-000000000022'), 0::numeric,
  'memberships.payout_percent defaults to 0');

select throws_ok($$
  update memberships set payout_percent = 150
  where business_id = '00000000-0000-0000-0000-00000000aaaa'
    and user_id = '00000000-0000-0000-0000-000000000022'
$$, '23514', null, 'payout_percent above 100 is rejected (bounds check)');

select lives_ok($$
  update memberships set payout_percent = 35.50
  where business_id = '00000000-0000-0000-0000-00000000aaaa'
    and user_id = '00000000-0000-0000-0000-000000000022'
$$, 'payout_percent takes a two-decimal percentage');

select throws_ok($$
  insert into payout_statements (business_id, walker_id, period_start, period_end)
  values ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-000000000022',
          '2026-09-07', '2026-09-01')
$$, '23514', null, 'a payout period cannot end before it starts');

select throws_ok($$
  insert into invoices (business_id, client_id, number, issued_on)
  values ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-0000000000c1',
          900, '2026-08-25')
$$, '23505', null, 'invoice numbers are unique per business');

-- ===== owner A: full CRUD on billing tables under RLS =====
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000021","role":"authenticated"}';

select lives_ok($$
  insert into invoices (id, business_id, client_id, number, issued_on, due_on, notes_md)
  values ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-00000000aaaa',
          '00000000-0000-0000-0000-0000000000c1', 1, '2026-08-25', '2026-09-08', 'August sittings')
$$, 'owner can insert a draft invoice');

select lives_ok($$
  insert into invoice_items (id, business_id, invoice_id, visit_id, description, amount_cents, kind)
  values ('00000000-0000-0000-0000-000000000111', '00000000-0000-0000-0000-00000000aaaa',
          '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-0000000000f1',
          'Walk 8/20', 2500, 'visit'),
         ('00000000-0000-0000-0000-000000000112', '00000000-0000-0000-0000-00000000aaaa',
          '00000000-0000-0000-0000-000000000101', null, 'Loyalty discount', -500, 'manual')
$$, 'owner can insert visit and negative manual line items');

select throws_ok($$
  insert into invoice_items (business_id, invoice_id, visit_id, description, amount_cents, kind)
  values ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-000000000101',
          '00000000-0000-0000-0000-0000000000f1', 'Walk 8/20 again', 2500, 'visit')
$$, '23505', null, 'a visit can be invoiced exactly once (unique partial index)');

select lives_ok($$
  insert into invoice_items (business_id, invoice_id, description, amount_cents, kind)
  values ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-000000000101',
          'Weekend surcharge', 300, 'manual'),
         ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-000000000101',
          'Tip received', 500, 'manual')
$$, 'the index is partial: any number of visit-less manual lines may coexist');

select throws_ok($$
  insert into invoice_items (business_id, invoice_id, description, amount_cents, kind)
  values ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-000000000101',
          'Mystery line', 100, 'bogus')
$$, '23514', null, 'invoice_items.kind allows only visit/manual/deposit_credit');

select lives_ok($$
  insert into deposits (id, business_id, client_id, amount_cents, status, method, received_on, memo)
  values ('00000000-0000-0000-0000-000000000121', '00000000-0000-0000-0000-00000000aaaa',
          '00000000-0000-0000-0000-0000000000c1', 5000, 'held', 'venmo', '2026-08-24', 'Sitting deposit')
$$, 'owner can record a held deposit');

select throws_ok($$
  insert into deposits (business_id, client_id, amount_cents, status)
  values ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-0000000000c1',
          0, 'requested')
$$, '23514', null, 'a deposit must be a positive amount');

select lives_ok($$
  insert into payments (id, business_id, invoice_id, method, amount_cents, received_on, memo)
  values ('00000000-0000-0000-0000-000000000131', '00000000-0000-0000-0000-00000000aaaa',
          '00000000-0000-0000-0000-000000000101', 'venmo', 1000, '2026-08-25', 'partial')
$$, 'owner can record a payment against an invoice');

select throws_ok($$
  insert into payments (business_id, invoice_id, method, amount_cents, received_on)
  values ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-000000000101',
          'cash', -100, '2026-08-25')
$$, '23514', null, 'a payment must be a positive amount');

select is((select count(id) from invoices)::int, 2, 'owner sees all own-business invoices');

select is((select count(id) from payout_statements)::int, 3,
  'owner sees every payout statement, drafts included');

select is((select count(id) from payout_items)::int, 4, 'owner sees every payout item');

-- Legal transitions through RLS (the guard trigger sees the owner JWT).
select lives_ok($$
  update invoices set status = 'sent', sent_at = now()
  where id = '00000000-0000-0000-0000-000000000101'
$$, 'owner can move a draft invoice to sent');

select is((select status::text from invoices where id = '00000000-0000-0000-0000-000000000101'),
  'sent', 'the invoice is sent');

select lives_ok($$
  update invoices set status = 'paid', paid_at = now()
  where id = '00000000-0000-0000-0000-000000000101'
$$, 'owner can move a sent invoice to paid');

select throws_ok($$
  update invoices set status = 'void' where id = '00000000-0000-0000-0000-000000000101'
$$, 'P0001', 'illegal invoice status transition: paid -> void',
  'a paid invoice cannot be voided');

-- ===== walker A1: blind to invoices/items/deposits/payments; own finalized payout only =====
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000022","role":"authenticated"}';

select is((select count(id) from invoices)::int, 0, 'walker sees zero invoices');
select is((select count(id) from invoice_items)::int, 0, 'walker sees zero invoice items');
select is((select count(id) from deposits)::int, 0, 'walker sees zero deposits');
select is((select count(id) from payments)::int, 0, 'walker sees zero payments');

select throws_ok($$
  insert into invoices (business_id, client_id, number, issued_on)
  values ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-0000000000c1',
          2, '2026-08-25')
$$, '42501', null, 'walker cannot insert an invoice');

select throws_ok($$
  insert into payments (business_id, invoice_id, method, amount_cents, received_on)
  values ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-000000000101',
          'cash', 100, '2026-08-25')
$$, '42501', null, 'walker cannot insert a payment');

select is((select array_agg(id order by id) from payout_statements),
  array['00000000-0000-0000-0000-000000000141']::uuid[],
  'walker sees exactly their own FINALIZED statement — not their draft, not the other walker''s');

select is((select array_agg(id order by id) from payout_items),
  array['00000000-0000-0000-0000-000000000151',
        '00000000-0000-0000-0000-000000000152']::uuid[],
  'walker sees exactly the items of their own finalized statement');

select lives_ok($$
  update payout_statements set total_cents = 999999
  where id = '00000000-0000-0000-0000-000000000141'
$$, 'walker update of their own finalized statement matches zero rows (read-only)');

select throws_ok($$
  insert into payout_statements (business_id, walker_id, period_start, period_end)
  values ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-000000000022',
          '2026-08-31', '2026-09-06')
$$, '42501', null, 'walker cannot insert a payout statement, even for themselves');

select lives_ok($$
  delete from payout_items
$$, 'walker delete of payout items matches zero rows');

-- ===== walker A2: sees only their own finalized statement =====
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000023","role":"authenticated"}';

select is((select array_agg(id order by id) from payout_statements),
  array['00000000-0000-0000-0000-000000000143']::uuid[],
  'the other walker sees exactly their own finalized statement');

select is((select array_agg(id order by id) from payout_items),
  array['00000000-0000-0000-0000-000000000154']::uuid[],
  'the other walker sees exactly their own statement''s items');

select is((select count(id) from invoices)::int, 0, 'the other walker sees zero invoices too');

-- ===== owner B: zero rows everywhere in business A =====
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000024","role":"authenticated"}';

select is((select count(id) from invoices)::int, 0, 'cross-business owner sees zero invoices');
select is((select count(id) from invoice_items)::int, 0, 'cross-business owner sees zero invoice items');
select is((select count(id) from deposits)::int, 0, 'cross-business owner sees zero deposits');
select is((select count(id) from payments)::int, 0, 'cross-business owner sees zero payments');
select is((select count(id) from payout_statements)::int, 0, 'cross-business owner sees zero payout statements');
select is((select count(id) from payout_items)::int, 0, 'cross-business owner sees zero payout items');

select throws_ok($$
  insert into invoices (business_id, client_id, number, issued_on)
  values ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-0000000000c1',
          3, '2026-08-25')
$$, '42501', null, 'cross-business owner cannot insert an invoice into business A');

-- ===== anon: nothing =====
set local role anon;

select throws_ok(
  $$ select * from invoices $$,
  '42501', null, 'anon cannot select invoices');

-- ===== superuser: the walker write attempts changed nothing =====
reset role;
set local request.jwt.claims to '{}';

select is((select total_cents from payout_statements
           where id = '00000000-0000-0000-0000-000000000141'), 2000,
  'the finalized statement''s total survived the walker''s update attempt');

select is((select count(id) from payout_items)::int, 4,
  'every payout item survived the walker''s delete attempt');

select throws_ok($$
  insert into payout_items (business_id, statement_id, visit_id, description, amount_cents)
  values ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-000000000142',
          '00000000-0000-0000-0000-0000000000f1', 'Walk 8/20 again', 2000)
$$, '23505', null, 'a visit can appear on exactly one payout statement (unique partial index)');

-- ===== full invoice transition matrix: every (from, to, actor) combination =====
-- Attempt one transition as one actor against a freshly reset fixture invoice. Runs with
-- superuser table privileges (like the Task-2 definer RPCs) so the trigger's who-check —
-- driven by request.jwt.claims — is what is under test, independent of RLS. A null actor
-- leaves the claims empty (auth.uid() null = elevated: service role / migrations).
create function pg_temp.try_inv_transition(
  p_from public.invoice_status, p_to public.invoice_status, p_actor uuid
) returns text language plpgsql as $fn$
declare msg text := 'ok';
begin
  perform set_config('request.jwt.claims', '', true);
  delete from public.invoices where id = '00000000-0000-0000-0000-0000000001ff';
  insert into public.invoices (id, business_id, client_id, number, status, issued_on)
  values ('00000000-0000-0000-0000-0000000001ff', '00000000-0000-0000-0000-00000000aaaa',
          '00000000-0000-0000-0000-0000000000c1', 999, p_from, '2026-08-25');
  if p_actor is not null then
    perform set_config('request.jwt.claims',
      json_build_object('sub', p_actor::text, 'role', 'authenticated')::text, true);
  end if;
  begin
    update public.invoices set status = p_to
    where id = '00000000-0000-0000-0000-0000000001ff';
  exception when others then
    msg := sqlerrm;
  end;
  perform set_config('request.jwt.claims', '', true);
  return msg;
end $fn$;

create function pg_temp.inv_matrix_mismatches(p_actor uuid, p_allowed text[])
returns text[] language plpgsql as $fn$
declare f public.invoice_status; t public.invoice_status; msg text; bad text[] := '{}';
        expected boolean; got boolean;
begin
  foreach f in array enum_range(null::public.invoice_status) loop
    foreach t in array enum_range(null::public.invoice_status) loop
      continue when f = t;
      msg := pg_temp.try_inv_transition(f, t, p_actor);
      got := (msg = 'ok');
      expected := (f::text || '->' || t::text) = any (p_allowed);
      if got <> expected then
        bad := bad || format('%s->%s: got %s, expected %s', f, t, msg,
                             case when expected then 'ok' else 'an error' end);
      end if;
    end loop;
  end loop;
  return bad;
end $fn$;

select is(
  pg_temp.inv_matrix_mismatches('00000000-0000-0000-0000-000000000021',
    array['draft->sent', 'sent->paid', 'draft->void', 'sent->void']),
  '{}'::text[],
  'owner: exactly draft->sent, sent->paid, draft->void, and sent->void are legal');

select is(
  pg_temp.inv_matrix_mismatches('00000000-0000-0000-0000-000000000022', '{}'::text[]),
  '{}'::text[],
  'a walker can make no invoice transition at all (belt and braces over the missing grant path)');

select is(
  pg_temp.inv_matrix_mismatches('00000000-0000-0000-0000-000000000024', '{}'::text[]),
  '{}'::text[],
  'a cross-business owner can make no invoice transition at all');

select is(
  pg_temp.inv_matrix_mismatches(null,
    array['draft->sent', 'sent->paid', 'draft->void', 'sent->void']),
  '{}'::text[],
  'elevated (no JWT) skips only the who-check — the transition matrix still applies');

-- ===== grants =====
select is(
  (select bool_and(has_table_privilege('authenticated', t, p))
     from unnest(array['public.invoices', 'public.invoice_items', 'public.deposits',
                       'public.payments', 'public.payout_statements', 'public.payout_items']) t
    cross join unnest(array['select', 'insert', 'update', 'delete']) p),
  true,
  'authenticated holds select/insert/update/delete on every billing table (RLS governs rows)');

select is(
  (select bool_or(has_table_privilege('anon', t, p))
     from unnest(array['public.invoices', 'public.invoice_items', 'public.deposits',
                       'public.payments', 'public.payout_statements', 'public.payout_items']) t
    cross join unnest(array['select', 'insert', 'update', 'delete']) p),
  false,
  'anon holds no privilege on any billing table');

select is(
  (select bool_and(has_table_privilege('service_role', t, p))
     from unnest(array['public.invoices', 'public.invoice_items', 'public.deposits',
                       'public.payments', 'public.payout_statements', 'public.payout_items']) t
    cross join unnest(array['select', 'insert', 'update', 'delete']) p),
  true,
  'service_role holds full DML on every billing table');

select is(has_function_privilege('authenticated', 'public.enforce_invoice_transition()', 'execute'),
  false, 'the transition-guard trigger function is not directly executable by clients');

select * from finish();
rollback;
