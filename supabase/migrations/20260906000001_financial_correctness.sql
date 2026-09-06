-- Financial-correctness round 2 (2026-09-06 review at 995a7ce, findings 1-3).
-- The invariant: earned money does not disappear, change amount, or move
-- reporting periods because a rate changes, a walker leaves, or a statement
-- is prepared.
--
-- 1. visits.payout_percent_snapshot — the rate is STAMPED AT COMPLETION
--    (finish_visit), the moment wages accrue under existing policy. Balances,
--    ledgers, and statement creation all read the snapshot, so later rate
--    edits apply only to future work, and membership deletion cannot destroy
--    the information needed to pay someone.
--    BACKFILL ASSUMPTION (documented per review): existing completed visits
--    are stamped with the CURRENT membership percent — exactly the number
--    every surface displays today, so no amount changes; there are no
--    removed-walker unswept visits in production to guess at.
-- 2. payout_items.payment_id — a structural link from a swept tip to its
--    originating payment. Tip ledger rows date from the payment's
--    received_on (stable across sweep/finalize/paid), and adjustments are
--    identified structurally (visit_id null AND payment_id null), not by
--    description text. Legacy tip items are backfilled only where the match
--    is unambiguous; unmatched ones keep their old creation-date behavior
--    rather than inventing history.
-- 3. Former walkers: walker_owed_now/walker_ledger include anyone with
--    snapshot-stamped unswept earnings or statements, and
--    create_payout_statement can settle a walker whose membership row is
--    gone (business derived from their financial records). A new
--    ledger_walkers() feeds owner pickers, labeling former walkers.

alter table public.visits add column payout_percent_snapshot numeric(5,2);
comment on column public.visits.payout_percent_snapshot is
  'Walker payout percent frozen at completion; wages math never re-reads the live membership rate.';

alter table public.payout_items
  add column payment_id uuid references public.payments(id) on delete set null;
comment on column public.payout_items.payment_id is
  'Set for swept tips: the originating payment. Adjustments have visit_id AND payment_id null.';

-- ===== backfills =====
update public.visits v
   set payout_percent_snapshot = m.payout_percent
  from public.memberships m
 where v.payout_percent_snapshot is null
   and v.status = 'completed'
   and v.walker_id is not null
   and m.business_id = v.business_id
   and m.user_id = v.walker_id
   and m.status = 'active';

update public.payout_items pi
   set payment_id = p.id
  from public.payments p
 where pi.payment_id is null
   and pi.visit_id is null
   and pi.description like 'Tip — %'
   and p.tip_statement_id = pi.statement_id
   and p.tip_cents = pi.amount_cents
   and (select count(*) from public.payments p2
         where p2.tip_statement_id = pi.statement_id and p2.tip_cents = pi.amount_cents) = 1
   and (select count(*) from public.payout_items pi2
         where pi2.statement_id = pi.statement_id and pi2.visit_id is null
           and pi2.description like 'Tip — %' and pi2.amount_cents = pi.amount_cents) = 1;

-- ===== finish_visit: stamp the rate at the accrual moment =====
create or replace function public.finish_visit(
  p_visit uuid, p_private_notes text, p_finished_at timestamptz default null
) returns void language plpgsql security definer set search_path = public as $$
declare v visits; v_at timestamptz; dist double precision; tok text; summ jsonb; mode text;
begin
  select * into v from visits where id = p_visit;
  if v.id is null then raise exception 'visit not found'; end if;
  if v.walker_id is null or v.walker_id is distinct from auth.uid() then
    raise exception 'only the assigned walker can finish this visit';
  end if;
  if v.status <> 'in_progress' then
    raise exception 'visit is not in progress (status: %)', v.status;
  end if;
  v_at := coalesce(public.validate_occurrence(p_finished_at), now());
  if v.started_at is not null then v_at := greatest(v_at, v.started_at); end if;
  insert into visit_events (business_id, visit_id, type, occurred_at, client_uuid)
  values (v.business_id, p_visit, 'finished', v_at, gen_random_uuid());
  update visits
     set status = 'completed', finished_at = v_at,
         payout_percent_snapshot = (
           select m.payout_percent from memberships m
            where m.business_id = v.business_id and m.user_id = v.walker_id
              and m.status = 'active')
   where id = p_visit;
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

