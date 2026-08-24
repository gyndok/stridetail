-- Plan 3 Task 2 — walker visibility via visits + reveal_access(visit_id).
--
-- Visibility scope (recorded in DEVIATIONS.md): ANY visit row with
-- walker_id = auth.uid() and a matching client grants read — regardless of the
-- visit's status. Completed and cancelled visits keep the walker's access; a
-- declined visit grants nothing because decline clears walker_id (Task 1
-- trigger). Simple, index-friendly, and defensible: whoever is or was booked
-- for a client legitimately needs the pet context.

-- Keeps the policy subqueries index-friendly: (walker_id, client_id) resolves
-- both the walker filter and the client match in one index-only scan.
create index visits_walker_client on public.visits(walker_id, client_id)
  where walker_id is not null;

-- ===== walker select policies (writes stay owner-only, untouched) =====
-- auth.uid() is wrapped in a scalar subselect so the planner evaluates it once
-- (initplan) instead of per row.
create policy "walker reads clients via visits" on public.clients for select
  using (exists (
    select 1 from public.visits v
    where v.walker_id = (select auth.uid()) and v.client_id = clients.id));

create policy "walker reads pets via visits" on public.pets for select
  using (exists (
    select 1 from public.visits v
    where v.walker_id = (select auth.uid()) and v.client_id = pets.client_id));

create policy "walker reads pet documents via visits" on public.pet_documents for select
  using (exists (
    select 1 from public.pets p
    join public.visits v on v.client_id = p.client_id
    where p.id = pet_documents.pet_id and v.walker_id = (select auth.uid())));

-- ===== reveal_access(visit_id): the walker-side gated reveal =====
-- Mirrors reveal_access_owner (Plan 2 Task 2): same Vault key, same pgp decrypt
-- path, definer so the caller never touches client_access or the key. Gates:
-- caller is the visit's walker AND the visit is in_progress AND codes are on
-- file. Every denial raises before the audit insert, so denied attempts leave
-- no trail rows; the successful reveal is audited with the visit id in meta.
create or replace function public.reveal_access(p_visit uuid)
returns table (door_code text, lockbox_code text, gate_code text,
               alarm_code text, key_location text, notes text)
language plpgsql security definer set search_path = public as $$
declare v visits; k text;
begin
  select * into v from visits where id = p_visit;
  if v.id is null then raise exception 'visit not found'; end if;
  -- auth.uid() is null for keyless callers; `is distinct from` keeps that a denial.
  if v.walker_id is null or v.walker_id is distinct from auth.uid() then
    raise exception 'only the assigned walker can reveal access codes';
  end if;
  if v.status <> 'in_progress' then
    raise exception 'access codes are only available while the visit is in progress';
  end if;
  if not exists (select 1 from client_access
                 where client_id = v.client_id and business_id = v.business_id) then
    raise exception 'no access codes on file for this client';
  end if;
  select decrypted_secret into k from vault.decrypted_secrets where name = 'client_access_key';
  if k is null then raise exception 'client_access_key missing from vault'; end if;
  insert into audit_log (business_id, actor_user_id, action, entity, entity_id, meta)
  values (v.business_id, auth.uid(), 'access.reveal', 'client_access', v.client_id,
          jsonb_build_object('visit_id', v.id));
  return query
    select
      case when ca.door_code_enc is null then null else extensions.pgp_sym_decrypt(ca.door_code_enc, k) end,
      case when ca.lockbox_code_enc is null then null else extensions.pgp_sym_decrypt(ca.lockbox_code_enc, k) end,
      case when ca.gate_code_enc is null then null else extensions.pgp_sym_decrypt(ca.gate_code_enc, k) end,
      case when ca.alarm_code_enc is null then null else extensions.pgp_sym_decrypt(ca.alarm_code_enc, k) end,
      case when ca.key_location_enc is null then null else extensions.pgp_sym_decrypt(ca.key_location_enc, k) end,
      case when ca.notes_enc is null then null else extensions.pgp_sym_decrypt(ca.notes_enc, k) end
    from client_access ca
    where ca.client_id = v.client_id;
end $$;

-- Functions get PUBLIC execute by default — strip it, then grant exactly.
revoke execute on function public.reveal_access(uuid) from public, anon;
grant execute on function public.reveal_access(uuid) to authenticated;
