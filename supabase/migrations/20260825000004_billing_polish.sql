-- Plan 6 Task 4 — billing polish RPCs (both Plan 5 Task 4 deviations closed):
--
-- * resend_invoice_email(p_invoice): re-queues the invoice_ready email for a
--   SENT or PAID invoice with the EXISTING public token — send_invoice stays
--   drafts-only precisely so a re-send can never rotate the live token
--   (Task 2 rule); this is the missing "notify again" path. Owner-only,
--   audited ('invoice.resend_email'). Unlike queue_client_email's silent
--   skip, an explicit resend RAISES when the client has no email: the owner
--   pressed a button that would otherwise silently do nothing.
--
-- * uninvoiced_visit_amounts(p_client): the true price_cents_snapshot for
--   each completed un-invoiced visit of one client. The column has no client
--   select grant (Plan 3 Task 1 price rule), so the new-invoice preview was
--   re-computing amounts from CURRENT service prices ("estimated" wart) —
--   this definer read returns the stored snapshots the RPC will actually
--   bill. Owner-guarded like invoice_totals; stable, no writes.

-- ===== resend_invoice_email =====
create or replace function public.resend_invoice_email(p_invoice uuid)
returns void language plpgsql security definer set search_path = public as $$
declare inv invoices; em text;
begin
  select * into inv from invoices where id = p_invoice;
  if inv.id is null then raise exception 'invoice not found'; end if;
  if public.is_owner(inv.business_id) is not true then
    raise exception 'only the business owner can resend invoice emails';
  end if;
  if inv.status not in ('sent', 'paid') then
    raise exception 'invoice is not sent (status: %)', inv.status;
  end if;
  if inv.public_token is null then
    raise exception 'invoice has no public link';
  end if;
  if inv.revoked_at is not null then
    raise exception 'invoice link has been revoked';
  end if;
  select email into em from clients where id = inv.client_id;
  if em is null or em = '' then
    raise exception 'client has no email on file';
  end if;
  -- Same payload shape as send_invoice — the send-email invoice_ready
  -- branch reads {invoiceId, invoiceToken}.
  perform queue_client_email(inv.business_id, inv.client_id, 'invoice_ready',
                             jsonb_build_object('invoiceId', p_invoice,
                                                'invoiceToken', inv.public_token));
  insert into audit_log (business_id, actor_user_id, action, entity, entity_id, meta)
  values (inv.business_id, auth.uid(), 'invoice.resend_email', 'invoice', p_invoice,
          jsonb_build_object('number', inv.number));
end $$;

-- ===== uninvoiced_visit_amounts =====
-- Mirrors create_invoice's eligibility exactly (completed + NOT EXISTS in
-- invoice_items), ordered by scheduled_start like the preview list.
create or replace function public.uninvoiced_visit_amounts(p_client uuid)
returns table (visit_id uuid, amount_cents int)
language plpgsql stable security definer set search_path = public as $$
declare cl clients;
begin
  select * into cl from clients where id = p_client;
  if cl.id is null then raise exception 'client not found'; end if;
  if public.is_owner(cl.business_id) is not true then
    raise exception 'only the business owner can read visit amounts';
  end if;
  return query
    select v.id, v.price_cents_snapshot
      from visits v
     where v.client_id = p_client
       and v.status = 'completed'
       and not exists (select 1 from invoice_items ii where ii.visit_id = v.id)
     order by v.scheduled_start;
end $$;

-- ===== grants =====
-- Functions get PUBLIC execute by default — strip it, then grant exactly.
-- authenticated only: the `is not true` guards require a JWT sub (Plan 3
-- Task 1 precedent; a service_role grant would be dead code).
revoke execute on function
  public.resend_invoice_email(uuid),
  public.uninvoiced_visit_amounts(uuid)
from public, anon;

grant execute on function
  public.resend_invoice_email(uuid),
  public.uninvoiced_visit_amounts(uuid)
to authenticated;
