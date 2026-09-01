-- Walker removal (2026-09-01, sponsor request after launch night: "CRU exists,
-- where's D?"). Two pieces:
--
-- 1. TRANSITION MATRIX AMENDMENT — the owner gains two transitions the machine
--    lacked: offered->unassigned (withdraw an offer, no reason needed) and
--    accepted->unassigned (unassign; the visit returns to the pool). Walker
--    decline (offered->unassigned WITH reason) is unchanged. These were
--    already implied by the "reassign" concept; removal makes them load-bearing.
--    NOTE: a user who is owner AND the offered walker takes the walker path
--    (reason required) — the stricter rule wins for the ambiguous actor.
--
-- 2. remove_walker(p_membership) — atomic definer RPC: owner-only, walker-rows
--    only (owners are removed by support/SQL deliberately), not yourself,
--    blocked while the walker has a visit in_progress. Future offered/accepted
--    visits return to the pool (history keeps walker_id for payouts/reports);
--    the membership row is deleted (an unaccepted invite dies the same way);
--    one audit row records who removed whom and how many visits went back.
--    WHY unassign matters: "walker reads own visits" is keyed on walker_id
--    alone, so without it an ex-walker keeps seeing their future assignments.

create or replace function public.enforce_visit_transition() returns trigger
language plpgsql set search_path = public as $$
declare
  actor uuid := auth.uid();
  elevated boolean := auth.uid() is null;
  owner_ok boolean;
  walker_ok boolean;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;
  -- is_owner returns null (not false) for a non-member — compare with `is true`.
  owner_ok := elevated or public.is_owner(old.business_id) is true;
  walker_ok := elevated or (old.walker_id is not null and old.walker_id = actor);

  if old.status = 'unassigned' and new.status = 'offered' then
    if not owner_ok then raise exception 'only the business owner can offer visits'; end if;
    if new.walker_id is null then raise exception 'an offered visit requires a walker'; end if;
  elsif old.status = 'unassigned' and new.status = 'accepted' then
    if not owner_ok then raise exception 'only the business owner can force-assign visits'; end if;
    if new.walker_id is null then raise exception 'an accepted visit requires a walker'; end if;
  elsif old.status = 'offered' and new.status = 'accepted' then
    if not (owner_ok or walker_ok) then
      raise exception 'only the business owner or the offered walker can accept this visit';
    end if;
    if new.walker_id is null then raise exception 'an accepted visit requires a walker'; end if;
  elsif old.status = 'offered' and new.status = 'unassigned' then
    -- Walker decline (reason required) or owner withdraw (2026-09-01). The
    -- ambiguous owner-and-offeree actor takes the stricter walker path.
    if walker_ok then
      if new.decline_reason is null or btrim(new.decline_reason) = '' then
        raise exception 'decline requires a reason';
      end if;
    elsif owner_ok then
      null; -- owner withdrawal: no reason required
    else
      raise exception 'only the offered walker or the business owner can return this visit';
    end if;
    new.walker_id := null; -- either way the visit returns to the owner unassigned
  elsif old.status = 'accepted' and new.status = 'unassigned' then
    -- Owner unassign/reassign (2026-09-01) — walker removal depends on it.
    if not owner_ok then
      raise exception 'only the business owner can unassign an accepted visit';
    end if;
    new.walker_id := null;
  elsif old.status = 'accepted' and new.status = 'in_progress' then
    if not walker_ok then raise exception 'only the assigned walker can start this visit'; end if;
  elsif old.status = 'in_progress' and new.status = 'completed' then
    if not walker_ok then raise exception 'only the assigned walker can complete this visit'; end if;
  elsif old.status in ('unassigned', 'offered', 'accepted') and new.status = 'cancelled' then
    if not owner_ok then raise exception 'only the business owner can cancel visits'; end if;
  else
    raise exception 'illegal visit status transition: % -> %', old.status, new.status;
  end if;

  new.updated_at := now();
  return new;
end $$;

-- ===== remove_walker =====
create or replace function public.remove_walker(p_membership uuid)
returns int language plpgsql security definer set search_path = public as $$
declare m memberships; n int := 0;
begin
  select * into m from memberships where id = p_membership;
  if m.id is null then raise exception 'membership not found'; end if;
  if public.is_owner(m.business_id) is not true then
    raise exception 'only the business owner can remove team members';
  end if;
  if m.role <> 'walker' then
    raise exception 'only walker memberships can be removed here';
  end if;
  if m.user_id is not null and m.user_id = auth.uid() then
    raise exception 'you cannot remove yourself';
  end if;
  if m.user_id is not null and exists (
      select 1 from visits v
      where v.business_id = m.business_id and v.walker_id = m.user_id
        and v.status = 'in_progress') then
    raise exception 'this walker has a visit in progress — finish or cancel it first';
  end if;
  if m.user_id is not null then
    update visits set status = 'unassigned'
     where business_id = m.business_id and walker_id = m.user_id
       and status in ('offered', 'accepted');
    get diagnostics n = row_count;
  end if;
  insert into audit_log (business_id, actor_user_id, action, entity, entity_id, meta)
  values (m.business_id, auth.uid(), 'membership.remove', 'membership', m.id,
          jsonb_strip_nulls(jsonb_build_object(
            'removed_user_id', m.user_id, 'role', m.role,
            'status', m.status, 'visits_unassigned', n)));
  delete from memberships where id = m.id;
  return n;
end $$;

revoke execute on function public.remove_walker(uuid) from public, anon;
grant execute on function public.remove_walker(uuid) to authenticated;
