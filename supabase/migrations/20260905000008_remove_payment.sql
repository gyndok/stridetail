-- Remove a mis-recorded payment (round 7d, 2026-09-04 — sponsor: "suppose I
-- make a mistake while applying money received"). Correction model is
-- REMOVE-AND-RE-RECORD, never in-place edit: both the mistake and the fix
-- stay visible in the audit log. Removing below the items total flips a paid
-- invoice back to sent (paid_at cleared). A payment whose tip is already on a
-- payout statement is frozen — the statement owns that money; void the draft
-- statement first (finalized ones are a support case by design).
create or replace function public.remove_payment(p_payment uuid)
returns void language plpgsql security definer set search_path = public as $$
declare pay payments; inv invoices; items_total bigint; pays_total bigint;
begin
  select * into pay from payments where id = p_payment;
  if pay.id is null then raise exception 'payment not found'; end if;
  if public.is_owner(pay.business_id) is not true then
    raise exception 'only the business owner can remove payments';
  end if;
  if pay.tip_statement_id is not null then
    raise exception 'this payment''s tip is already on a payout statement — void that statement first';
  end if;
  select * into inv from invoices where id = pay.invoice_id;

  delete from payments where id = p_payment;

  select coalesce(sum(amount_cents), 0) into items_total
    from invoice_items where invoice_id = pay.invoice_id;
  select coalesce(sum(amount_cents), 0) into pays_total
    from payments where invoice_id = pay.invoice_id;
  if inv.status = 'paid' and pays_total < items_total then
    update invoices set status = 'sent', paid_at = null, updated_at = now()
     where id = pay.invoice_id;
  end if;

  insert into audit_log (business_id, actor_user_id, action, entity, entity_id, meta)
  values (pay.business_id, auth.uid(), 'payment.remove', 'payment', p_payment,
          jsonb_build_object('invoice_id', pay.invoice_id,
                             'amount_cents', pay.amount_cents,
                             'tip_cents', pay.tip_cents,
                             'method', pay.method,
                             'invoice_reverted', inv.status = 'paid' and pays_total < items_total));
end $$;

revoke execute on function public.remove_payment(uuid) from public, anon;
grant execute on function public.remove_payment(uuid) to authenticated;

-- The status machine gains its first reverse arm: paid -> sent, which exists
-- solely so remove_payment can un-pay an invoice when a mis-recorded payment
-- comes off. Still owner-only via the trigger's who-check.
create or replace function public.enforce_invoice_transition() returns trigger
language plpgsql set search_path = public as $$
declare
  elevated boolean := auth.uid() is null;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;
  if not (elevated or public.is_owner(old.business_id) is true) then
    raise exception 'only the business owner can change invoice status';
  end if;
  if (old.status = 'draft' and new.status = 'sent')
     or (old.status = 'sent' and new.status = 'paid')
     or (old.status = 'paid' and new.status = 'sent')
     or (old.status = 'draft' and new.status = 'void')
     or (old.status = 'sent' and new.status = 'void') then
    new.updated_at := now();
    return new;
  end if;
  raise exception 'illegal invoice status transition: % -> %', old.status, new.status;
end $$;
