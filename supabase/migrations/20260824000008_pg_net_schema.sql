-- Advisor 0014 after Plan 3: pg_net was created in the public schema. Reinstall
-- it under `extensions`. Safe: pg_net's own objects live in the `net` schema
-- regardless, and the nightly cron references net.http_post only at run time
-- (its command is stored as text), so drop/recreate does not disturb the job.
drop extension if exists pg_net;
create extension pg_net with schema extensions;
