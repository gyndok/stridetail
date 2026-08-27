-- Plan 8 Task 3 — invite-your-client + claim linking.
--
-- Owner side: invite_client_to_portal(p_client) stamps clients.portal_invited_at
-- and queues a 'client_invite' email (queue_client_email). Client side:
-- claim_client_links() runs as the freshly OTP'd auth user and links every
-- clients row whose lower/trimmed email equals the caller's auth email — but
-- ONLY in businesses that invited it (portal_invited_at is not null). The OTP
-- to the on-file address is the ownership proof (spec §Task 3).
--
-- Recorded choices (also in DEVIATIONS.md, Plan 8 Task 3):
-- * TIGHTENING vs a bare email match: linking REQUIRES portal_invited_at.
--   A random OTP user whose email merely matches a client row in a business
--   that never invited them does NOT get linked — the owner's invite is the
--   consent gate, per business.
-- * linked_via is 'invite' for every v1 link: because portal_invited_at is
--   required, every path through this RPC IS the invite path. 'claim' stays
--   reserved for Plan 9's tokened self-claim CTA (no owner invite).
-- * Audit rows: invite -> 'client.portal_invite' (entity 'client'); each
--   created link -> 'client_user.link' (entity 'client_user', the new row id,
--   with client/business/via in meta).
-- * Re-invite is idempotent-by-design: re-stamps portal_invited_at and queues
--   another email (the owner's "they lost it" button).

-- ===== portal-invited flag =====
alter table public.clients add column portal_invited_at timestamptz;

-- ===== invite_client_to_portal =====
create or replace function public.invite_client_to_portal(p_client uuid)
returns void language plpgsql security definer set search_path = public as $$
declare c clients;
begin
  select * into c from clients where id = p_client;
  if c.id is null then raise exception 'client not found'; end if;
  if public.is_owner(c.business_id) is not true then
    raise exception 'only the business owner can invite clients to the portal';
  end if;
  if c.email is null or btrim(c.email) = '' then
    raise exception 'client has no email on file — add one before inviting';
  end if;
  update clients set portal_invited_at = now(), updated_at = now() where id = p_client;
  perform queue_client_email(c.business_id, p_client, 'client_invite',
    jsonb_build_object(
      'clientId', p_client,
      'businessName', (select b.name from businesses b where b.id = c.business_id),
      'portalUrl', 'https://stridetail.app/portal-login'));
  insert into audit_log (business_id, actor_user_id, action, entity, entity_id, meta)
  values (c.business_id, auth.uid(), 'client.portal_invite', 'client', p_client,
          jsonb_build_object('email', lower(btrim(c.email))));
end $$;

-- ===== claim_client_links =====
-- Definer: reads auth.users for the CALLER's email only, inserts client_users
-- rows the caller could never insert directly (015: clients have no write path
-- on client_users at all). Returns {linked, links:[{client_id, business_id}]}.
create or replace function public.claim_client_links()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  em text;
  r record;
  lid uuid;
  made jsonb := '[]'::jsonb;
  n int := 0;
begin
  if uid is null then raise exception 'not signed in'; end if;
  select lower(btrim(u.email)) into em from auth.users u where u.id = uid;
  if em is null or em = '' then
    return jsonb_build_object('linked', 0, 'links', '[]'::jsonb);
  end if;
  for r in
    select c.id as client_id, c.business_id
      from clients c
     where c.portal_invited_at is not null
       and lower(btrim(c.email)) = em
       and not exists (select 1 from client_users cu
                        where cu.client_id = c.id and cu.user_id = uid)
     order by c.id
  loop
    insert into client_users (business_id, client_id, user_id, linked_via)
    values (r.business_id, r.client_id, uid, 'invite')
    returning id into lid;
    insert into audit_log (business_id, actor_user_id, action, entity, entity_id, meta)
    values (r.business_id, uid, 'client_user.link', 'client_user', lid,
            jsonb_build_object('client_id', r.client_id,
                               'business_id', r.business_id,
                               'linked_via', 'invite'));
    made := made || jsonb_build_object('client_id', r.client_id, 'business_id', r.business_id);
    n := n + 1;
  end loop;
  return jsonb_build_object('linked', n, 'links', made);
end $$;

-- ===== grants =====
-- House rule: strip PUBLIC/anon from every function, then grant exactly.
revoke execute on function public.invite_client_to_portal(uuid) from public, anon;
revoke execute on function public.claim_client_links() from public, anon;
grant execute on function public.invite_client_to_portal(uuid) to authenticated;
grant execute on function public.claim_client_links() to authenticated;
