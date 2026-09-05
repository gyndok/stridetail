-- Money-review fix A (2026-09-05): walker_owed_now counted only earnings and
-- tips NOT yet on any payout statement — so the moment the owner drafted a
-- statement, "Owed now" dropped to zero with no money moved. The complete
-- unpaid balance is:
--   un-statemented wages + unclaimed tips + unpaid statement balances
-- returned as three columns so the UI can say which is which; the three are
-- disjoint by construction (a statement owns its visits via payout_items and
-- its tips via payments.tip_statement_id), so summing them never double
-- counts. Invariant the tests pin: drafting or finalizing a statement moves
-- money BETWEEN columns and never changes the walker's total; only marking
-- the statement paid reduces it.
--
-- Also fixed while here (same review): a walker removed from the team no
-- longer vanishes from the list while money is still owed. Rows now come
-- from active members UNION anyone with an unpaid statement. For a departed
-- walker payout_percent is null and wages are not computed (their membership
-- rate is gone — we do not invent one); their frozen statement totals still
-- show.
--
-- Return shape changes (new statement_cents column, nullable percent), so
-- drop + recreate + re-pin grants.
drop function if exists public.walker_owed_now(uuid);

create function public.walker_owed_now(p_business uuid)
returns table(
  walker_id uuid,
  display_name text,
  payout_percent numeric,
  wages_cents bigint,
  tips_cents bigint,
  statement_cents bigint
) language plpgsql security definer set search_path = public as $$
begin
  if public.is_owner(p_business) is not true then
    raise exception 'only the business owner can view payout balances';
  end if;
  return query
  with members as (
    select m.user_id, m.payout_percent::numeric as pct
      from memberships m
     where m.business_id = p_business
       and m.status = 'active'
       and m.user_id is not null
  ),
  stmts as (
    select ps.walker_id as user_id, sum(ps.total_cents)::bigint as cents
      from payout_statements ps
     where ps.business_id = p_business
       and ps.status <> 'paid'
     group by ps.walker_id
  ),
  everyone as (
    select user_id from members
    union
    select user_id from stmts
  )
  select e.user_id,
         coalesce(pr.display_name, 'Team member'),
         mem.pct,
         coalesce((
           select sum(round(v.price_cents_snapshot * mem.pct / 100))
             from visits v
            where mem.pct is not null
              and v.business_id = p_business
              and v.walker_id = e.user_id
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
                   and v.walker_id is distinct from e.user_id)
         ), 0)::bigint,
         coalesce(st.cents, 0)::bigint
    from everyone e
    left join members mem on mem.user_id = e.user_id
    left join stmts st on st.user_id = e.user_id
    left join profiles pr on pr.user_id = e.user_id;
end $$;

revoke execute on function public.walker_owed_now(uuid) from public, anon;
grant execute on function public.walker_owed_now(uuid) to authenticated;
