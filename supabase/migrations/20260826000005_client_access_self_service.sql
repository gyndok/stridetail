-- Plan 8 Task 6 — client self-service: the client-own path onto the Plan-2
-- encrypted access-code store (set/reveal/has definer RPCs mirroring the owner
-- trio in 20260824000002), plus storage policies letting a linked client read
-- and upload THEIR OWN pet's photo in the private media bucket.
--
-- Recorded choices (also in DEVIATIONS.md, Plan 8 Task 6):
-- * Same pgcrypto + Vault key ('client_access_key') and the same table — the
--   client edits the SAME row the owner and walker read; no parallel store.
-- * Audit actions are distinguishable from the owner's:
--   'client_access.self_set' / 'client_access.self_reveal' (plan 8 §Task 6).
-- * Linkage check is client_users (user_id = auth.uid() AND client_id =
--   p_client) inside the definer functions — owners are NOT linked users, so
--   the self RPCs raise for them; the owner trio is untouched.
-- * has_client_access_self exists because the UI mirrors the owner access
--   screen, which needs the "codes on file" boolean without decrypting.
-- * Storage: the Plan-2 policies are member-read / owner-write, and clients
--   are not members — so client photo upload gets its own tight policies:
--   only under `<business>/pets/<pet>/...` where the pet belongs to a client
--   the caller is linked to AND the path's business prefix matches the pet's
--   real business (no tenant spoofing — the walker-policy pattern,
--   20260824000010). Select too (signed URLs check RLS). No client delete.

-- ===== self-service access-code RPCs =====
-- is_owner-style NULL-guard note does not apply here: the linkage test is an
-- EXISTS, which is always true/false; auth.uid() null (anon/elevated without
-- JWT) makes it false -> raise.

create or replace function public.set_client_access_self(
  p_client uuid, p_door text, p_lockbox text, p_gate text,
  p_alarm text, p_key_location text, p_notes text
) returns void
language plpgsql security definer set search_path = public as $$
declare b uuid; k text;
begin
  select business_id into b from clients where id = p_client;
  if b is null then raise exception 'client not found'; end if;
  if not exists (select 1 from client_users cu
                 where cu.user_id = auth.uid() and cu.client_id = p_client) then
    raise exception 'only the linked client can set access codes';
  end if;
  select decrypted_secret into k from vault.decrypted_secrets where name = 'client_access_key';
  if k is null then raise exception 'client_access_key missing from vault'; end if;
  insert into client_access (client_id, business_id, door_code_enc, lockbox_code_enc,
                             gate_code_enc, alarm_code_enc, key_location_enc, notes_enc)
  values (
    p_client, b,
    case when p_door is null then null else extensions.pgp_sym_encrypt(p_door, k) end,
    case when p_lockbox is null then null else extensions.pgp_sym_encrypt(p_lockbox, k) end,
    case when p_gate is null then null else extensions.pgp_sym_encrypt(p_gate, k) end,
    case when p_alarm is null then null else extensions.pgp_sym_encrypt(p_alarm, k) end,
    case when p_key_location is null then null else extensions.pgp_sym_encrypt(p_key_location, k) end,
    case when p_notes is null then null else extensions.pgp_sym_encrypt(p_notes, k) end)
  on conflict (client_id) do update set
    door_code_enc = excluded.door_code_enc,
    lockbox_code_enc = excluded.lockbox_code_enc,
    gate_code_enc = excluded.gate_code_enc,
    alarm_code_enc = excluded.alarm_code_enc,
    key_location_enc = excluded.key_location_enc,
    notes_enc = excluded.notes_enc,
    updated_at = now();
  insert into audit_log (business_id, actor_user_id, action, entity, entity_id)
  values (b, auth.uid(), 'client_access.self_set', 'client_access', p_client);
end $$;

create or replace function public.reveal_client_access_self(p_client uuid)
returns table (door_code text, lockbox_code text, gate_code text,
               alarm_code text, key_location text, notes text)
