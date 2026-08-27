-- Plan 8 Task 1 — client portal schema: client_users links, booking_requests
-- with a pending|approved|declined machine, the client read scope (visits,
-- reports, events, tracks, invoices, pets, own client row), the pets
-- self-service column guard, and the approve/decline RPCs (plan 8 §Task 1).
--
-- Recorded choices (also in DEVIATIONS.md, Plan 8 Task 1):
-- * client_users has NO insert/update path for client roles at all: linking
--   happens via the Task-3 definer RPC (invite/claim) or the service role.
--   The owner manages links (select/delete); the linked user reads own rows.
--   One user may be linked to clients in multiple businesses — the only
--   uniqueness is (client_id, user_id).
-- * Owner email for booking_request_received is resolved from
--   memberships(role='owner', status='active') joined to auth.users.email
--   inside a definer helper (queue_owner_email) — the only place an owner
--   email exists in SQL. Every active owner with an email gets a row;
--   owners without one are skipped silently (queue_client_email precedent).
-- * The approved visit is scheduled AT window_start for the service's
--   duration_min (the window is the client's ask; the owner adjusts the
--   concrete slot afterwards via their full update policy). Price is
--   base + extra_pet x (pets - 1) — the expand-series / app formula.
-- * Clients get a SELECT policy on active services of their linked
--   businesses (they are the payer; the request form needs the list and the
--   insert policy validates service_id against it). Walker price hiding is
--   untouched — walkers still only reach services_public.
-- * Client invoice scope is status in ('sent','paid') — drafts are owner
--   WIP, void is retracted; items/payments chain through visible invoices.
-- * Pets self-service columns: feeding_md, reactivity_md, vet_name,
--   vet_phone, vet_address, photo_path (plan: "feeding/behavioral notes,
--   vet info, photo"). meds_md/allergies stay owner-only (walker-safety
--   instructions the owner curates); identity columns stay owner-only.
-- * Client row stays read-only in v1 (no client update policy on clients).
-- * price_cents_snapshot stays hidden from clients by the Plan-3 column
--   grant (select is granted column-by-column, price excluded, and grants
--   are role-wide) — the new client SELECT policy on visits adds rows, not
--   columns. Every policy/view here names columns, never SELECT *.
-- * booking_request_approved / booking_request_declined /
--   booking_request_received templates do not exist in send-email until
--   Task 7 — the worker marks such rows failed; acceptable queue behavior.

-- ===== client_users =====
create table public.client_users (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  linked_via text not null check (linked_via in ('invite', 'claim')),
  linked_at timestamptz not null default now(),
  unique (client_id, user_id)
);
create index client_users_user on public.client_users(user_id);
create index client_users_business on public.client_users(business_id);

