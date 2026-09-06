-- Transactions page, walker side (2026-09-05 evening — sponsor: "a toggle at
-- the top clients/walkers so that you could easily at a glance review the
-- walker's finances"). One owner-gated definer RPC returns every money line
-- for one walker; per-visit wages need price_cents_snapshot × payout percent
-- and the price column is deliberately unreadable client-side (019 column
-- privacy), so the rows are built here. Kinds:
--   wage        earned — frozen statement items (visit-linked payout_items)
--               and unswept completed visits at the CURRENT payout percent
--               (owed-now attribution; none for a departed walker — no
--               invented rates)
--   tip         earned — statement-frozen tip items and unclaimed tips on
--               all-this-walker invoices (owed-now rule)
--   adjustment  earned — manual signed statement items
--   payout      paid — a statement marked paid (total_cents at paid_at)
-- The client page assembles draft/finalized info rows from the owner-readable
-- payout_statements list; only money-bearing rows come from here.
create function public.walker_ledger(p_business uuid, p_walker uuid)
returns table(
  kind text,
  at timestamptz,
  detail text,
  amount_cents bigint,
  statement_id uuid
) language plpgsql security definer set search_path = public as $$
declare pct numeric;
begin
  if public.is_owner(p_business) is not true then
    raise exception 'only the business owner can view walker ledgers';
  end if;
  select m.payout_percent::numeric into pct
    from memberships m
   where m.business_id = p_business and m.user_id = p_walker and m.status = 'active';

  return query
  -- Frozen statement items: wages (visit-linked), tips, adjustments.
  select case
           when pi.visit_id is not null then 'wage'
           when pi.description like 'Tip — %' then 'tip'
           else 'adjustment'
         end,
         coalesce(v.scheduled_start, pi.created_at),
         pi.description,
         pi.amount_cents::bigint,
         pi.statement_id
    from payout_items pi
    join payout_statements ps on ps.id = pi.statement_id
    left join visits v on v.id = pi.visit_id
   where ps.business_id = p_business and ps.walker_id = p_walker
  union all
  -- Unswept completed visits at the current percent (skip when no membership).
  select 'wage',
         v.scheduled_start,
         s.name || ' — ' || c.name,
         round(v.price_cents_snapshot * pct / 100)::bigint,
         null::uuid
    from visits v
    join services s on s.id = v.service_id
    join clients c on c.id = v.client_id
   where pct is not null
     and v.business_id = p_business
     and v.walker_id = p_walker
     and v.status = 'completed'
     and not exists (select 1 from payout_items pi where pi.visit_id = v.id)
  union all
  -- Unclaimed tips on invoices whose visit lines are all this walker's.
  select 'tip',
         p.received_on::timestamptz,
         'Tip — ' || to_char(p.received_on, 'Mon FMDD'),
         p.tip_cents::bigint,
         null::uuid
    from payments p
   where p.business_id = p_business
     and p.tip_cents > 0
     and p.tip_statement_id is null
     and exists (select 1 from invoice_items it
                  where it.invoice_id = p.invoice_id and it.visit_id is not null)
     and not exists (
       select 1 from invoice_items it join visits v on v.id = it.visit_id
        where it.invoice_id = p.invoice_id and it.visit_id is not null
          and v.walker_id is distinct from p_walker)
  union all
  -- Statements marked paid: the money actually moved.
  select 'payout',
         ps.paid_at,
         'Statement ' || to_char(ps.period_start, 'Mon FMDD') || ' – ' ||
           to_char(ps.period_end, 'Mon FMDD'),
         ps.total_cents::bigint,
         ps.id
    from payout_statements ps
   where ps.business_id = p_business
     and ps.walker_id = p_walker
     and ps.status = 'paid'
   order by 2;
end $$;

revoke execute on function public.walker_ledger(uuid, uuid) from public, anon;
grant execute on function public.walker_ledger(uuid, uuid) to authenticated;
