-- Plan 3 Task 4 — nightly expand-series cron (pg_cron + pg_net) and an
-- upsert-friendly unique index for expansion idempotency.

-- ===== visits_series_start: partial -> full unique index =====
-- The edge function dedupes with a PostgREST upsert
-- (`on_conflict=series_id,scheduled_start` + `Prefer: resolution=ignore-duplicates`),
-- which compiles to `ON CONFLICT (series_id, scheduled_start) DO NOTHING`.
-- Postgres cannot infer a PARTIAL unique index from a bare column-list conflict
-- target (it needs the index predicate, which PostgREST never emits), so the
-- Task 1 partial index would make every expansion upsert fail. A full unique
-- index has identical semantics here: one-off visits carry series_id NULL and
-- unique indexes treat NULLs as distinct, so one-offs still never conflict.
-- (Recorded in DEVIATIONS.md, Plan 3 Task 4.)
drop index if exists public.visits_series_start;
create unique index visits_series_start on public.visits(series_id, scheduled_start);

-- ===== extensions =====
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ===== vault secrets (guarded) =====
-- expand_cron_secret: shared secret the function checks on the { all: true } path.
--   Must match the function's EXPAND_CRON_SECRET env
--   (`supabase secrets set EXPAND_CRON_SECRET=...` on hosted;
--   supabase/functions/.env locally). Seeded random so no two stacks share it.
-- expand_project_url / expand_anon_key: pg_net needs an absolute functions URL and
--   a JWT that passes verify_jwt (the anon key; it grants nothing inside the
--   function — only the secret unlocks the cron path).
--
-- LOCAL is a deliberate no-op: pg_cron inside the db container cannot reach
-- `supabase functions serve` on the host, so the placeholder URL simply fails in
-- net._http_response at 03:00 with no other effect. The local test path is
-- `supabase functions serve` + a direct POST (see DEVIATIONS.md).
-- On HOSTED, set the real values once after deploying the function:
--   select vault.update_secret((select id from vault.secrets where name = 'expand_project_url'), '<https://PROJECT_REF.supabase.co>');
--   select vault.update_secret((select id from vault.secrets where name = 'expand_anon_key'), '<anon key>');
--   and align EXPAND_CRON_SECRET:
--   select vault.decrypted_secret from vault.decrypted_secrets where name = 'expand_cron_secret';
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'expand_cron_secret') then
    perform vault.create_secret(encode(gen_random_bytes(24), 'hex'), 'expand_cron_secret');
  end if;
  if not exists (select 1 from vault.secrets where name = 'expand_project_url') then
    perform vault.create_secret('http://127.0.0.1:54321', 'expand_project_url');
  end if;
  if not exists (select 1 from vault.secrets where name = 'expand_anon_key') then
    perform vault.create_secret('set-me-on-hosted', 'expand_anon_key');
  end if;
end $$;

-- ===== nightly schedule =====
-- '0 3 * * *' fires at 03:00 in the cluster's cron.timezone GUC, which Supabase
-- leaves at GMT — so 03:00 UTC, i.e. 21:00/22:00 America/Chicago depending on
-- DST. That is intentional: the schedule does NOT follow the business tz; the
-- 8-week look-ahead makes the exact firing hour immaterial.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'expand-series-nightly') then
    perform cron.unschedule('expand-series-nightly');
  end if;
end $$;

select cron.schedule(
  'expand-series-nightly',
  '0 3 * * *',
  $cron$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'expand_project_url')
           || '/functions/v1/expand-series',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer '
        || (select decrypted_secret from vault.decrypted_secrets where name = 'expand_anon_key'),
      'x-cron-secret',
        (select decrypted_secret from vault.decrypted_secrets where name = 'expand_cron_secret')
    ),
    body := jsonb_build_object('all', true),
    timeout_milliseconds := 15000
  );
  $cron$
);