-- ===== create_payout_statement: snapshot wages, payment-linked tips, and
--       settlement for former walkers =====
create or replace function public.create_payout_statement(
  p_walker uuid, p_from date, p_to date
) returns uuid language plpgsql security definer set search_path = public as $$
declare biz uuid; pct numeric; owned int; st_id uuid; visit_count int; tip_count int; total bigint;
begin
  if p_walker is null or p_from is null or p_to is null then
    raise exception 'a payout statement needs a walker and a full period';
  end if;
  if p_to < p_from then
    raise exception 'the period end is before its start';
  end if;
  -- Resolve the business: active membership first; else the walker's
  -- financial records (finding 1 — settling a FORMER walker must work).
  select count(distinct mm.business_id) into owned from memberships mm
   where mm.user_id = p_walker and mm.status = 'active'
     and public.is_owner(mm.business_id) is true;
  if owned > 1 then
    raise exception 'walker is active in more than one of your businesses';
  end if;
  if owned = 1 then
    select mm.business_id, mm.payout_percent::numeric into biz, pct from memberships mm
     where mm.user_id = p_walker and mm.status = 'active'
       and public.is_owner(mm.business_id) is true;
  else
    select count(distinct t.b) into owned from (
      select v.business_id as b from visits v
       where v.walker_id = p_walker and v.status = 'completed'
         and v.payout_percent_snapshot is not null
         and public.is_owner(v.business_id) is true
      union
      select ps.business_id from payout_statements ps
       where ps.walker_id = p_walker and public.is_owner(ps.business_id) is true
    ) t;
    if owned = 0 then
      raise exception 'only the business owner can create payout statements';
    end if;
    if owned > 1 then
      raise exception 'walker has records in more than one of your businesses';
    end if;
    select distinct t.b into biz from (
      select v.business_id as b from visits v
       where v.walker_id = p_walker and v.status = 'completed'
         and v.payout_percent_snapshot is not null
         and public.is_owner(v.business_id) is true
      union
      select ps.business_id from payout_statements ps
       where ps.walker_id = p_walker and public.is_owner(ps.business_id) is true
    ) t;
    pct := null;
  end if;

  insert into payout_statements (business_id, walker_id, period_start, period_end)
  values (biz, p_walker, p_from, p_to)
  returning id into st_id;

  -- Wage items at the SNAPSHOT rate (fallback to the live rate only when a
  -- pre-snapshot visit somehow lacks one AND the membership still exists).
  insert into payout_items (business_id, statement_id, visit_id, description, amount_cents)
  select v.business_id, st_id, v.id,
         s.name || ' — ' || to_char(v.scheduled_start at time zone v.business_tz, 'Dy, Mon FMDD'),
         round(v.price_cents_snapshot * coalesce(v.payout_percent_snapshot, pct) / 100)::int
    from visits v
    join services s on s.id = v.service_id
   where v.business_id = biz
     and v.walker_id = p_walker
     and v.status = 'completed'
     and coalesce(v.payout_percent_snapshot, pct) is not null
     and not exists (select 1 from payout_items pi where pi.visit_id = v.id)
     and (v.scheduled_start at time zone v.business_tz)::date >= p_from
     and (v.scheduled_start at time zone v.business_tz)::date <= p_to
   order by v.scheduled_start;
  get diagnostics visit_count = row_count;

  with claimed as (
    update payments p set tip_statement_id = st_id, updated_at = now()
     where p.business_id = biz
       and p.tip_cents > 0
       and p.tip_statement_id is null
       and p.received_on <= p_to
       and exists (select 1 from invoice_items it
                    where it.invoice_id = p.invoice_id and it.visit_id is not null)
       and not exists (
         select 1 from invoice_items it join visits v on v.id = it.visit_id
          where it.invoice_id = p.invoice_id and it.visit_id is not null
            and v.walker_id is distinct from p_walker)
    returning p.id, p.tip_cents, p.received_on
  )
  insert into payout_items (business_id, statement_id, visit_id, payment_id, description, amount_cents)
  select biz, st_id, null, c.id,
         'Tip — ' || to_char(c.received_on, 'Mon FMDD'), c.tip_cents
    from claimed c;
  get diagnostics tip_count = row_count;

  select coalesce(sum(amount_cents), 0) into total
    from payout_items where statement_id = st_id;
  update payout_statements set total_cents = total, updated_at = now()
   where id = st_id;

  insert into audit_log (business_id, actor_user_id, action, entity, entity_id, meta)
  values (biz, auth.uid(), 'payout.create', 'payout_statement', st_id,
          jsonb_build_object('walker_id', p_walker, 'period_start', p_from,
                             'period_end', p_to, 'visit_count', visit_count,
                             'tip_count', tip_count,
                             'payout_percent', pct, 'total_cents', total));
  return st_id;
end $$;

