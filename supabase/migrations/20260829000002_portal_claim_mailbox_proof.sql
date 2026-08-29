-- SECURITY (2026-08-29) — close the portal account-takeover that yields
-- decrypted door codes.
--
-- THE HOLE: claim_client_links() (20260826000003) links the caller to every
-- portal-invited clients row whose email matches auth.users.email, trusting
-- that email as mailbox proof. But email confirmation is OFF on hosted
-- (verified: all users auto-confirmed in <20ms), signup is open, and the anon
-- key ships in the app — so anyone who knows a client's email can signUp() with
-- it, get an auto-confirmed PASSWORD session without touching that inbox, call
-- claim_client_links, and become that client: home address, and via
-- reveal_client_access_self the DECRYPTED door/lockbox/gate/alarm codes (which
-- they can also overwrite). Arms the moment the first real client is invited.
--
-- THE FIX (Sep-1 surgical, review option "a", hardened): gate the claim on the
-- session having authenticated by an EMAIL ONE-TIME CODE, not a password. The
-- portal's only login path is signInWithOtp -> verifyOtp (session.ts), so an
-- OTP session inherently proves the caller received a code sent to that inbox —
-- mailbox control. A password signup (staff path) can never satisfy it, so it
-- can never claim links. Owners/walkers never call claim_client_links, so this
-- does not touch Alexandra's own Sep-1 signup.
--
-- Why read auth.mfa_amr_claims and not only the JWT `amr` array: the amr array's
-- presence in the access token varies by GoTrue config/version, whereas
-- mfa_amr_claims is the authoritative per-session record GoTrue writes on every
-- login (verified present on hosted). We accept EITHER signal so a real OTP
-- login is never falsely blocked, while a password-only session satisfies
-- neither. 'magiclink' is accepted alongside 'otp' — both are mailbox-proof.
--
-- The durable design (token-carried claim mirroring the walker invite) is
-- recorded in DEVIATIONS.md as the Phase-B replacement; this gate is immune to
-- the email-confirmation setting in the meantime.

create or replace function public.session_is_mailbox_proven()
returns boolean
language sql stable security definer set search_path = public, auth as $$
  select
    -- (1) authoritative: this session's recorded auth method
    exists (
      select 1 from auth.mfa_amr_claims c
      where c.session_id = nullif(auth.jwt() ->> 'session_id', '')::uuid
        and c.authentication_method in ('otp', 'magiclink')
    )
    -- (2) belt: the amr array in the JWT, when GoTrue includes it
    or coalesce(
      (select bool_or((e ->> 'method') in ('otp', 'magiclink'))
       from jsonb_array_elements(
         case when jsonb_typeof(auth.jwt() -> 'amr') = 'array'
              then auth.jwt() -> 'amr' else '[]'::jsonb end) e),
      false);
$$;

revoke execute on function public.session_is_mailbox_proven() from public, anon;
grant execute on function public.session_is_mailbox_proven() to authenticated;

-- Re-create claim_client_links with the mailbox-proof gate as its first act.
-- Body is otherwise byte-identical to 20260826000003.
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
  -- Mailbox proof: only an email one-time-code (or magic-link) session may
  -- claim links. A password session — the only way to sign in without ever
  -- opening the mailbox — is refused, closing the takeover.
  if not public.session_is_mailbox_proven() then
    raise exception 'link claim requires signing in with an email code';
  end if;
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

revoke execute on function public.claim_client_links() from public, anon;
grant execute on function public.claim_client_links() to authenticated;
