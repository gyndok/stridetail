-- Suppress the auto-invoice's own invoice_ready email (one email per walk).
-- Checkpoint 6 found finish_visit queues visit_finished AND the per_visit
-- autoflow queued invoice_ready in the same instant — two client emails where
-- the spec (and the report page's "Invoice & payment" section) promise one.
-- Full-body replace of autoflow_invoice_for_visit from 20260825000003 with
-- only that perform removed; grants unchanged (execute still revoked — the
-- function is reachable only through finish_visit).

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

    -- NO invoice_ready email here (checkpoint 6 finding, 2026-08-26): the
    -- visit_finished email is queued by finish_visit moments earlier and its
    -- report page carries the "Invoice & payment" section — one email per walk.
    -- The owner's send_invoice / resend_invoice_email RPCs still email.
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