-- ===== walker_owed_now: snapshot wages, former walkers included =====
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
  unswept as (
    select distinct v.walker_id as user_id
      from visits v
     where v.business_id = p_business
       and v.walker_id is not null
       and v.status = 'completed'
       and v.payout_percent_snapshot is not null
       and not exists (select 1 from payout_items pi where pi.visit_id = v.id)
  ),
  everyone as (
    select user_id from members
    union
    select user_id from stmts
    union
    select user_id from unswept
  )
  select e.user_id,
         coalesce(pr.display_name, 'Team member'),
         mem.pct,
         coalesce((
           select sum(round(v.price_cents_snapshot
                            * coalesce(v.payout_percent_snapshot, mem.pct) / 100))
             from visits v
            where v.business_id = p_business
              and v.walker_id = e.user_id
              and v.status = 'completed'
              and coalesce(v.payout_percent_snapshot, mem.pct) is not null
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

-- ===== walker_ledger: snapshot wages, tips dated by their payment,
--       structural kinds =====
drop function if exists public.walker_ledger(uuid, uuid);
create function public.walker_ledger(p_business uuid, p_walker uuid)
returns table(
  kind text,
  at timestamptz,
  detail text,
  amount_cents bigint,
  statement_id uuid
) language plpgsql security definer set search_path = public as $$
declare
  pct numeric;
  b_tz text;
begin
  if public.is_owner(p_business) is not true then
    raise exception 'only the business owner can view walker ledgers';
  end if;
  select m.payout_percent::numeric into pct
    from memberships m
   where m.business_id = p_business and m.user_id = p_walker and m.status = 'active';
  select b.time_zone into b_tz from businesses b where b.id = p_business;

  return query
  -- Frozen statement items. Kinds are purely STRUCTURAL: visit-linked =
  -- wage, payment-linked = tip (dated by the payment's received_on, stable
  -- across sweep/finalize/paid), neither = adjustment. Production was
  -- verified to hold zero pre-link tip items, so no description heuristics.
  select case
           when pi.visit_id is not null then 'wage'
           when pi.payment_id is not null then 'tip'
           else 'adjustment'
         end,
         -- A date-only received_on is anchored at business-tz midnight: a bare
         -- ::timestamptz cast would land at midnight UTC, which reads back as
         -- the PREVIOUS day once a client converts to the business time zone.
         coalesce(v.scheduled_start, p.received_on::timestamp at time zone b_tz, pi.created_at),
         pi.description,
         pi.amount_cents::bigint,
         pi.statement_id
    from payout_items pi
    join payout_statements ps on ps.id = pi.statement_id
    left join visits v on v.id = pi.visit_id
    left join payments p on p.id = pi.payment_id
   where ps.business_id = p_business and ps.walker_id = p_walker
  union all
  select 'wage',
         v.scheduled_start,
         s.name || ' — ' || c.name,
         round(v.price_cents_snapshot * coalesce(v.payout_percent_snapshot, pct) / 100)::bigint,
         null::uuid
    from visits v
    join services s on s.id = v.service_id
    join clients c on c.id = v.client_id
   where v.business_id = p_business
     and v.walker_id = p_walker
     and v.status = 'completed'
     and coalesce(v.payout_percent_snapshot, pct) is not null
     and not exists (select 1 from payout_items pi where pi.visit_id = v.id)
  union all
  select 'tip',
         p.received_on::timestamp at time zone b_tz,
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

-- ===== ledger_walkers: the owner pickers' roster — active members plus
--       anyone with financial history, labeled =====
create function public.ledger_walkers(p_business uuid)
returns table(walker_id uuid, display_name text, active boolean)
language plpgsql security definer set search_path = public as $$
begin
  if public.is_owner(p_business) is not true then
    raise exception 'only the business owner can list walker ledgers';
  end if;
  return query
  with ids as (
    select m.user_id from memberships m
     where m.business_id = p_business and m.status = 'active' and m.user_id is not null
    union
    select ps.walker_id from payout_statements ps where ps.business_id = p_business
    union
    select v.walker_id from visits v
     where v.business_id = p_business and v.walker_id is not null
       and v.status = 'completed' and v.payout_percent_snapshot is not null
  )
  select i.user_id,
         coalesce(pr.display_name, 'Team member'),
         exists (select 1 from memberships m
                  where m.business_id = p_business and m.user_id = i.user_id
                    and m.status = 'active')
    from ids i
    left join profiles pr on pr.user_id = i.user_id;
end $$;
revoke execute on function public.ledger_walkers(uuid) from public, anon;
grant execute on function public.ledger_walkers(uuid) to authenticated;
