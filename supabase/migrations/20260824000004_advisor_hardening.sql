-- Hardening from Supabase security advisors after Plan 2 (2026-08-23):
--
-- 1) Functions get EXECUTE for PUBLIC by default, and revoking from anon/authenticated
--    does not remove PUBLIC's grant — anon inherits it. accept_invite was therefore still
--    callable with the anon key despite the Plan 1 revoke. Strip PUBLIC everywhere and
--    grant back exactly the roles that need each function.
-- 2) Pin search_path on the two functions that lacked it (advisor 0011).
--
-- Accepted findings, intentionally not "fixed" (see DEVIATIONS.md):
-- - client_access: RLS enabled with no policies is the design (deny-all; RPC-only access).
-- - services_public: SECURITY DEFINER view is the mechanism that hides price columns from
--   walkers; tenant scoping is inside the view via current_business_ids(), which reads
--   auth.uid() from the request JWT regardless of the executing role.

-- ===== search_path pinning =====
alter function public.is_owner(uuid) set search_path = public;
alter function public.storage_business_id(text) set search_path = public;

-- ===== accept_invite: service-role only (called by the invite-accept edge function) =====
revoke execute on function public.accept_invite(text, uuid) from public, anon, authenticated;
grant execute on function public.accept_invite(text, uuid) to service_role;

-- ===== signed-in-only RPCs: strip PUBLIC/anon, keep authenticated (+service_role) =====
revoke execute on function public.create_business(text, text, text) from public, anon;
revoke execute on function public.create_invite(uuid, public.member_role, text, text) from public, anon;
revoke execute on function public.set_client_access(uuid, text, text, text, text, text, text) from public, anon;
revoke execute on function public.reveal_access_owner(uuid) from public, anon;
revoke execute on function public.has_client_access(uuid) from public, anon;

-- ===== RLS helper functions: needed by policies evaluated as authenticated =====
revoke execute on function public.current_business_ids() from public, anon;
revoke execute on function public.role_in(uuid) from public, anon;
revoke execute on function public.is_owner(uuid) from public, anon;
grant execute on function public.current_business_ids() to authenticated, service_role;
grant execute on function public.role_in(uuid) to authenticated, service_role;
grant execute on function public.is_owner(uuid) to authenticated, service_role;
grant execute on function public.storage_business_id(text) to authenticated, service_role;
revoke execute on function public.storage_business_id(text) from public, anon;

-- ===== signup trigger: only the auth service inserts into auth.users =====
revoke execute on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.handle_new_user() to supabase_auth_admin;
