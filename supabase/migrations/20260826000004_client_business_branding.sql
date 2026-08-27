-- Plan 8 Task 4 — portal branding read: the portal shell renders the TENANT's
-- identity (business name + brand_color), but Task 1 gave linked clients no
-- SELECT path on businesses at all ("members read business" is staff-only and
-- a clients→businesses embed dies on RLS). One additive row policy fixes it:
-- a linked client reads exactly the businesses they are linked to.
--
-- Recorded choice (also in DEVIATIONS.md, Plan 8 Task 4): row-level only —
-- the businesses columns are all client-benign (name, slug, logo_path,
-- brand_color, time_zone, policies_md, plan, access_grace_hours,
-- invoice_next_number, payment handles already shown on public invoices).
-- The app still selects named columns only (house rule).

create policy "client reads linked businesses" on public.businesses for select
  using (id in (select public.client_business_ids_for_user()));
