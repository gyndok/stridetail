-- Tips (round 7, 2026-09-04 — sponsor: "$25 walk, $5 tip, tip goes to the
-- walker; recording $30 shows a -$5 balance"). A payment now splits into the
-- invoice portion (amount_cents, unchanged meaning — every balance sum keeps
-- working) and a gratuity (tip_cents). Tips never count toward the invoice,
-- and they flow 100% to the walker's payout statement — the payout percent
-- applies to wages, never to tips.
alter table public.payments add column tip_cents int not null default 0 check (tip_cents >= 0);
comment on column public.payments.tip_cents is
  'Gratuity portion of the payment: excluded from invoice balances, paid 100% to the visit walker via payout statements.';

-- Claimed when swept onto a payout statement (one sweep per tip).
alter table public.payments add column tip_statement_id uuid references public.payout_statements(id) on delete set null;

-- ===== record_payment (replaced: p_tip_cents) =====
create or replace function public.record_payment(
  p_invoice uuid, p_method public.payment_method, p_amount_cents int,
  p_received_on date, p_memo text default null, p_tip_cents int default 0
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
  if p_tip_cents is null or p_tip_cents < 0 then
    raise exception 'tip cannot be negative';
  end if;
  if p_received_on is null then
    raise exception 'a payment needs a received date';
  end if;
  if inv.status not in ('sent', 'paid') then
    raise exception 'invoice is not sent (status: %)', inv.status;
  end if;
  insert into payments (business_id, invoice_id, method, amount_cents, received_on, memo, tip_cents)
  values (inv.business_id, p_invoice, p_method, p_amount_cents, p_received_on, p_memo, p_tip_cents)
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
                             'tip_cents', p_tip_cents,
                             'method', p_method, 'overpaid', pays_total > items_total));
  return pay_id;
end $$;

-- ===== create_payout_statement (replaced: sweeps tips) =====
-- Tips sweep AFTER the wage items: unclaimed tips received in the period, on
-- invoices whose visit lines all belong to this walker (invoice-per-visit
-- makes this the overwhelmingly common case; a mixed-walker invoice's tip
-- stays unclaimed rather than guessing a split). 100% — no payout percent.
create or replace function public.create_payout_statement(
  p_walker uuid, p_from date, p_to date
) returns uuid language plpgsql security definer set search_path = public as $$
declare m memberships; owned int; st_id uuid; visit_count int; tip_count int; total bigint;
begin
  if p_walker is null or p_from is null or p_to is null then
    raise exception 'a payout statement needs a walker and a full period';
  end if;
  if p_to < p_from then
    raise exception 'the period end is before its start';
  end if;
  select count(*) into owned from memberships mm
   where mm.user_id = p_walker and mm.status = 'active'
     and public.is_owner(mm.business_id) is true;
  if owned = 0 then
    raise exception 'only the business owner can create payout statements';
  end if;
  if owned > 1 then
    raise exception 'walker is active in more than one of your businesses';
  end if;
  select mm.* into m from memberships mm
   where mm.user_id = p_walker and mm.status = 'active'
     and public.is_owner(mm.business_id) is true;

  insert into payout_statements (business_id, walker_id, period_start, period_end)
  values (m.business_id, p_walker, p_from, p_to)
  returning id into st_id;

  insert into payout_items (business_id, statement_id, visit_id, description, amount_cents)
  select v.business_id, st_id, v.id,
         s.name || ' — ' || to_char(v.scheduled_start at time zone v.business_tz, 'Dy, Mon FMDD'),
         round(v.price_cents_snapshot * m.payout_percent / 100)::int
    from visits v
    join services s on s.id = v.service_id
   where v.business_id = m.business_id
     and v.walker_id = p_walker
     and v.status = 'completed'
     and not exists (select 1 from payout_items pi where pi.visit_id = v.id)
     and (v.scheduled_start at time zone v.business_tz)::date >= p_from
     and (v.scheduled_start at time zone v.business_tz)::date <= p_to
   order by v.scheduled_start;
  get diagnostics visit_count = row_count;

  with claimed as (
    update payments p set tip_statement_id = st_id, updated_at = now()
     where p.business_id = m.business_id
       and p.tip_cents > 0
       and p.tip_statement_id is null
       and p.received_on >= p_from and p.received_on <= p_to
       and exists (select 1 from invoice_items it
                    where it.invoice_id = p.invoice_id and it.visit_id is not null)
       and not exists (
         select 1 from invoice_items it join visits v on v.id = it.visit_id
          where it.invoice_id = p.invoice_id and it.visit_id is not null
            and v.walker_id is distinct from p_walker)
    returning p.id, p.tip_cents, p.received_on, p.invoice_id
  )
  insert into payout_items (business_id, statement_id, visit_id, description, amount_cents)
  select m.business_id, st_id, null,
         'Tip — ' || to_char(c.received_on, 'Mon FMDD'), c.tip_cents
    from claimed c;
  get diagnostics tip_count = row_count;

  select coalesce(sum(amount_cents), 0) into total
    from payout_items where statement_id = st_id;
  update payout_statements set total_cents = total, updated_at = now()
   where id = st_id;

  insert into audit_log (business_id, actor_user_id, action, entity, entity_id, meta)
  values (m.business_id, auth.uid(), 'payout.create', 'payout_statement', st_id,
          jsonb_build_object('walker_id', p_walker, 'period_start', p_from,
                             'period_end', p_to, 'visit_count', visit_count,
                             'tip_count', tip_count,
                             'payout_percent', m.payout_percent, 'total_cents', total));
  return st_id;
end $$;

-- The old 5-arg record_payment must GO: create-or-replace with a new
-- parameter list creates an OVERLOAD, and 5-arg calls become ambiguous
-- (found by pgTAP — the whole billing suite tripped on it).
drop function if exists public.record_payment(uuid, public.payment_method, int, date, text);

-- Fresh signature = fresh default PUBLIC execute (the accept_invite lesson):
-- strip it and grant exactly authenticated.
revoke execute on function
  public.record_payment(uuid, public.payment_method, int, date, text, int)
  from public, anon;
grant execute on function
  public.record_payment(uuid, public.payment_method, int, date, text, int)
  to authenticated;
