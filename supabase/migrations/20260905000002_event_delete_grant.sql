-- BUG FIX (round 5b, 2026-09-04 — Alexandria Chalet's TestFlight report:
-- Remove on a synced event failed with a permission error rendered as
-- "[object Object]"). 20260902000003 added the walker DELETE POLICY on
-- visit_events but not the table-level GRANT — RLS never runs when the grant
-- layer already refuses. The policy still scopes deletes to the walker's own
-- running visit, non-structural types only; this grant just lets the policy
-- be consulted. (Recurring lesson: grants and policies are separate layers —
-- same family as the 2026-08-23 "revoke from public" finding.)
grant delete on public.visit_events to authenticated;
