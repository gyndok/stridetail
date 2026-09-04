-- Round 7 follow-up (found while explaining the accounting): the tip sweep
-- was bounded to the statement period on BOTH ends, so a tip recorded after
-- that period's statement already existed could fall between statements
-- forever. Tips now sweep ANY unclaimed gratuity received up to the period
-- end — late-recorded tips simply ride the next statement. (Wage items keep
-- their period bounds: visits happen on their scheduled date; payments drift.)
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
       and p.received_on <= p_to
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
