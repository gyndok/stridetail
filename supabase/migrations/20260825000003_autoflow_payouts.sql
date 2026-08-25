-- Plan 6 Task 1 — auto-invoice on finish_visit + payout statement RPCs.
--
-- Sponsor-approved auto-flow (plan header, normative): after a walk the client
-- gets ONE link. finish_visit consults businesses.auto_invoice:
--   per_visit   (default) — create an invoice containing EXACTLY the finished
--                visit and send it (token + invoice_ready email queued);
--   per_sitting — append the visit to the client's newest open draft invoice
--                (create the draft if none); never send;
--   manual      — today's behavior, untouched.
--
-- Recorded choices (also in DEVIATIONS.md):
-- * The auto-flow does NOT call create_invoice/send_invoice: their owner guards
--   (and the invoice status-transition trigger's who-check) would reject the
--   calling WALKER. This path is system-on-behalf-of-business inside the
--   definer finish_visit, so the assembly is inlined in a private helper —
--   create_invoice's number lock, local-date issued_on, description format, and
--   whole-deposit oldest-first auto-apply are duplicated deliberately (a shared
--   refactor was not clean: create_invoice sweeps a range, this builds one
--   visit). The per_visit invoice is INSERTED as 'sent' (the transition trigger
--   fires on UPDATE of status only), so no trigger bypass hack is needed.
-- * create_invoice(p_client, from, to) with the visit's local date as both
--   bounds could pull OTHER uninvoiced same-day visits — another reason the
--   single-visit invoice is built directly.
-- * The whole auto-block is wrapped in an exception handler: ANY error rolls
--   back the invoice subtransaction and writes audit 'invoice.autocreate_failed'
--   with sqlerrm in meta — visit completion is sacred and always succeeds.
-- * Audit actions mirror the owner flow (invoice.create / invoice.send /
--   invoice.item_add, plus deposit.apply) with meta {"auto": true}; the actor
--   is the finishing walker's auth.uid().
-- * per_sitting applies NO deposits (the plan is silent; deposits auto-apply at
--   owner-driven create_invoice time — appending to a growing draft is not the
--   moment to consume them) and appends to the client's NEWEST draft, which may
--   be an owner-created one (that IS the client's open sitting bill).
-- * Payout status transitions are enforced inside the RPCs (draft -> finalized
--   -> paid; void is draft-only); no trigger — walkers have no write path at
--   all (0001 RLS) and owners go through the RPCs.
-- * void_payout_statement deletes the items AND the statement row: payout_status
--   has no 'void' label, and a kept empty draft would be indistinguishable from
--   a real one. Deleting the items releases the visits for the next statement.
-- * payout total_cents is maintained on every item change AND recomputed at
--   finalize (belt and braces — the walker-visible figure must match the items).
-- * create_payout_statement derives the business from the walker's active
--   membership in a business the CALLER owns; if the walker is active in more
--   than one such business the call raises rather than guessing.

-- ===== businesses: auto-invoice mode + venmo handle =====
-- venmo_handle nullable: null hides the "Pay with Venmo" button (Task 3).
alter table public.businesses
  add column auto_invoice text not null default 'per_visit'
    check (auto_invoice in ('per_visit', 'per_sitting', 'manual')),
  add column venmo_handle text;

-- ===== autoflow_invoice_for_visit (private helper) =====
-- Called ONLY from finish_visit's wrapped block; not client-callable (revoked
-- below). Invoker rights: it always runs inside the definer finish_visit, so it
-- executes as the function owner while auth.uid() still reads the walker's JWT
-- (audit actor). Raises freely — the caller's exception handler owns failure.
create or replace function public.autoflow_invoice_for_visit(p_visit uuid)
returns void language plpgsql set search_path = public as $$
declare
  v visits; biz businesses; inv invoices;
  n int; inv_id uuid; tok text; descr text;
  remaining bigint; applied_total bigint := 0; d record;
begin
  select * into v from visits where id = p_visit;
  -- Lock the business row: number allocation must serialize with create_invoice
  -- (same for-update rule as the owner RPC).
  select * into biz from businesses where id = v.business_id for update;
  select s.name || ' — ' || to_char(v.scheduled_start at time zone v.business_tz, 'Dy, Mon FMDD')
    into descr from services s where s.id = v.service_id;

  if biz.auto_invoice = 'per_visit' then
    n := biz.invoice_next_number;
    update businesses set invoice_next_number = n + 1 where id = biz.id;
    tok := encode(extensions.gen_random_bytes(24), 'hex');
    -- Inserted directly as 'sent': the transition trigger fires on UPDATE of
    -- status only, and its who-check would reject the walker anyway.
    insert into invoices (business_id, client_id, number, status, issued_on, public_token, sent_at)
    values (biz.id, v.client_id, n, 'sent', (now() at time zone biz.time_zone)::date, tok, now())
    returning id into inv_id;

    -- Exactly this visit. If it is somehow already invoiced, the partial unique
    -- index raises here and the caller's handler audits the failure.
    insert into invoice_items (business_id, invoice_id, visit_id, description, amount_cents, kind)
    values (biz.id, inv_id, v.id, descr, v.price_cents_snapshot, 'visit');

    -- Deposit auto-apply, duplicated from create_invoice: oldest held first,
    -- WHOLE deposits only, stop at the first that no longer fits.
    remaining := v.price_cents_snapshot;
    for d in
      select * from deposits
       where client_id = v.client_id and status = 'held'
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
              jsonb_build_object('invoice_id', inv_id, 'amount_cents', d.amount_cents,
                                 'auto', true));
      remaining := remaining - d.amount_cents;
      applied_total := applied_total + d.amount_cents;
    end loop;

    perform queue_client_email(biz.id, v.client_id, 'invoice_ready',
                               jsonb_build_object('invoiceId', inv_id, 'invoiceToken', tok));
    insert into audit_log (business_id, actor_user_id, action, entity, entity_id, meta)
    values (biz.id, auth.uid(), 'invoice.create', 'invoice', inv_id,
            jsonb_build_object('number', n, 'visit_id', v.id,
                               'visit_items_cents', v.price_cents_snapshot,
                               'deposit_applied_cents', applied_total, 'auto', true));
    insert into audit_log (business_id, actor_user_id, action, entity, entity_id, meta)
    values (biz.id, auth.uid(), 'invoice.send', 'invoice', inv_id,
            jsonb_build_object('number', n,
                               'items_cents', v.price_cents_snapshot - applied_total,
                               'auto', true));

  elsif biz.auto_invoice = 'per_sitting' then
    -- The client's newest open draft accumulates the sitting; create it empty
    -- if none exists. Never sent from here — the owner reviews and sends.
    select * into inv from invoices
     where client_id = v.client_id and status = 'draft'
     order by created_at desc, id desc
     limit 1
     for update;
    if inv.id is null then
      n := biz.invoice_next_number;
      update businesses set invoice_next_number = n + 1 where id = biz.id;
      insert into invoices (business_id, client_id, number, status, issued_on)
      values (biz.id, v.client_id, n, 'draft', (now() at time zone biz.time_zone)::date)
      returning id into inv_id;
      insert into audit_log (business_id, actor_user_id, action, entity, entity_id, meta)
      values (biz.id, auth.uid(), 'invoice.create', 'invoice', inv_id,
              jsonb_build_object('number', n, 'visit_items_cents', 0,
                                 'deposit_applied_cents', 0, 'auto', true));
    else
      inv_id := inv.id;
    end if;

    insert into invoice_items (business_id, invoice_id, visit_id, description, amount_cents, kind)
    values (biz.id, inv_id, v.id, descr, v.price_cents_snapshot, 'visit');
    insert into audit_log (business_id, actor_user_id, action, entity, entity_id, meta)
    values (biz.id, auth.uid(), 'invoice.item_add', 'invoice_item',
            (select ii.id from invoice_items ii
              where ii.invoice_id = inv_id and ii.visit_id = v.id),
            jsonb_build_object('invoice_id', inv_id,
                               'amount_cents', v.price_cents_snapshot, 'auto', true));
  end if;