-- ===== booking_requests =====
create table public.booking_requests (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  service_id uuid not null references public.services(id),
  pet_ids uuid[] not null default '{}',
  window_start timestamptz not null,
  window_end timestamptz not null,
  note_md text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  decline_reason text,
  created_by uuid references auth.users(id) on delete set null,
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  visit_id uuid references public.visits(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (window_end > window_start)
);
create index booking_requests_business on public.booking_requests(business_id, created_at desc);
create index booking_requests_client on public.booking_requests(client_id);
create index booking_requests_pending on public.booking_requests(business_id)
  where status = 'pending';

-- ===== helpers: the client-side twins of current_business_ids =====
create or replace function public.client_ids_for_user() returns setof uuid
language sql stable security definer set search_path = public as $$
  select client_id from public.client_users where user_id = auth.uid()
$$;

create or replace function public.client_business_ids_for_user() returns setof uuid
language sql stable security definer set search_path = public as $$
  select business_id from public.client_users where user_id = auth.uid()
$$;

-- ===== booking request status machine =====
-- pending -> approved (needs the created visit stamped in the same update) or
-- pending -> declined (needs a reason). Who: owner or elevated (no JWT =
-- service role / migrations / direct privileged SQL — who-check skipped, the
-- matrix itself always applies). Clients have no update policy at all.
create or replace function public.enforce_booking_request_transition() returns trigger
language plpgsql set search_path = public as $$
declare
  elevated boolean := auth.uid() is null;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;
  -- is_owner returns null (not false) for a non-member — compare with `is true`.
  if not (elevated or public.is_owner(old.business_id) is true) then
    raise exception 'only the business owner can decide booking requests';
  end if;
  if old.status = 'pending' and new.status = 'approved' then
    if new.visit_id is null then
      raise exception 'an approved booking request needs a visit';
    end if;
  elsif old.status = 'pending' and new.status = 'declined' then
    if new.decline_reason is null or btrim(new.decline_reason) = '' then
      raise exception 'a decline requires a reason';
    end if;
  else
    raise exception 'illegal booking request transition: % -> %', old.status, new.status;
  end if;
  new.decided_by := coalesce(new.decided_by, auth.uid());
  new.decided_at := coalesce(new.decided_at, now());
  new.updated_at := now();
  return new;
end $$;

create trigger booking_requests_enforce_transition
before update on public.booking_requests
for each row execute function public.enforce_booking_request_transition();

-- ===== queue_owner_email + request-received trigger =====
-- Clients insert booking_requests directly (RLS below), so no RPC exists to
-- queue the owner's heads-up — an AFTER INSERT trigger does it. The owner's
-- email lives only in auth.users; memberships(role='owner') resolves it.
-- Every active owner with an email gets a row; e-mail-less owners are
-- skipped silently (queue_client_email precedent).
create or replace function public.queue_owner_email(
  p_business uuid, p_template text, p_payload jsonb
) returns void language plpgsql security definer set search_path = public as $$
declare em text;
begin
  for em in
    select u.email from memberships m
    join auth.users u on u.id = m.user_id
    where m.business_id = p_business and m.role = 'owner' and m.status = 'active'
      and u.email is not null and u.email <> ''
  loop
    insert into notifications (business_id, channel, "to", template, payload, status, next_attempt_at)
    values (p_business, 'email', em, p_template, p_payload, 'queued', now());
  end loop;
end $$;

create or replace function public.notify_owner_booking_request() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform queue_owner_email(new.business_id, 'booking_request_received',
    jsonb_build_object(
      'requestId', new.id,
      'clientId', new.client_id,
      'clientName', (select c.name from clients c where c.id = new.client_id),
      'serviceName', (select s.name from services s where s.id = new.service_id),
      'windowStart', new.window_start,
      'windowEnd', new.window_end));
  return null;
end $$;

create trigger booking_requests_notify_owner
after insert on public.booking_requests
for each row execute function public.notify_owner_booking_request();

-- ===== pets self-service column guard =====
-- RLS is row-level; the client UPDATE policy below opens the whole row, so a
-- BEFORE UPDATE trigger pins the columns: owners (and elevated callers) are
-- untouched, everyone else may change only the self-service set.
create or replace function public.enforce_pet_client_columns() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is null or public.is_owner(old.business_id) is true then
    return new;
  end if;
  if new.id is distinct from old.id
     or new.client_id is distinct from old.client_id
     or new.business_id is distinct from old.business_id
     or new.name is distinct from old.name
     or new.species is distinct from old.species
     or new.breed is distinct from old.breed
     or new.birthdate is distinct from old.birthdate
     or new.meds_md is distinct from old.meds_md
     or new.allergies is distinct from old.allergies
     or new.created_at is distinct from old.created_at then
    raise exception 'clients may edit only care notes, vet info, and the photo';
  end if;
  new.updated_at := now();
  return new;
end $$;

create trigger pets_enforce_client_columns
before update on public.pets
for each row execute function public.enforce_pet_client_columns();

-- ===== RLS: new tables =====
alter table public.client_users enable row level security;
alter table public.booking_requests enable row level security;

-- client_users: owner manages links (select/delete); the linked user reads
-- own rows. No insert/update policy for any client role — Task 3's definer
-- linking RPC and the service role are the only writers.
create policy "owner reads client links" on public.client_users for select
  using (public.is_owner(business_id));
create policy "owner removes client links" on public.client_users for delete
  using (public.is_owner(business_id));
create policy "linked user reads own links" on public.client_users for select
  using (user_id = (select auth.uid()));

-- booking_requests: owner select/update on the business; the linked client
-- inserts own PENDING requests (undecided, own service/pets, self-authored)
-- and selects own rows. No delete policy for anyone — requests are history.
create policy "owner reads booking requests" on public.booking_requests for select
  using (public.is_owner(business_id));
create policy "owner updates booking requests" on public.booking_requests for update
  using (public.is_owner(business_id)) with check (public.is_owner(business_id));
create policy "client reads own booking requests" on public.booking_requests for select
  using (client_id in (select public.client_ids_for_user()));
create policy "client requests own pending booking" on public.booking_requests for insert
  with check (
    status = 'pending'
    and created_by = (select auth.uid())
    and decided_by is null and decided_at is null
    and visit_id is null and decline_reason is null
    and exists (select 1 from public.client_users cu
                where cu.user_id = (select auth.uid())
                  and cu.client_id = booking_requests.client_id
                  and cu.business_id = booking_requests.business_id)
    and exists (select 1 from public.services s
                where s.id = booking_requests.service_id
                  and s.business_id = booking_requests.business_id
                  and s.active)
    and not exists (select 1 from unnest(booking_requests.pet_ids) pid
                    where pid not in (select p.id from public.pets p
                                      where p.client_id = booking_requests.client_id)));

-- ===== RLS: client read scope (additive SELECT policies) =====
-- Rows, not columns: visits.price_cents_snapshot stays unreadable because the
-- Plan-3 column-level select grant excludes it for authenticated role-wide.
create policy "client reads own visits" on public.visits for select
  using (client_id in (select public.client_ids_for_user()));

create policy "client reads own visit reports" on public.visit_reports for select
  using (exists (select 1 from public.visits v
                 where v.id = visit_reports.visit_id
                   and v.client_id in (select public.client_ids_for_user())));

create policy "client reads own visit events" on public.visit_events for select
  using (exists (select 1 from public.visits v
                 where v.id = visit_events.visit_id
                   and v.client_id in (select public.client_ids_for_user())));

create policy "client reads own visit tracks" on public.visit_tracks for select
  using (exists (select 1 from public.visits v
                 where v.id = visit_tracks.visit_id
                   and v.client_id in (select public.client_ids_for_user())));

create policy "client reads own sent invoices" on public.invoices for select
  using (client_id in (select public.client_ids_for_user())
         and status in ('sent', 'paid'));

create policy "client reads own invoice items" on public.invoice_items for select
  using (exists (select 1 from public.invoices i
                 where i.id = invoice_items.invoice_id
                   and i.client_id in (select public.client_ids_for_user())
                   and i.status in ('sent', 'paid')));

create policy "client reads own payments" on public.payments for select
  using (exists (select 1 from public.invoices i
                 where i.id = payments.invoice_id
                   and i.client_id in (select public.client_ids_for_user())
                   and i.status in ('sent', 'paid')));

create policy "client reads own pets" on public.pets for select
  using (client_id in (select public.client_ids_for_user()));

-- Self-service updates: the row opens here, the pets trigger pins the columns.
create policy "client updates own pets" on public.pets for update
  using (client_id in (select public.client_ids_for_user()))
  with check (client_id in (select public.client_ids_for_user()));

create policy "client reads own client row" on public.clients for select
  using (id in (select public.client_ids_for_user()));

-- Active services of the linked business: the payer's own price list (the
-- request form needs it and the insert policy validates against it). Walkers
-- are untouched — they still only reach the price-free services_public view.
create policy "client reads linked business services" on public.services for select
  using (active and business_id in (select public.client_business_ids_for_user()));

