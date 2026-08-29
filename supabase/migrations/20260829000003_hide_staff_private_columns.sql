-- SECURITY (2026-08-29) — stop linked portal clients reading staff-private
-- notes straight from PostgREST.
--
-- Row policies for clients were correct, but the COLUMN grants underneath are
-- whole-table, so a linked client with their own JWT can hand-craft a select of
-- columns the app never fetches (the app is disciplined; the client controls
-- the HTTP request). Verified on hosted: `authenticated` holds SELECT on all of
--   clients.notes_md            (Alexandra's private notes about the client)
--   visit_reports.private_notes_md (the walker's private visit note)
--   visits.owner_notes_md       (the owner's private visit note)
--   visits.decline_reason       (why a walker declined)
-- price_cents_snapshot is already correctly withheld — same mechanism, applied.
--
-- The wrinkle: owner, walker and client are ALL the `authenticated` role, so a
-- column grant cannot show a column to staff but hide it from clients. So:
--
--  * clients.notes_md — the portal never reads the clients table at all (no
--    .from('clients') anywhere in the portal; it works off client_ids_for_user,
--    branding RPCs and child tables). So we simply DROP the client's SELECT
--    policy on clients. Owner/walker keep the full grant; the client loses the
--    only row-visibility that exposed the column. Nothing in the portal reads it.
--
--  * visit_reports.private_notes_md — no app surface selects it (grep: only
--    comments forbidding it). So column-scope the grant to every column EXCEPT
--    private_notes_md. Definer RPCs / service_role still read it.
--
--  * visits.owner_notes_md / decline_reason — the client's visit row-visibility
--    is load-bearing (report/event/track child policies EXISTS on it, and the
--    portal embeds visits!inner with SAFE columns), so it must stay. Instead we
--    revoke the two columns from `authenticated` (column-scoped grant) and
--    re-serve them to STAFF via a members-only definer view joined client-side
--    — exactly the services_public pattern the walker read path already uses.
--    PORTAL_VISIT_COLUMNS never lists these two, so the portal is untouched.

-- ===== clients.notes_md: drop the client's row visibility =====
drop policy if exists "client reads own client row" on public.clients;

-- ===== visit_reports.private_notes_md: column-scoped grant =====
revoke select on public.visit_reports from authenticated;
grant select (id, business_id, visit_id, public_token, summary,
              sent_at, sms_status, revoked_at, created_at, updated_at)
  on public.visit_reports to authenticated;

-- ===== visits.owner_notes_md / decline_reason: revoke the two columns =====
-- scheduling.sql (20260824000005) grants SELECT at the COLUMN level on visits.
-- A table-level `revoke select on visits` does NOT remove column-level grants
-- (verified on hosted), so revoke exactly the two columns — the rest of the
-- scheduling.sql column grant (including status, timings) stays intact.
revoke select (owner_notes_md, decline_reason) on public.visits from authenticated;

-- Staff-only view carrying the two private fields, joined client-side by the
-- owner/walker read paths (schedule/api.ts). security_invoker=off so the view
-- runs as its owner and bypasses base-table RLS; the WHERE reproduces the two
-- base-visit SELECT policies EXACTLY — owner sees their business's visits, a
-- walker sees only visits assigned/offered to them — so a client (neither) sees
-- no rows here, and a walker cannot see another walker's private fields.
create or replace view public.visit_private_fields
  with (security_invoker = off) as
  select v.id as visit_id, v.business_id, v.owner_notes_md, v.decline_reason
    from public.visits v
   where public.is_owner(v.business_id) or v.walker_id = (select auth.uid());

revoke all on public.visit_private_fields from public, anon;
grant select on public.visit_private_fields to authenticated;

comment on view public.visit_private_fields is
  'Members-only owner_notes_md/decline_reason for visits, joined client-side by staff read paths; clients are not members and see no rows (2026-08-29 security).';