end $$;

-- ===== finish_visit (replaced: 0013 body + wrapped auto-invoice block) =====
create or replace function public.finish_visit(p_visit uuid, p_private_notes text)
returns void language plpgsql security definer set search_path = public as $$
declare v visits; dist double precision; tok text; summ jsonb; mode text;
begin
  select * into v from visits where id = p_visit;
  if v.id is null then raise exception 'visit not found'; end if;
  if v.walker_id is null or v.walker_id is distinct from auth.uid() then
    raise exception 'only the assigned walker can finish this visit';
  end if;
  if v.status <> 'in_progress' then
    raise exception 'visit is not in progress (status: %)', v.status;
  end if;
  insert into visit_events (business_id, visit_id, type, occurred_at, client_uuid)
  values (v.business_id, p_visit, 'finished', now(), gen_random_uuid());
  update visits set status = 'completed', finished_at = now() where id = p_visit;
  dist := recompute_visit_distance(p_visit);
  select * into v from visits where id = p_visit;
  summ := jsonb_build_object(
    'petNames', coalesce((select jsonb_agg(p.name order by p.name)
                          from pets p where p.id = any(v.pet_ids)), '[]'::jsonb),
    'serviceName', (select s.name from services s where s.id = v.service_id),
    'scheduledStart', v.scheduled_start,
    'scheduledEnd', v.scheduled_end,
    'startedAt', v.started_at,
    'finishedAt', v.finished_at,
    'durationMin', case when v.started_at is null then null
                        else round(extract(epoch from (v.finished_at - v.started_at)) / 60.0)::int end,
    'distanceM', dist,
    'eventCounts', coalesce((select jsonb_object_agg(c.t, c.n)
                             from (select type::text as t, count(*) as n
                                   from visit_events where visit_id = p_visit
                                   group by type) c), '{}'::jsonb));
  tok := encode(extensions.gen_random_bytes(24), 'hex');
  insert into visit_reports (business_id, visit_id, public_token, summary, private_notes_md)
  values (v.business_id, p_visit, tok, summ, p_private_notes);
  perform queue_client_email(v.business_id, v.client_id, 'visit_finished',
                             jsonb_build_object('visitId', p_visit, 'reportToken', tok));

  -- Auto-invoice (per businesses.auto_invoice). ANY failure rolls back the
  -- invoice subtransaction and is audited — the finish itself is sacred.
  select auto_invoice into mode from businesses where id = v.business_id;
  if mode in ('per_visit', 'per_sitting') then
    begin
      perform public.autoflow_invoice_for_visit(p_visit);
    exception when others then
      insert into audit_log (business_id, actor_user_id, action, entity, entity_id, meta)
      values (v.business_id, auth.uid(), 'invoice.autocreate_failed', 'visit', p_visit,
              jsonb_build_object('mode', mode, 'error', sqlerrm));
    end;
  end if;
