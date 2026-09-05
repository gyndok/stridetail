-- Review fix #1 (P1, 2026-09-05): client_prices RLS checks ownership of the
-- SUPPLIED business_id, but nothing proved client_id/service_id belong to that
-- business — the owner of business A could insert an override with A's
-- business_id pointing at B's client+service, and expand-series (which reads
-- with the service role by client+service alone) would price B's visits with
-- A's number. Enforce tenancy authoritatively with composite foreign keys:
-- (client_id, business_id) and (service_id, business_id) must exist as pairs.
-- Covers INSERT and UPDATE alike; the app and RLS are unchanged.
alter table public.clients
  add constraint clients_id_business_key unique (id, business_id);
alter table public.services
  add constraint services_id_business_key unique (id, business_id);

alter table public.client_prices
  add constraint client_prices_client_tenant_fkey
    foreign key (client_id, business_id)
    references public.clients (id, business_id) on delete cascade,
  add constraint client_prices_service_tenant_fkey
    foreign key (service_id, business_id)
    references public.services (id, business_id) on delete cascade;
