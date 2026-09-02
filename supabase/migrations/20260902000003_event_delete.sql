-- Walker deletes a mis-logged event during the walk (beta wish list #2,
-- 2026-09-01: "remove markers before the report is created and sent").
-- Same guard shape as the insert policy: own visit, still in progress. The
-- structural rows ('started'/'finished' — written by the start/finish RPCs)
-- are excluded so the timeline's spine can't be edited away. After finish the
-- visit leaves 'in_progress' and deletion closes with it — exactly the window
-- Alexandra asked for.
create policy "walker deletes events on own running visit" on public.visit_events for delete
  using (
    type not in ('started', 'finished')
    and exists (
      select 1 from public.visits v
      where v.id = visit_events.visit_id
        and v.walker_id = (select auth.uid())
        and v.status = 'in_progress'));