end $$;

-- ===== create_payout_statement =====
-- Drafts a statement for one walker over a LOCAL-date period: each completed,
-- not-yet-paid-out visit in range becomes one item at
-- round(price_cents_snapshot × payout_percent / 100) — numeric round, half away
-- from zero (3333 × 32.5% = 1083.225 -> 1083; 2500 × 32.5% = 812.50 -> 813).
-- Zero eligible visits still drafts an empty statement (invoice precedent —
-- the owner adds manual adjustments).
create or replace function public.create_payout_statement(
  p_walker uuid, p_from date, p_to date
) returns uuid language plpgsql security definer set search_path = public as $$
declare m memberships; owned int; st_id uuid; visit_count int; total bigint;
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

  -- LOCAL calendar date of the visit (create_invoice rule — a bare ::date
  -- would encode the server zone). Visits already on a statement are excluded;
  -- the partial unique index backs that as a hard invariant.
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

  select coalesce(sum(amount_cents), 0) into total
    from payout_items where statement_id = st_id;
  update payout_statements set total_cents = total, updated_at = now()
   where id = st_id;

  insert into audit_log (business_id, actor_user_id, action, entity, entity_id, meta)
  values (m.business_id, auth.uid(), 'payout.create', 'payout_statement', st_id,
          jsonb_build_object('walker_id', p_walker, 'period_start', p_from,
                             'period_end', p_to, 'visit_count', visit_count,
                             'payout_percent', m.payout_percent, 'total_cents', total));
  return st_id;
end $$;

-- ===== add_payout_item =====
-- Manual signed adjustment (bonus positive, correction negative) on a DRAFT
-- statement only — finalized statements are walker-visible and frozen.
create or replace function public.add_payout_item(
  p_statement uuid, p_description text, p_amount_cents int
) returns uuid language plpgsql security definer set search_path = public as $$
declare st payout_statements; item_id uuid; total bigint;
begin
  select * into st from payout_statements where id = p_statement;
  if st.id is null then raise exception 'payout statement not found'; end if;
  if public.is_owner(st.business_id) is not true then
    raise exception 'only the business owner can edit payout statements';
  end if;
  if st.status <> 'draft' then
    raise exception 'payout statement is not a draft (status: %)', st.status;
  end if;
  if p_description is null or btrim(p_description) = '' then
    raise exception 'a payout adjustment needs a description';
  end if;
  if p_amount_cents is null or p_amount_cents = 0 then
    raise exception 'a payout adjustment cannot be zero';
  end if;
  insert into payout_items (business_id, statement_id, description, amount_cents)
  values (st.business_id, p_statement, btrim(p_description), p_amount_cents)
  returning id into item_id;
  select coalesce(sum(amount_cents), 0) into total
    from payout_items where statement_id = p_statement;
  update payout_statements set total_cents = total, updated_at = now()
   where id = p_statement;
  insert into audit_log (business_id, actor_user_id, action, entity, entity_id, meta)
  values (st.business_id, auth.uid(), 'payout.item_add', 'payout_item', item_id,
          jsonb_build_object('statement_id', p_statement, 'amount_cents', p_amount_cents));
  return item_id;
