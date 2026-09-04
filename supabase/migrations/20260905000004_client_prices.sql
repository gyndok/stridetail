-- Per-client price overrides (round 6a, 2026-09-04 — Alexandria: "For 2 of
-- the dogs I walk, I grandfathered their price in... It needs to be clearer
-- and easier"). One row per (client, service): the override replaces the
-- service's BASE price; the extra-pet formula still applies on top. Read at
-- visit creation (app) and series expansion (expand-series) — the stamped
-- price_cents_snapshot flows into invoicing unchanged.
create table public.client_prices (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete cascade,
  base_price_cents bigint not null check (base_price_cents >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, service_id)
);
create index client_prices_business on public.client_prices(business_id);
alter table public.client_prices enable row level security;

-- Owner-only, like everything price-shaped (walkers never see prices).
create policy "owner reads client prices" on public.client_prices for select
  using (public.is_owner(business_id));
create policy "owner writes client prices" on public.client_prices for insert
  with check (public.is_owner(business_id));
create policy "owner updates client prices" on public.client_prices for update
  using (public.is_owner(business_id));
create policy "owner removes client prices" on public.client_prices for delete
  using (public.is_owner(business_id));

grant select, insert, update, delete on public.client_prices to authenticated;
-- The round-5b lesson, applied at birth: strip the schema-default grants.
revoke all on public.client_prices from anon;
revoke all on public.client_prices from public;
