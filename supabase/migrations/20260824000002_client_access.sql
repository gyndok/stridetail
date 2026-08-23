-- Encrypted client access codes (door/lockbox/gate/alarm/key location/notes).
-- pgsodium is deprecated on new Supabase projects, so values are encrypted with
-- pgcrypto pgp_sym_encrypt; the symmetric key lives in Supabase Vault under the
-- name 'client_access_key' and is only ever touched inside the security definer
-- functions below (owned by the migration role, which can read
-- vault.decrypted_secrets — authenticated/anon have no vault access at all).

create extension if not exists pgcrypto with schema extensions;

-- Seed the Vault secret for local dev only, guarded so db reset reruns don't
-- duplicate. Hosted projects get the same secret via the deploy step (Task 8).
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'client_access_key') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'client_access_key',
      'symmetric key for client_access pgp encryption');
  end if;
end $$;

-- ===== client_access =====
create table public.client_access (
  client_id uuid primary key references public.clients(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  door_code_enc bytea,
  lockbox_code_enc bytea,
  gate_code_enc bytea,
  alarm_code_enc bytea,
  key_location_enc bytea,
  notes_enc bytea,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index client_access_business on public.client_access(business_id);

-- RLS on with NO policies: even if a grant ever slipped through, no role that is
-- subject to RLS can touch a row. The definer functions run as the table owner,
-- which bypasses (non-forced) RLS.
alter table public.client_access enable row level security;

-- Default privileges auto-grant new tables to authenticated/anon/service_role;
-- strip the app-facing roles entirely — every read and write goes through RPC.
revoke all on public.client_access from authenticated, anon;

-- ===== RPCs =====
create or replace function public.set_client_access(
  p_client uuid, p_door text, p_lockbox text, p_gate text,
  p_alarm text, p_key_location text, p_notes text
) returns void
language plpgsql security definer set search_path = public as $$
declare b uuid; k text;
begin
  select business_id into b from clients where id = p_client;
  if b is null then raise exception 'client not found'; end if;
  -- is_owner returns null (not false) when the caller has no membership at all,
  -- and `not null` never fires an if — test with `is not true`.
  if public.is_owner(b) is not true then raise exception 'only the business owner can set access codes'; end if;
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
  values (b, auth.uid(), 'access.set', 'client_access', p_client);
end $$;

create or replace function public.reveal_access_owner(p_client uuid)
returns table (door_code text, lockbox_code text, gate_code text,
               alarm_code text, key_location text, notes text)
language plpgsql security definer set search_path = public as $$
declare b uuid; k text;
begin
  select business_id into b from clients where id = p_client;
  if b is null then raise exception 'client not found'; end if;
  if public.is_owner(b) is not true then raise exception 'only the business owner can reveal access codes'; end if;
  select decrypted_secret into k from vault.decrypted_secrets where name = 'client_access_key';
  if k is null then raise exception 'client_access_key missing from vault'; end if;
  insert into audit_log (business_id, actor_user_id, action, entity, entity_id)
  values (b, auth.uid(), 'access.reveal_owner', 'client_access', p_client);
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

-- "codes on file" indicator for the UI without ever decrypting
create or replace function public.has_client_access(p_client uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare b uuid;
begin
  select business_id into b from clients where id = p_client;
  if b is null then raise exception 'client not found'; end if;
  if public.is_owner(b) is not true then raise exception 'only the business owner can check access codes'; end if;
  return exists (select 1 from client_access where client_id = p_client);
end $$;

-- ===== function grants =====
-- Functions are executable by PUBLIC (and default-ACL-granted) unless stripped.
revoke execute on function public.set_client_access(uuid, text, text, text, text, text, text) from public, anon;
revoke execute on function public.reveal_access_owner(uuid) from public, anon;
revoke execute on function public.has_client_access(uuid) from public, anon;
grant execute on function public.set_client_access(uuid, text, text, text, text, text, text) to authenticated;
grant execute on function public.reveal_access_owner(uuid) to authenticated;
grant execute on function public.has_client_access(uuid) to authenticated;
