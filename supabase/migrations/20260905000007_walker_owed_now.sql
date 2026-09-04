-- "Owed now" (round 7c, 2026-09-04 — sponsor: "I do not see a way to know how
-- much to pay out to the walker (tip or percentage)"). One owner-only RPC
-- answering, per active member: wages accrued on completed visits NOT YET on
-- any payout statement (at their payout percent), plus unclaimed tips on
-- invoices whose visit lines are all theirs. Exactly what the next statement
-- would sweep — shown BEFORE anyone has to create one.
create or replace function public.walker_owed_now(p_business uuid)
returns table(
  walker_id uuid,
  display_name text,
  payout_percent numeric,
  wages_cents bigint,
  tips_cents bigint
) language plpgsql security definer set search_path = public as $$
begin
  if public.is_owner(p_business) is not true then
    raise exception 'only the business owner can view payout balances';
  end if;
  return query
  select m.user_id,
         coalesce(pr.display_name, 'Team member'),
         m.payout_percent::numeric,
         coalesce((
           select sum(round(v.price_cents_snapshot * m.payout_percent / 100))
             from visits v
            where v.business_id = p_business
              and v.walker_id = m.user_id
              and v.status = 'completed'
              and not exists (select 1 from payout_items pi where pi.visit_id = v.id)
         ), 0)::bigint,
         coalesce((
           select sum(p.tip_cents)
             from payments p
            where p.business_id = p_business
              and p.tip_cents > 0
              and p.tip_statement_id is null
              and exists (select 1 from invoice_items it
                           where it.invoice_id = p.invoice_id and it.visit_id is not null)
              and not exists (
                select 1 from invoice_items it join visits v on v.id = it.visit_id
                 where it.invoice_id = p.invoice_id and it.visit_id is not null
                   and v.walker_id is distinct from m.user_id)
         ), 0)::bigint
    from memberships m
    left join profiles pr on pr.user_id = m.user_id
   where m.business_id = p_business
     and m.status = 'active';
end $$;

revoke execute on function public.walker_owed_now(uuid) from public, anon;
grant execute on function public.walker_owed_now(uuid) to authenticated;