-- ===== RPCs =====
-- approve_booking_request: owner-only, pending-only. Creates the visit at the
-- service's current price (base + extra_pet x (pets - 1) — the expand-series
-- formula), scheduled AT window_start for duration_min. p_walker null ->
-- unassigned; p_walker -> offered (active-membership check, offer_visit
-- pattern). Stamps the request, queues the client email, audits.
create or replace function public.approve_booking_request(
  p_request uuid, p_walker uuid default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  r booking_requests; s services; biz businesses;
  v_id uuid; price int; st public.visit_status;
begin
  select * into r from booking_requests where id = p_request;
  if r.id is null then raise exception 'booking request not found'; end if;
  if public.is_owner(r.business_id) is not true then
    raise exception 'only the business owner can approve booking requests';
  end if;
  if r.status <> 'pending' then
    raise exception 'booking request is not pending (status: %)', r.status;
  end if;
  select * into s from services where id = r.service_id;
  if s.id is null then raise exception 'service not found'; end if;
  select * into biz from businesses where id = r.business_id;
  if p_walker is null then
    st := 'unassigned';
  else
    if not exists (select 1 from memberships
                   where business_id = r.business_id and user_id = p_walker
                     and status = 'active') then
      raise exception 'walker is not an active member of this business';
    end if;
    st := 'offered';
  end if;
  price := s.base_price_cents
           + s.extra_pet_price_cents * greatest(coalesce(array_length(r.pet_ids, 1), 0) - 1, 0);
  insert into visits (business_id, client_id, service_id, walker_id, pet_ids,
                      scheduled_start, scheduled_end, business_tz, status,
                      price_cents_snapshot)
  values (r.business_id, r.client_id, r.service_id, p_walker, r.pet_ids,
          r.window_start, r.window_start + make_interval(mins => s.duration_min),
          biz.time_zone, st, price)
  returning id into v_id;
  update booking_requests
     set status = 'approved', visit_id = v_id,
         decided_by = auth.uid(), decided_at = now(), updated_at = now()
   where id = p_request;
  perform queue_client_email(r.business_id, r.client_id, 'booking_request_approved',
    jsonb_build_object('requestId', p_request, 'visitId', v_id,
                       'serviceName', s.name, 'scheduledStart', r.window_start));
  insert into audit_log (business_id, actor_user_id, action, entity, entity_id, meta)
  values (r.business_id, auth.uid(), 'booking_request.approve', 'booking_request', p_request,
          jsonb_strip_nulls(jsonb_build_object(
            'visit_id', v_id, 'walker_id', p_walker, 'price_cents', price)));
  return v_id;
end $$;

-- decline_booking_request: owner-only, pending-only, reason required. The
-- reason rides the client email payload and the audit row.
create or replace function public.decline_booking_request(p_request uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare r booking_requests;
begin
  select * into r from booking_requests where id = p_request;
  if r.id is null then raise exception 'booking request not found'; end if;
  if public.is_owner(r.business_id) is not true then
    raise exception 'only the business owner can decline booking requests';
  end if;
  if r.status <> 'pending' then
    raise exception 'booking request is not pending (status: %)', r.status;
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'a decline requires a reason';
  end if;
  update booking_requests
     set status = 'declined', decline_reason = btrim(p_reason),
         decided_by = auth.uid(), decided_at = now(), updated_at = now()
   where id = p_request;
  perform queue_client_email(r.business_id, r.client_id, 'booking_request_declined',
    jsonb_build_object('requestId', p_request, 'reason', btrim(p_reason),
                       'serviceName', (select s.name from services s where s.id = r.service_id)));
  insert into audit_log (business_id, actor_user_id, action, entity, entity_id, meta)
  values (r.business_id, auth.uid(), 'booking_request.decline', 'booking_request', p_request,
          jsonb_build_object('reason', btrim(p_reason)));
end $$;

-- ===== grants =====
-- Strip first: hosted migrations apply as postgres, whose default privileges
-- auto-grant every new table; locally the CLI applies as supabase_admin, where
-- nothing is granted. Revoking then granting exactly makes both stacks identical.
revoke all on public.client_users, public.booking_requests from anon, authenticated;

-- client_users: read (owner + linked user) and owner delete; NO insert/update
-- for client roles — Task 3's definer RPC and the service role link.
grant select, delete on public.client_users to authenticated;
-- booking_requests: client insert + owner update; no delete for anyone.
grant select, insert, update on public.booking_requests to authenticated;

grant select, insert, update, delete
  on public.client_users, public.booking_requests
  to service_role;

-- Functions get PUBLIC execute by default — strip it, then grant exactly.
revoke execute on function public.client_ids_for_user() from public, anon;
revoke execute on function public.client_business_ids_for_user() from public, anon;
grant execute on function public.client_ids_for_user() to authenticated;
grant execute on function public.client_business_ids_for_user() to authenticated;

revoke execute on function public.enforce_booking_request_transition() from public, anon, authenticated;
revoke execute on function public.notify_owner_booking_request() from public, anon, authenticated;
revoke execute on function public.enforce_pet_client_columns() from public, anon, authenticated;
revoke execute on function public.queue_owner_email(uuid, text, jsonb) from public, anon, authenticated;

-- RPCs: authenticated only (the `is not true` guards need a JWT sub — Plan 3
-- Task 1 precedent; a service_role grant would be dead code).
revoke execute on function public.approve_booking_request(uuid, uuid) from public, anon;
revoke execute on function public.decline_booking_request(uuid, text) from public, anon;
grant execute on function public.approve_booking_request(uuid, uuid) to authenticated;
grant execute on function public.decline_booking_request(uuid, text) to authenticated;
