-- SECURITY / CI (2026-08-29) — revoke the accidental `anon` table grants.
--
-- Nine public relations — audit_log, businesses, clients, memberships,
-- pet_documents, pets, profiles, services, services_public — carry full
-- SELECT/INSERT/UPDATE/DELETE for `anon`, granted by Supabase DEFAULT
-- PRIVILEGES when the earliest migrations created them (before later tables,
-- which came in clean). Not exploitable today — every one is blocked by an RLS
-- policy that routes through a helper anon cannot execute — but the protection
-- is ACCIDENTAL: the first policy written that does not route through a revoked
-- helper would expose that table to anon instantly. This is also what turns CI
-- red (017_client_business_branding.sql assertion 6 expects "permission denied
-- for table businesses" but gets "for function current_business_ids" — the
-- table grant lets anon reach the policy at all). Revoking makes 017's original
-- expectation true again; 017 is NOT edited.
--
-- Scope: `anon` ONLY. authenticated and service_role are untouched, so the app,
-- the RPCs, and the verify_jwt-off public endpoints (report-public /
-- invoice-public, which use the SERVICE ROLE key internally — not anon) are all
-- unaffected. Column-level privileges are cleared alongside the table-level
-- ones by REVOKE ALL.

revoke all privileges on table
  public.audit_log,
  public.businesses,
  public.clients,
  public.memberships,
  public.pet_documents,
  public.pets,
  public.profiles,
  public.services,
  public.services_public
from anon;
