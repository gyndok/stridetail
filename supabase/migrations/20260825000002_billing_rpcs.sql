-- Plan 5 Task 2 — billing RPCs: the amount-bearing invoice/deposit/payment
-- lifecycle (spec §4, flows §5). All security definer with pinned search_path,
-- `is not true` owner guards (is_owner returns null for non-members), audited
-- to audit_log with money amounts in meta, and granted to authenticated only
-- (the guards need a JWT sub, so a service_role grant would be dead — Plan 3
-- Task 1 precedent; service paths use direct DML).
--
-- Recorded choices (also in DEVIATIONS.md):
-- * create_invoice's date range filters on the visit's LOCAL calendar date
--   ((scheduled_start at time zone business_tz)::date) — a bare ::date would
--   encode the server zone against the no-hardcoded-tz rule, and the line
--   descriptions already render the local date.
-- * Zero eligible visits still creates an empty draft (the owner adds manual
--   lines); no deposit applies against a zero subtotal.
-- * Deposit auto-apply: oldest held first (received_on, then created_at),
--   WHOLE deposits only, stopping at the first deposit that no longer fits
--   the remaining subtotal (the plan's "apply whole deposits while subtotal
--   remains ≥ deposit" — skipping ahead to a newer, smaller deposit would
--   violate oldest-first).
-- * remove_invoice_item removes MANUAL lines only; visit lines and deposit
--   credits leave via void_invoice.
-- * void_invoice also stamps revoked_at when a public token exists: a voided
--   invoice must not stay payable on the public page. Payments rows stay
--   attached as history.