end $$;

-- ===== finalize_payout =====
-- draft -> finalized: recomputes the total (belt and braces — the frozen,
-- walker-visible figure must match the items) and stamps finalized_at. The
-- 0001 walker-read policies (status <> 'draft') make the statement and its
-- items visible to the walker from this moment.
create or replace function public.finalize_payout(p_statement uuid)
returns void language plpgsql security definer set search_path = public as $$
declare st payout_statements; total bigint;
begin
  select * into st from payout_statements where id = p_statement;
  if st.id is null then raise exception 'payout statement not found'; end if;
  if public.is_owner(st.business_id) is not true then
    raise exception 'only the business owner can finalize payout statements';
  end if;
  if st.status <> 'draft' then
    raise exception 'payout statement is not a draft (status: %)', st.status;
  end if;
  select coalesce(sum(amount_cents), 0) into total
    from payout_items where statement_id = p_statement;
  update payout_statements
     set status = 'finalized', total_cents = total,
         finalized_at = now(), updated_at = now()
   where id = p_statement;
  insert into audit_log (business_id, actor_user_id, action, entity, entity_id, meta)
  values (st.business_id, auth.uid(), 'payout.finalize', 'payout_statement', p_statement,
          jsonb_build_object('walker_id', st.walker_id, 'total_cents', total));
end $$;

-- ===== mark_payout_paid =====
-- finalized -> paid (recorded manually; she pays via her own transfer app).
create or replace function public.mark_payout_paid(p_statement uuid)
returns void language plpgsql security definer set search_path = public as $$
declare st payout_statements;
begin
  select * into st from payout_statements where id = p_statement;
  if st.id is null then raise exception 'payout statement not found'; end if;
  if public.is_owner(st.business_id) is not true then
    raise exception 'only the business owner can update payout statements';
  end if;
  if st.status <> 'finalized' then
    raise exception 'payout statement is not finalized (status: %)', st.status;
  end if;
  update payout_statements set status = 'paid', paid_at = now(), updated_at = now()
   where id = p_statement;
  insert into audit_log (business_id, actor_user_id, action, entity, entity_id, meta)
  values (st.business_id, auth.uid(), 'payout.paid', 'payout_statement', p_statement,
          jsonb_build_object('walker_id', st.walker_id, 'total_cents', st.total_cents));
end $$;

-- ===== void_payout_statement =====
-- Draft-only. Deletes the items (releasing each visit's payout-once slot) and
-- the statement itself — payout_status has no 'void' label to park it under.
create or replace function public.void_payout_statement(p_statement uuid)
returns void language plpgsql security definer set search_path = public as $$
declare st payout_statements; items_deleted int;
begin
  select * into st from payout_statements where id = p_statement;
  if st.id is null then raise exception 'payout statement not found'; end if;
  if public.is_owner(st.business_id) is not true then
    raise exception 'only the business owner can void payout statements';
  end if;
  if st.status <> 'draft' then
    raise exception 'payout statement is not a draft (status: %)', st.status;
  end if;
  delete from payout_items where statement_id = p_statement;
  get diagnostics items_deleted = row_count;
  delete from payout_statements where id = p_statement;
  insert into audit_log (business_id, actor_user_id, action, entity, entity_id, meta)
  values (st.business_id, auth.uid(), 'payout.void', 'payout_statement', p_statement,
          jsonb_build_object('walker_id', st.walker_id, 'items_deleted', items_deleted,
                             'total_cents', st.total_cents));
end $$;

-- ===== grants =====
-- Functions get PUBLIC execute by default — strip it, then grant exactly.
-- Payout RPCs: authenticated only (the `is not true` guards need a JWT sub —
-- Plan 3 Task 1 precedent). The autoflow helper is internal-only: nobody but
-- the function owner (via finish_visit's definer context) may call it.
revoke execute on function public.autoflow_invoice_for_visit(uuid)
  from public, anon, authenticated;

revoke execute on function
  public.create_payout_statement(uuid, date, date),
  public.add_payout_item(uuid, text, int),
  public.finalize_payout(uuid),
  public.mark_payout_paid(uuid),
  public.void_payout_statement(uuid)
from public, anon;

grant execute on function
  public.create_payout_statement(uuid, date, date),
  public.add_payout_item(uuid, text, int),
  public.finalize_payout(uuid),
  public.mark_payout_paid(uuid),
  public.void_payout_statement(uuid)
to authenticated;

-- finish_visit grants restated so this migration stands alone (0013 pattern).
revoke execute on function public.finish_visit(uuid, text) from public, anon;
grant execute on function public.finish_visit(uuid, text) to authenticated;
