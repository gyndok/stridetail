-- Plan 3 Task 1 — scheduling: availability, time off, visit series, visits,
-- the visit status machine, and the assignment RPCs (spec §5, §6.2, §6.7).

-- ===== availability_rules =====
create table public.availability_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  weekday int not null check (weekday between 0 and 6),
  start_local time not null,
  end_local time not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_local > start_local)
);
create index availability_rules_user on public.availability_rules(user_id);
create index availability_rules_business on public.availability_rules(business_id);

-- ===== time_off =====
create table public.time_off (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index time_off_user on public.time_off(user_id);
create index time_off_business on public.time_off(business_id);

-- ===== visit_status =====
-- No 'declined' value: per spec §5 a decline "returns to owner as unassigned with
-- reason", so decline is offered -> unassigned + decline_reason + walker cleared
-- (see DEVIATIONS.md, Plan 3 Task 1).
create type public.visit_status as enum
  ('unassigned', 'offered', 'accepted', 'in_progress', 'completed', 'cancelled');

-- ===== visit_series =====
create table public.visit_series (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  service_id uuid not null references public.services(id),
  walker_id uuid not null references auth.users(id),
  rrule text not null,
  starts_on date not null,
  ends_on date,
  local_start time not null,
  pet_ids uuid[] not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index visit_series_business on public.visit_series(business_id);

-- ===== visits =====
create table public.visits (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  service_id uuid not null references public.services(id),
  series_id uuid references public.visit_series(id) on delete set null,
  walker_id uuid references auth.users(id) on delete set null,
  pet_ids uuid[] not null default '{}',
  scheduled_start timestamptz not null,
  scheduled_end timestamptz not null,
  business_tz text not null,
  status public.visit_status not null default 'unassigned',
  price_cents_snapshot int not null default 0,
  owner_notes_md text,
  decline_reason text,
  started_at timestamptz,
  finished_at timestamptz,
  distance_m double precision,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (scheduled_end > scheduled_start)
);
create index visits_business_start on public.visits(business_id, scheduled_start);
create index visits_walker_start on public.visits(walker_id, scheduled_start) where walker_id is not null;
create index visits_client on public.visits(client_id);
-- Expansion idempotency: a series can materialise each occurrence exactly once.
create unique index visits_series_start on public.visits(series_id, scheduled_start)
  where series_id is not null;

-- ===== status machine =====
-- unassigned -> offered -> accepted -> in_progress -> completed
-- side exits: offered -> unassigned (decline: reason required, walker cleared) and
-- any pre-in_progress state -> cancelled. Owner: offer, force-assign
-- (unassigned/offered -> accepted), cancel. Assigned walker: accept, decline, start,
-- complete (start/complete get their RPCs in Plan 4; the machine enforces them now).
-- A request with no JWT (service role, migrations, direct privileged SQL) skips only
-- the who-check; the transition matrix itself always applies.
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
    if not walker_ok then raise exception 'only the offered walker can decline this visit'; end if;
    if new.decline_reason is null or btrim(new.decline_reason) = '' then
      raise exception 'decline requires a reason';
    end if;
    new.walker_id := null; -- a declined visit returns to the owner unassigned
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

create trigger visits_enforce_transition
before update on public.visits
for each row execute function public.enforce_visit_transition();

-- ===== audit (spec §6.7): every status/assignment change writes a row =====
-- Trigger-level (not RPC-level) so the owner's direct force-assign/reassign updates
-- are audited too. Security definer: authenticated has no insert path to audit_log.
create or replace function public.audit_visit_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare act text;
begin
  if new.status is distinct from old.status then
    act := case new.status
      when 'offered' then 'visit.offer'
      when 'accepted' then 'visit.accept'
      when 'unassigned' then 'visit.decline'
      when 'cancelled' then 'visit.cancel'
      when 'in_progress' then 'visit.start'
      when 'completed' then 'visit.complete'
    end;
  elsif new.walker_id is distinct from old.walker_id then
    act := 'visit.reassign';
  else
    return null;
  end if;
  insert into audit_log (business_id, actor_user_id, action, entity, entity_id, meta)
  values (new.business_id, auth.uid(), act, 'visit', new.id,
    jsonb_strip_nulls(jsonb_build_object(
      'from', old.status, 'to', new.status,
      'walker_id', new.walker_id, 'previous_walker_id', old.walker_id,
      'decline_reason', case when new.status = 'unassigned' then new.decline_reason end)));
  return null;
end $$;

create trigger visits_audit_change
after update on public.visits
for each row execute function public.audit_visit_change();

-- ===== RLS =====
alter table public.availability_rules enable row level security;
alter table public.time_off enable row level security;
alter table public.visit_series enable row level security;
alter table public.visits enable row level security;

-- availability/time off: each member manages only their own rows; the owner may read
-- every row in the business for the walker picker; walkers never see each other's
-- (spec §6.2 — no separate walker-reads-others policy exists, which is the guarantee).
create policy "member manages own availability" on public.availability_rules for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and business_id in (select public.current_business_ids()));
create policy "owner reads business availability" on public.availability_rules for select
  using (public.is_owner(business_id));

create policy "member manages own time off" on public.time_off for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and business_id in (select public.current_business_ids()));
create policy "owner reads business time off" on public.time_off for select
  using (public.is_owner(business_id));

