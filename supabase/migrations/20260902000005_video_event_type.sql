-- Report videos (beta wish list #7, 2026-09-01; Alexandra's cap: 10 seconds).
-- A 'video' event stores its clip in the media bucket via the photo pipeline
-- (photo_path holds the storage path; report-public signs it like any media).
-- The camera enforces the 10s cap client-side (videoMaxDuration).
alter type public.event_type add value if not exists 'video' after 'mark';
