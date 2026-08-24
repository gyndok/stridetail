-- Plan 4 Task 2 — walker media upload policy.
--
-- Visit photos land at `business_id/visit_id/<client_uuid>.jpg` (plan Task 2).
-- The Plan-2 storage policies make writes owner-only, so the visit's walker
-- needs a tight insert path: only under their own visit's prefix, only while
-- that visit is in_progress, and only with the visit's real business as the
-- first segment (no tenant spoofing via a foreign prefix).
--
-- Walker READ needs no new policy: "member reads media objects"
-- (20260824000003) grants select to any ACTIVE member of the business via
-- current_business_ids(), and walkers are active members — verified in
-- supabase/tests/008_walker_media.sql.

-- ===== helper: safe visit-id parse from an object path =====
-- Second path segment as uuid; same strict-uuid rationale as
-- storage_business_id (20260824000003): a loose class would let a 36-char
-- junk segment through to a failing ::uuid cast (22P02). Requires BOTH the
-- first and second segments to be strict uuids followed by '/', so
-- `biz/visit/file.jpg` parses and `biz/pets/...` returns null. Null is falsy
-- in policy clauses -> denial (42501), never a cast error.
create or replace function public.storage_second_uuid(p_path text) returns uuid
language sql immutable set search_path = public as $$
  select case
    when p_path ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
    then split_part(p_path, '/', 2)::uuid
  end
$$;

-- Functions get PUBLIC execute by default — strip, then grant exactly
-- (advisor-hardening pattern, 20260824000004).
revoke execute on function public.storage_second_uuid(text) from public, anon;
grant execute on function public.storage_second_uuid(text) to authenticated, service_role;

-- ===== policy: the visit's walker may insert under `business/visit/...` =====
-- auth.uid() wrapped in a scalar subselect so the planner evaluates it once.
create policy "walker uploads media on own running visit" on storage.objects for insert
  with check (bucket_id = 'media'
    and exists (
      select 1 from public.visits v
      where v.id = public.storage_second_uuid(name)
        and v.business_id = public.storage_business_id(name)
        and v.walker_id = (select auth.uid())
        and v.status = 'in_progress'));