-- ===== create_invoice =====
-- Assembles a draft: allocates the per-business number under a for-update
-- row lock (two concurrent creates serialize here — gapless, no duplicates),
-- turns completed un-invoiced visits into `visit` lines at their price
-- snapshots, then auto-applies held deposits as `deposit_credit` lines.
create or replace function public.create_invoice(
  p_client uuid, p_from date default null, p_to date default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  cl clients; biz businesses; n int; inv_id uuid;
  visit_total bigint; remaining bigint; applied_total bigint := 0;
  visit_count int; d record;
begin
  select * into cl from clients where id = p_client;
  if cl.id is null then raise exception 'client not found'; end if;
  if public.is_owner(cl.business_id) is not true then
    raise exception 'only the business owner can create invoices';
  end if;

  select * into biz from businesses where id = cl.business_id for update;
  n := biz.invoice_next_number;
  update businesses set invoice_next_number = n + 1 where id = biz.id;

  insert into invoices (business_id, client_id, number, status, issued_on)
  values (biz.id, cl.id, n, 'draft', (now() at time zone biz.time_zone)::date)
  returning id into inv_id;

  insert into invoice_items (business_id, invoice_id, visit_id, description, amount_cents, kind)
  select v.business_id, inv_id, v.id,
         s.name || ' — ' || to_char(v.scheduled_start at time zone v.business_tz, 'Dy, Mon FMDD'),
         v.price_cents_snapshot, 'visit'
    from visits v
    join services s on s.id = v.service_id
   where v.client_id = cl.id
     and v.status = 'completed'
     and not exists (select 1 from invoice_items ii where ii.visit_id = v.id)
     and (p_from is null or (v.scheduled_start at time zone v.business_tz)::date >= p_from)
     and (p_to   is null or (v.scheduled_start at time zone v.business_tz)::date <= p_to)
   order by v.scheduled_start;
  get diagnostics visit_count = row_count;

  select coalesce(sum(amount_cents), 0) into visit_total
    from invoice_items where invoice_id = inv_id;
  remaining := visit_total;

  for d in
    select * from deposits
     where client_id = cl.id and status = 'held'
     order by received_on asc nulls last, created_at asc, id asc
     for update
  loop
    exit when d.amount_cents > remaining;
    insert into invoice_items (business_id, invoice_id, description, amount_cents, kind)
    values (biz.id, inv_id,
            'Deposit credit' || case when d.received_on is null then ''
              else ' — ' || to_char(d.received_on, 'Mon FMDD') end,
            -d.amount_cents, 'deposit_credit');
    update deposits set status = 'applied', applied_invoice_id = inv_id, updated_at = now()
     where id = d.id;
    insert into audit_log (business_id, actor_user_id, action, entity, entity_id, meta)
    values (biz.id, auth.uid(), 'deposit.apply', 'deposit', d.id,
            jsonb_build_object('invoice_id', inv_id, 'amount_cents', d.amount_cents));
    remaining := remaining - d.amount_cents;
    applied_total := applied_total + d.amount_cents;
  end loop;

  insert into audit_log (business_id, actor_user_id, action, entity, entity_id, meta)
  values (biz.id, auth.uid(), 'invoice.create', 'invoice', inv_id,
          jsonb_build_object('number', n, 'visit_count', visit_count,
                             'visit_items_cents', visit_total,
                             'deposit_applied_cents', applied_total));
  return inv_id;
end $$;

-- ===== add_invoice_item =====
create or replace function public.add_invoice_item(
  p_invoice uuid, p_description text, p_amount_cents int
) returns uuid language plpgsql security definer set search_path = public as $$
declare inv invoices; item_id uuid;
begin
  select * into inv from invoices where id = p_invoice;
  if inv.id is null then raise exception 'invoice not found'; end if;
  if public.is_owner(inv.business_id) is not true then
    raise exception 'only the business owner can edit invoice lines';
  end if;
  if inv.status not in ('draft', 'sent') then
    raise exception 'invoice lines can only change while draft or sent (status: %)', inv.status;
  end if;
  if p_description is null or btrim(p_description) = '' then
    raise exception 'a manual line needs a description';
  end if;
  if p_amount_cents is null or p_amount_cents = 0 then
    raise exception 'a manual line cannot be zero';
  end if;
  insert into invoice_items (business_id, invoice_id, description, amount_cents, kind)
  values (inv.business_id, p_invoice, btrim(p_description), p_amount_cents, 'manual')
  returning id into item_id;
  insert into audit_log (business_id, actor_user_id, action, entity, entity_id, meta)
  values (inv.business_id, auth.uid(), 'invoice.item_add', 'invoice_item', item_id,
          jsonb_build_object('invoice_id', p_invoice, 'amount_cents', p_amount_cents));
  return item_id;
end $$;

-- ===== remove_invoice_item =====
create or replace function public.remove_invoice_item(p_item uuid)
returns void language plpgsql security definer set search_path = public as $$
declare it invoice_items; inv invoices;
begin
  select * into it from invoice_items where id = p_item;
  if it.id is null then raise exception 'invoice line not found'; end if;
  select * into inv from invoices where id = it.invoice_id;
  if public.is_owner(inv.business_id) is not true then
    raise exception 'only the business owner can edit invoice lines';
  end if;
  if inv.status not in ('draft', 'sent') then
    raise exception 'invoice lines can only change while draft or sent (status: %)', inv.status;
  end if;
  if it.kind <> 'manual' then
    raise exception 'only manual lines can be removed';
  end if;
  delete from invoice_items where id = p_item;
  insert into audit_log (business_id, actor_user_id, action, entity, entity_id, meta)
  values (inv.business_id, auth.uid(), 'invoice.item_remove', 'invoice_item', p_item,
          jsonb_build_object('invoice_id', it.invoice_id, 'amount_cents', it.amount_cents));
end $$;

-- ===== send_invoice =====
-- draft -> sent (the transition trigger validates again), stamps the public
-- token (report-page pattern) and queues the invoice_ready email.
-- queue_client_email silently skips a client with no email — same behavior
-- as the visit flows; the send itself still succeeds.
create or replace function public.send_invoice(p_invoice uuid)
returns void language plpgsql security definer set search_path = public as $$
declare inv invoices; tok text; total bigint;
begin
  select * into inv from invoices where id = p_invoice;
  if inv.id is null then raise exception 'invoice not found'; end if;
  if public.is_owner(inv.business_id) is not true then
    raise exception 'only the business owner can send invoices';
  end if;
  -- Explicit: a sent->sent update would NOT change status, so the transition
  -- trigger would no-op and a re-send would silently rotate the live token.
  if inv.status <> 'draft' then
    raise exception 'invoice is not a draft (status: %)', inv.status;
  end if;
  tok := encode(extensions.gen_random_bytes(24), 'hex');
  update invoices
     set status = 'sent', public_token = tok, sent_at = now(), updated_at = now()
   where id = p_invoice;
  select coalesce(sum(amount_cents), 0) into total
    from invoice_items where invoice_id = p_invoice;
  perform queue_client_email(inv.business_id, inv.client_id, 'invoice_ready',
                             jsonb_build_object('invoiceId', p_invoice, 'invoiceToken', tok));
  insert into audit_log (business_id, actor_user_id, action, entity, entity_id, meta)
  values (inv.business_id, auth.uid(), 'invoice.send', 'invoice', p_invoice,
          jsonb_build_object('number', inv.number, 'items_cents', total));
end $$;

-- ===== record_payment =====
-- sent or paid only (extra payments on a paid invoice are recorded and
-- flagged overpaid in the audit meta). When payments reach the items total
-- the invoice flips sent -> paid (trigger validates) with paid_at stamped.
create or replace function public.record_payment(
  p_invoice uuid, p_method public.payment_method, p_amount_cents int,
  p_received_on date, p_memo text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare inv invoices; pay_id uuid; items_total bigint; pays_total bigint;
begin
  select * into inv from invoices where id = p_invoice;
  if inv.id is null then raise exception 'invoice not found'; end if;
  if public.is_owner(inv.business_id) is not true then
    raise exception 'only the business owner can record payments';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'payment amount must be positive';
  end if;
  if p_received_on is null then
    raise exception 'a payment needs a received date';
  end if;
  if inv.status not in ('sent', 'paid') then
    raise exception 'invoice is not sent (status: %)', inv.status;
  end if;
  insert into payments (business_id, invoice_id, method, amount_cents, received_on, memo)
  values (inv.business_id, p_invoice, p_method, p_amount_cents, p_received_on, p_memo)
  returning id into pay_id;
  select coalesce(sum(amount_cents), 0) into items_total
    from invoice_items where invoice_id = p_invoice;
  select coalesce(sum(amount_cents), 0) into pays_total
    from payments where invoice_id = p_invoice;
  if inv.status = 'sent' and pays_total >= items_total then
    update invoices set status = 'paid', paid_at = now(), updated_at = now()
     where id = p_invoice;
    insert into audit_log (business_id, actor_user_id, action, entity, entity_id, meta)
    values (inv.business_id, auth.uid(), 'invoice.paid', 'invoice', p_invoice,
            jsonb_build_object('items_cents', items_total, 'payments_cents', pays_total));
  end if;
  insert into audit_log (business_id, actor_user_id, action, entity, entity_id, meta)
  values (inv.business_id, auth.uid(), 'payment.record', 'payment', pay_id,
          jsonb_build_object('invoice_id', p_invoice, 'amount_cents', p_amount_cents,
                             'method', p_method, 'overpaid', pays_total > items_total));
  return pay_id;
end $$;

-- ===== void_invoice =====
-- draft|sent -> void. Deletes the items (releasing each visit's unique slot
-- for re-invoicing), returns applied deposits to held, revokes the public
-- link if one exists, and keeps payment rows attached as history. A paid
-- invoice cannot be voided.
create or replace function public.void_invoice(p_invoice uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  inv invoices; items_total bigint; items_deleted int;
  deposits_released int := 0; d record;
begin
  select * into inv from invoices where id = p_invoice;
  if inv.id is null then raise exception 'invoice not found'; end if;
  if public.is_owner(inv.business_id) is not true then
    raise exception 'only the business owner can void invoices';
  end if;
  if inv.status not in ('draft', 'sent') then
    raise exception 'invoice cannot be voided (status: %)', inv.status;
  end if;
  select coalesce(sum(amount_cents), 0) into items_total
    from invoice_items where invoice_id = p_invoice;
  for d in
    select * from deposits
     where applied_invoice_id = p_invoice and status = 'applied'
     for update
  loop
    update deposits set status = 'held', applied_invoice_id = null, updated_at = now()
     where id = d.id;
    insert into audit_log (business_id, actor_user_id, action, entity, entity_id, meta)
    values (inv.business_id, auth.uid(), 'deposit.release', 'deposit', d.id,
            jsonb_build_object('invoice_id', p_invoice, 'amount_cents', d.amount_cents));
    deposits_released := deposits_released + 1;
  end loop;
  delete from invoice_items where invoice_id = p_invoice;
  get diagnostics items_deleted = row_count;
  update invoices
     set status = 'void',
         revoked_at = coalesce(revoked_at,
                               case when public_token is not null then now() end),
         updated_at = now()
   where id = p_invoice;
  insert into audit_log (business_id, actor_user_id, action, entity, entity_id, meta)
  values (inv.business_id, auth.uid(), 'invoice.void', 'invoice', p_invoice,
          jsonb_build_object('number', inv.number, 'items_cents', items_total,
                             'items_deleted', items_deleted,
                             'deposits_released', deposits_released));
end $$;

-- ===== record_deposit =====
-- Lands in held: v1 records deposits the owner has already received. The
-- `requested` state is reserved for a future request-first UI.
create or replace function public.record_deposit(
  p_client uuid, p_amount_cents int, p_method public.payment_method default null,
  p_received_on date default null, p_memo text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare cl clients; dep_id uuid;
begin
  select * into cl from clients where id = p_client;
  if cl.id is null then raise exception 'client not found'; end if;
  if public.is_owner(cl.business_id) is not true then
    raise exception 'only the business owner can record deposits';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'deposit amount must be positive';
  end if;
  insert into deposits (business_id, client_id, amount_cents, status, method, received_on, memo)
  values (cl.business_id, p_client, p_amount_cents, 'held', p_method, p_received_on, p_memo)
  returning id into dep_id;
  insert into audit_log (business_id, actor_user_id, action, entity, entity_id, meta)
  values (cl.business_id, auth.uid(), 'deposit.record', 'deposit', dep_id,
          jsonb_build_object('amount_cents', p_amount_cents, 'method', p_method));
  return dep_id;
end $$;

-- ===== forfeit_deposit / refund_deposit =====
-- Held-only transitions (spec §2.3: the ledger records outcomes; no
-- automatic policy enforcement in v1).
create or replace function public.forfeit_deposit(p_deposit uuid)
returns void language plpgsql security definer set search_path = public as $$
declare d deposits;
begin
  select * into d from deposits where id = p_deposit;
  if d.id is null then raise exception 'deposit not found'; end if;
  if public.is_owner(d.business_id) is not true then
    raise exception 'only the business owner can update deposits';
  end if;
  if d.status <> 'held' then
    raise exception 'deposit is not held (status: %)', d.status;
  end if;
  update deposits set status = 'forfeited', updated_at = now() where id = p_deposit;
  insert into audit_log (business_id, actor_user_id, action, entity, entity_id, meta)
  values (d.business_id, auth.uid(), 'deposit.forfeit', 'deposit', p_deposit,
          jsonb_build_object('amount_cents', d.amount_cents));
end $$;

create or replace function public.refund_deposit(p_deposit uuid)
returns void language plpgsql security definer set search_path = public as $$
declare d deposits;
begin
  select * into d from deposits where id = p_deposit;
  if d.id is null then raise exception 'deposit not found'; end if;
  if public.is_owner(d.business_id) is not true then
    raise exception 'only the business owner can update deposits';
  end if;
  if d.status <> 'held' then
    raise exception 'deposit is not held (status: %)', d.status;
  end if;
  update deposits set status = 'refunded', updated_at = now() where id = p_deposit;
  insert into audit_log (business_id, actor_user_id, action, entity, entity_id, meta)
  values (d.business_id, auth.uid(), 'deposit.refund', 'deposit', p_deposit,
          jsonb_build_object('amount_cents', d.amount_cents));
end $$;

-- ===== invoice_totals =====
-- Read helper for the app (Tasks 3–4): totals are derived, never stored
-- (spec §3). Owner-guarded like the mutations; stable — no writes.
create or replace function public.invoice_totals(p_invoice uuid)
returns table (items_cents int, payments_cents int, balance_cents int)
language plpgsql stable security definer set search_path = public as $$
declare inv invoices; i bigint; p bigint;
begin
  select * into inv from invoices where id = p_invoice;
  if inv.id is null then raise exception 'invoice not found'; end if;
  if public.is_owner(inv.business_id) is not true then
    raise exception 'only the business owner can read invoice totals';
  end if;
  select coalesce(sum(amount_cents), 0) into i
    from invoice_items ii where ii.invoice_id = p_invoice;
  select coalesce(sum(amount_cents), 0) into p
    from payments pm where pm.invoice_id = p_invoice;
  return query select i::int, p::int, (i - p)::int;
end $$;

-- ===== grants =====
-- Functions get PUBLIC execute by default — strip it, then grant exactly.
-- authenticated only: the `is not true` guards require a JWT sub, so a
-- service_role grant would be dead code (Plan 3 Task 1 precedent).
revoke execute on function
  public.create_invoice(uuid, date, date),
  public.add_invoice_item(uuid, text, int),
  public.remove_invoice_item(uuid),
  public.send_invoice(uuid),
  public.record_payment(uuid, public.payment_method, int, date, text),
  public.void_invoice(uuid),
  public.record_deposit(uuid, int, public.payment_method, date, text),
  public.forfeit_deposit(uuid),
  public.refund_deposit(uuid),
  public.invoice_totals(uuid)
from public, anon;

grant execute on function
  public.create_invoice(uuid, date, date),
  public.add_invoice_item(uuid, text, int),
  public.remove_invoice_item(uuid),
  public.send_invoice(uuid),
  public.record_payment(uuid, public.payment_method, int, date, text),
  public.void_invoice(uuid),
  public.record_deposit(uuid, int, public.payment_method, date, text),
  public.forfeit_deposit(uuid),
  public.refund_deposit(uuid),
  public.invoice_totals(uuid)
to authenticated;
