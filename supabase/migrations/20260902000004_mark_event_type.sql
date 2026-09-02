-- Custom map marks (beta wish list #1, 2026-09-01): a walker drops a labeled
-- pin at the current moment. Rides the whole existing event pipeline — outbox
-- sync, nearest-in-time pin placement, walker delete policy (non-structural),
-- report timeline, static report map (public/markers/mark.png).
alter type public.event_type add value if not exists 'mark' after 'photo';