-- visit_series: owner-only.
create policy "owner reads series" on public.visit_series for select
  using (public.is_owner(business_id));
create policy "owner writes series" on public.visit_series for insert
  with check (public.is_owner(business_id));
create policy "owner updates series" on public.visit_series for update
  using (public.is_owner(business_id)) with check (public.is_owner(business_id));
create policy "owner removes series" on public.visit_series for delete
  using (public.is_owner(business_id));

-- visits: owner full CRUD; walker may only select rows offered to or assigned to them.
-- Walkers have no update policy — their status moves go through the definer RPCs.
create policy "owner reads visits" on public.visits for select
  using (public.is_owner(business_id));
create policy "walker reads own visits" on public.visits for select
  using (walker_id = auth.uid());
create policy "owner writes visits" on public.visits for insert
  with check (public.is_owner(business_id));
create policy "owner updates visits" on public.visits for update
  using (public.is_owner(business_id)) with check (public.is_owner(business_id));
create policy "owner removes visits" on public.visits for delete
  using (public.is_owner(business_id));

-- ===== RPCs =====
create or replace function public.offer_visit(p_visit uuid, p_walker uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v visits;
begin
  select * into v from visits where id = p_visit;
  if v.id is null then raise exception 'visit not found'; end if;
  if public.is_owner(v.business_id) is not true then
    raise exception 'only the business owner can offer visits';
  end if;
  if not exists (select 1 from memberships
                 where business_id = v.business_id and user_id = p_walker and status = 'active') then
    raise exception 'walker is not an active member of this business';
  end if;
  update visits
     set walker_id = p_walker, status = 'offered', decline_reason = null, updated_at = now()
   where id = p_visit;
end $$;

create or replace function public.accept_visit(p_visit uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v visits;
begin
  select * into v from visits where id = p_visit;
  if v.id is null then raise exception 'visit not found'; end if;
  if v.walker_id is null or v.walker_id is distinct from auth.uid() then
    raise exception 'only the offered walker can accept this visit';
  end if;
  if v.status <> 'offered' then raise exception 'visit is not offered'; end if;
  update visits set status = 'accepted', updated_at = now() where id = p_visit;
end $$;

create or replace function public.decline_visit(p_visit uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v visits;
begin
  select * into v from visits where id = p_visit;
  if v.id is null then raise exception 'visit not found'; end if;
  if v.walker_id is null or v.walker_id is distinct from auth.uid() then
    raise exception 'only the offered walker can decline this visit';
  end if;
  if v.status <> 'offered' then raise exception 'visit is not offered'; end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'decline requires a reason';
  end if;
  update visits
     set status = 'unassigned', walker_id = null, decline_reason = p_reason, updated_at = now()
   where id = p_visit;
end $$;

create or replace function public.cancel_visit(p_visit uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v visits;
begin
  select * into v from visits where id = p_visit;
  if v.id is null then raise exception 'visit not found'; end if;
  if public.is_owner(v.business_id) is not true then
    raise exception 'only the business owner can cancel visits';
  end if;
  update visits set status = 'cancelled', updated_at = now() where id = p_visit;
end $$;

-- ===== grants =====
-- Strip first: hosted migrations apply as postgres, whose default privileges
-- auto-grant every new table; locally the CLI applies as supabase_admin, where
-- nothing is granted. Revoking then granting exactly makes both stacks identical.
revoke all on public.availability_rules, public.time_off, public.visit_series, public.visits
  from anon, authenticated;

grant select, insert, update, delete
  on public.availability_rules, public.time_off, public.visit_series
  to authenticated;

-- Walker price hiding (spec §6.2) via column-level grants: price_cents_snapshot is
-- excluded from the select grant, so no client-side role can read it from any row —
-- the walker RLS select path included. Writes (owner stamping the price at creation)
-- stay possible: insert/update are whole-table grants.
grant select (id, business_id, client_id, service_id, series_id, walker_id, pet_ids,
              scheduled_start, scheduled_end, business_tz, status, owner_notes_md,
              decline_reason, started_at, finished_at, distance_m, created_at, updated_at)
  on public.visits to authenticated;
grant insert, update, delete on public.visits to authenticated;

grant select, insert, update, delete
  on public.availability_rules, public.time_off, public.visit_series, public.visits
  to service_role;

-- Functions get PUBLIC execute by default — strip it, then grant exactly.
revoke execute on function public.enforce_visit_transition() from public, anon, authenticated;
revoke execute on function public.audit_visit_change() from public, anon, authenticated;
revoke execute on function public.offer_visit(uuid, uuid) from public, anon;
revoke execute on function public.accept_visit(uuid) from public, anon;
revoke execute on function public.decline_visit(uuid, text) from public, anon;
revoke execute on function public.cancel_visit(uuid) from public, anon;
grant execute on function public.offer_visit(uuid, uuid) to authenticated;
grant execute on function public.accept_visit(uuid) to authenticated;
grant execute on function public.decline_visit(uuid, text) to authenticated;
grant execute on function public.cancel_visit(uuid) to authenticated;
