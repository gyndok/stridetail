-- Plan 2, Task 3: private `media` bucket with tenant-scoped storage policies.
--
-- Path convention (spec §6.6): the first path segment of an object name is the business id,
-- e.g. `<business_id>/pets/<pet_id>/photo.jpg`. Members of the business may read; owners
-- may insert/update/delete.
--
-- Privilege note, verified locally: migrations apply as `postgres`, which does NOT own
-- storage.objects (supabase_storage_admin does) and is not a member of that role, yet
-- CREATE POLICY on storage.objects succeeds on the current CLI stack (Postgres 17.6 image;
-- postgres is a non-superuser with bypassrls and Supabase's storage grants). No fallback
-- (dashboard-created policies / supabase_storage_admin session) was needed.
-- authenticated/anon/service_role already hold table DML grants on storage.objects via the
-- stack's default privileges; RLS (enabled by the storage service) governs every row.

-- ===== bucket (idempotent) =====
insert into storage.buckets (id, name, public)
values ('media', 'media', false)
on conflict (id) do nothing;

-- ===== helper: safe business-id parse from an object path =====
-- Returns null instead of raising 22P02 when the first segment is not a uuid; null is
-- falsy in policy using/with-check clauses, so malformed paths are denied, not errors.
-- Strict uuid shape on purpose: a loose `[0-9a-f-]{36}` would let a 36-hyphen segment
-- through to a failing cast.
create or replace function public.storage_business_id(p_path text) returns uuid
language sql immutable as $$
  select case
    when p_path ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
    then split_part(p_path, '/', 1)::uuid
  end
$$;

-- ===== policies on storage.objects, scoped to the media bucket =====
-- Reads for any active member of the business; writes owner-only. `is_owner(null)` is
-- null (see DEVIATIONS, Plan 2 Task 2), which is falsy here, so non-members and bad
-- paths fall through to denial.
create policy "member reads media objects" on storage.objects for select
  using (bucket_id = 'media'
    and public.storage_business_id(name) in (select public.current_business_ids()));

create policy "owner writes media objects" on storage.objects for insert
  with check (bucket_id = 'media'
    and public.is_owner(public.storage_business_id(name)));

create policy "owner updates media objects" on storage.objects for update
  using (bucket_id = 'media'
    and public.is_owner(public.storage_business_id(name)))
  with check (bucket_id = 'media'
    and public.is_owner(public.storage_business_id(name)));

create policy "owner removes media objects" on storage.objects for delete
  using (bucket_id = 'media'
    and public.is_owner(public.storage_business_id(name)));