language plpgsql security definer set search_path = public as $$
declare b uuid; k text;
begin
  select business_id into b from clients where id = p_client;
  if b is null then raise exception 'client not found'; end if;
  if not exists (select 1 from client_users cu
                 where cu.user_id = auth.uid() and cu.client_id = p_client) then
    raise exception 'only the linked client can reveal access codes';
  end if;
  select decrypted_secret into k from vault.decrypted_secrets where name = 'client_access_key';
  if k is null then raise exception 'client_access_key missing from vault'; end if;
  insert into audit_log (business_id, actor_user_id, action, entity, entity_id)
  values (b, auth.uid(), 'client_access.self_reveal', 'client_access', p_client);
  return query
    select
      case when ca.door_code_enc is null then null else extensions.pgp_sym_decrypt(ca.door_code_enc, k) end,
      case when ca.lockbox_code_enc is null then null else extensions.pgp_sym_decrypt(ca.lockbox_code_enc, k) end,
      case when ca.gate_code_enc is null then null else extensions.pgp_sym_decrypt(ca.gate_code_enc, k) end,
      case when ca.alarm_code_enc is null then null else extensions.pgp_sym_decrypt(ca.alarm_code_enc, k) end,
      case when ca.key_location_enc is null then null else extensions.pgp_sym_decrypt(ca.key_location_enc, k) end,
      case when ca.notes_enc is null then null else extensions.pgp_sym_decrypt(ca.notes_enc, k) end
    from client_access ca
    where ca.client_id = p_client;
end $$;

-- "codes on file" indicator for the portal UI without ever decrypting
create or replace function public.has_client_access_self(p_client uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from clients where id = p_client) then
    raise exception 'client not found';
  end if;
  if not exists (select 1 from client_users cu
                 where cu.user_id = auth.uid() and cu.client_id = p_client) then
    raise exception 'only the linked client can check access codes';
  end if;
  return exists (select 1 from client_access where client_id = p_client);
end $$;

-- ===== function grants =====
-- Functions are executable by PUBLIC (and default-ACL-granted) unless stripped.
revoke execute on function public.set_client_access_self(uuid, text, text, text, text, text, text) from public, anon;
revoke execute on function public.reveal_client_access_self(uuid) from public, anon;
revoke execute on function public.has_client_access_self(uuid) from public, anon;
grant execute on function public.set_client_access_self(uuid, text, text, text, text, text, text) to authenticated;
grant execute on function public.reveal_client_access_self(uuid) to authenticated;
grant execute on function public.has_client_access_self(uuid) to authenticated;

-- ===== storage: the linked client's own pet photos =====
-- Helper: pet id from a `<business-uuid>/pets/<pet-uuid>/...` path. Strict
-- uuid shapes (storage_business_id rationale, 20260824000003) and a literal
-- `pets` second segment, so visit paths (`biz/visit/...`) return null. Null is
-- falsy in policy clauses -> denial (42501), never a 22P02 cast error.
create or replace function public.storage_pets_pet_id(p_path text) returns uuid
language sql immutable set search_path = public as $$
  select case
    when p_path ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/pets/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
    then split_part(p_path, '/', 3)::uuid
  end
$$;

revoke execute on function public.storage_pets_pet_id(text) from public, anon;
grant execute on function public.storage_pets_pet_id(text) to authenticated, service_role;

-- The pet must be the caller's own (client_users linkage) AND live in the
-- business named by the path prefix — a foreign prefix is a spoof, denied.
-- Select is needed for signed photo URLs; update for the upsert re-upload.
create policy "client reads own pet media" on storage.objects for select
  using (bucket_id = 'media'
    and exists (
      select 1 from public.pets p
      where p.id = public.storage_pets_pet_id(objects.name)
        and p.business_id = public.storage_business_id(objects.name)
        and p.client_id in (select public.client_ids_for_user())));

create policy "client uploads own pet media" on storage.objects for insert
  with check (bucket_id = 'media'
    and exists (
      select 1 from public.pets p
      where p.id = public.storage_pets_pet_id(objects.name)
        and p.business_id = public.storage_business_id(objects.name)
        and p.client_id in (select public.client_ids_for_user())));

create policy "client replaces own pet media" on storage.objects for update
  using (bucket_id = 'media'
    and exists (
      select 1 from public.pets p
      where p.id = public.storage_pets_pet_id(objects.name)
        and p.business_id = public.storage_business_id(objects.name)
        and p.client_id in (select public.client_ids_for_user())))
  with check (bucket_id = 'media'
    and exists (
      select 1 from public.pets p
      where p.id = public.storage_pets_pet_id(objects.name)
        and p.business_id = public.storage_business_id(objects.name)
        and p.client_id in (select public.client_ids_for_user())));
