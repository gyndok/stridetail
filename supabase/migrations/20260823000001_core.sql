-- ===== profiles =====
create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  phone text,
  is_platform_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (user_id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

-- ===== businesses =====
create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  logo_path text,
  brand_color text not null default '#E8642C',
  time_zone text not null,
  policies_md text,
  plan text not null default 'free',
  access_grace_hours int not null default 12,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ===== memberships =====
create type public.member_role as enum ('owner', 'walker');
create type public.member_status as enum ('invited', 'active', 'inactive');

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  role public.member_role not null,
  status public.member_status not null default 'invited',
  invite_token text unique,
  invited_phone text,
  invited_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, user_id)
);
create index memberships_user_active on public.memberships(user_id) where status = 'active';

-- ===== services =====
create type public.service_kind as enum ('meet_greet','walk','dropin','meds','overnight','transport','grooming','other');

create table public.services (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  kind public.service_kind not null,
  base_price_cents int not null default 0,
  extra_pet_price_cents int not null default 0,
  duration_min int not null default 30,
  requires_gps boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index services_business on public.services(business_id);

-- ===== helpers =====
create or replace function public.current_business_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select business_id from public.memberships where user_id = auth.uid() and status = 'active'
$$;

create or replace function public.role_in(b uuid) returns public.member_role
language sql stable security definer set search_path = public as $$
  select role from public.memberships where user_id = auth.uid() and business_id = b and status = 'active' limit 1
$$;

create or replace function public.is_owner(b uuid) returns boolean
language sql stable as $$ select public.role_in(b) = 'owner' $$;

-- ===== RLS =====
alter table public.profiles enable row level security;
alter table public.businesses enable row level security;
alter table public.memberships enable row level security;
alter table public.services enable row level security;

create policy "own profile" on public.profiles for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "members read business" on public.businesses for select
  using (id in (select public.current_business_ids()));
create policy "owner updates business" on public.businesses for update
  using (public.is_owner(id)) with check (public.is_owner(id));

create policy "members read memberships" on public.memberships for select
  using (business_id in (select public.current_business_ids()));
create policy "owner manages memberships" on public.memberships for update
  using (public.is_owner(business_id)) with check (public.is_owner(business_id));
create policy "owner removes memberships" on public.memberships for delete
  using (public.is_owner(business_id));

-- services: owners full access; walkers only via the price-free view below
create policy "owner reads services" on public.services for select
  using (public.is_owner(business_id));
create policy "owner writes services" on public.services for insert
  with check (public.is_owner(business_id));
create policy "owner updates services" on public.services for update
  using (public.is_owner(business_id)) with check (public.is_owner(business_id));

create view public.services_public with (security_invoker = false) as
  select s.id, s.business_id, s.name, s.kind, s.duration_min, s.requires_gps, s.active
  from public.services s
  where s.business_id in (select public.current_business_ids());
grant select on public.services_public to authenticated;

-- ===== RPCs =====
create or replace function public.create_business(p_name text, p_time_zone text, p_brand_color text)
returns uuid language plpgsql security definer set search_path = public as $$
declare b uuid; base_slug text; s text; n int := 0;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  base_slug := regexp_replace(lower(p_name), '[^a-z0-9]+', '-', 'g');
  s := base_slug;
  while exists (select 1 from businesses where slug = s) loop n := n + 1; s := base_slug || '-' || n; end loop;
  insert into businesses (name, slug, time_zone, brand_color) values (p_name, s, p_time_zone, coalesce(p_brand_color, '#E8642C')) returning id into b;
  insert into memberships (business_id, user_id, role, status) values (b, auth.uid(), 'owner', 'active');
  insert into services (business_id, name, kind, duration_min, requires_gps, base_price_cents, extra_pet_price_cents) values
    (b, 'Meet & greet', 'meet_greet', 30, false, 0, 0),
    (b, 'Walk', 'walk', 30, true, 2500, 500),
    (b, 'Puppy visit', 'walk', 20, true, 2000, 500),
    (b, 'Drop-in / feeding', 'dropin', 20, false, 2000, 500),
    (b, 'Medication visit', 'meds', 20, false, 2500, 500),
    (b, 'Overnight stay', 'overnight', 720, false, 8500, 1000),
    (b, 'Transport', 'transport', 60, true, 3500, 0),
    (b, 'Grooming / nails', 'grooming', 45, false, 4000, 1000);
  return b;
end $$;

create or replace function public.create_invite(p_business uuid, p_role public.member_role, p_phone text, p_email text)
returns text language plpgsql security definer set search_path = public as $$
declare tok text;
begin
  if not public.is_owner(p_business) then raise exception 'only owners can invite'; end if;
  if p_phone is null and p_email is null then raise exception 'phone or email required'; end if;
  tok := encode(extensions.gen_random_bytes(24), 'hex');
  insert into memberships (business_id, role, status, invite_token, invited_phone, invited_email)
  values (p_business, p_role, 'invited', tok, p_phone, p_email);
  return tok;
end $$;

-- accept is done by the invite-accept edge function (service role) after verifying the JWT
create or replace function public.accept_invite(p_token text, p_user uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare m memberships;
begin
  select * into m from memberships where invite_token = p_token and status = 'invited';
  if m.id is null then raise exception 'invalid or used invite'; end if;
  update memberships set user_id = p_user, status = 'active', invite_token = null, updated_at = now() where id = m.id;
  return m.business_id;
end $$;
revoke execute on function public.accept_invite(text, uuid) from authenticated, anon;

grant execute on function public.create_business(text, text, text) to authenticated;
grant execute on function public.create_invite(uuid, public.member_role, text, text) to authenticated;

-- ===== grants =====
-- The CLI applies migrations as supabase_admin, so Supabase's default privileges (which are
-- declared for the postgres role) do not apply. Grant explicitly; RLS still governs every row.
grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on public.profiles, public.businesses, public.memberships, public.services
  to authenticated, service_role;
