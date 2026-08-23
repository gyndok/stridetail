-- ===== clients =====
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  phones text[] not null default '{}',
  email text,
  address text,
  lat double precision,
  lng double precision,
  notes_md text,
  mg_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index clients_business on public.clients(business_id);

-- ===== pets =====
create table public.pets (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  species text,
  breed text,
  birthdate date,
  feeding_md text,
  meds_md text,
  allergies text,
  reactivity_md text,
  vet_name text,
  vet_phone text,
  vet_address text,
  photo_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index pets_client on public.pets(client_id);
create index pets_business on public.pets(business_id);

-- ===== pet_documents =====
create type public.doc_type as enum ('rabies', 'dhpp', 'lepto', 'bordetella', 'other');

create table public.pet_documents (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references public.pets(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  type public.doc_type not null,
  storage_path text not null,
  expires_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index pet_documents_pet on public.pet_documents(pet_id);
create index pet_documents_business on public.pet_documents(business_id);

-- ===== audit_log =====
create table public.audit_log (
  id bigint generated always as identity primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity text,
  entity_id uuid,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_business on public.audit_log(business_id, created_at desc);

-- ===== RLS =====
alter table public.clients enable row level security;
alter table public.pets enable row level security;
alter table public.pet_documents enable row level security;
alter table public.audit_log enable row level security;

-- Owner-only for reads and writes in plan 2. Walkers get client/pet visibility in plan 3
-- via assigned visits; until that path exists they must see nothing (spec §11 stage 4).
create policy "owner reads clients" on public.clients for select
  using (public.is_owner(business_id));
create policy "owner writes clients" on public.clients for insert
  with check (public.is_owner(business_id));
create policy "owner updates clients" on public.clients for update
  using (public.is_owner(business_id)) with check (public.is_owner(business_id));
create policy "owner removes clients" on public.clients for delete
  using (public.is_owner(business_id));

create policy "owner reads pets" on public.pets for select
  using (public.is_owner(business_id));
create policy "owner writes pets" on public.pets for insert
  with check (public.is_owner(business_id));
create policy "owner updates pets" on public.pets for update
  using (public.is_owner(business_id)) with check (public.is_owner(business_id));
create policy "owner removes pets" on public.pets for delete
  using (public.is_owner(business_id));

create policy "owner reads pet documents" on public.pet_documents for select
  using (public.is_owner(business_id));
create policy "owner writes pet documents" on public.pet_documents for insert
  with check (public.is_owner(business_id));
create policy "owner updates pet documents" on public.pet_documents for update
  using (public.is_owner(business_id)) with check (public.is_owner(business_id));
create policy "owner removes pet documents" on public.pet_documents for delete
  using (public.is_owner(business_id));

-- audit_log: owners read their own business's trail; no insert/update/delete policy for
-- authenticated — rows are written only by security definer functions or the service role.
create policy "owner reads audit log" on public.audit_log for select
  using (public.is_owner(business_id));

-- ===== grants =====
-- The CLI applies migrations as supabase_admin, so Supabase's default privileges (declared
-- for the postgres role) do not apply. Grant explicitly; RLS still governs every row.
grant select, insert, update, delete on public.clients, public.pets, public.pet_documents
  to authenticated, service_role;
grant select on public.audit_log to authenticated;
grant select, insert on public.audit_log to service_role;
