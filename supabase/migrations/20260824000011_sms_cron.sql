-- Plan 4 Task 6 — per-minute send-sms cron (pg_cron + pg_net), owner invite-SMS
-- insert policy, and a next_attempt_at default so no queued row can be born
-- invisible to the due-row picker.
--
-- Retry policy lives in the FUNCTION, not SQL (recorded per the plan's
-- "pick one"): the function claims due rows (status='queued',
-- next_attempt_at <= now(), oldest first, limit 25) with an
-- UPDATE ... WHERE status='queued' RETURNING claim so concurrent invocations
-- can never double-send, then applies the 1/5/15/60/60/60-minute backoff and
-- the 6-attempt cap itself. The cron job is a dumb metronome.

-- ===== notifications: owner invite-SMS path =====
-- Task 1 made notifications owner-SELECT only (writes via RPCs + service role).
-- The Team screen's "Queue SMS invite" needs a narrow owner INSERT: sms channel,
-- invite template, own business, born 'queued'. Everything else about the row
-- (attempts, provider_id, status transitions) stays the sender's business.
grant insert on public.notifications to authenticated;

create policy "owner queues invite sms" on public.notifications for insert
  with check (
    public.is_owner(business_id)
    and channel = 'sms'
    and template = 'invite'
    and status = 'queued'
  );

-- A queued row with next_attempt_at NULL would never match the picker's
-- `next_attempt_at <= now()` — default it to now() so client inserts that omit
-- the column (and any future queue writer) are due immediately.
alter table public.notifications alter column next_attempt_at set default now();

-- ===== vault secret (guarded) =====
-- sms_cron_secret: shared secret the function checks on every request.
--   Must match the function's SMS_CRON_SECRET env
--   (`supabase secrets set SMS_CRON_SECRET=...` on hosted;
--   supabase/functions/.env locally). Seeded random so no two stacks share it.
--   Deliberately a SEPARATE secret from expand_cron_secret: leaking one never
--   unlocks the other function.
-- expand_project_url / expand_anon_key are REUSED from migration
-- 20260824000007 (same project URL, same anon key) — not duplicated.
--
-- LOCAL is a deliberate no-op: pg_cron inside the db container cannot reach
-- `supabase functions serve` on the host, so the placeholder URL simply fails in
-- net._http_response every minute with no other effect. The local test path is
-- `supabase functions serve send-sms` + a direct POST (see DEVIATIONS.md).
-- On HOSTED, after deploying the function, align the env secret:
--   select decrypted_secret from vault.decrypted_secrets where name = 'sms_cron_secret';
--   supabase secrets set SMS_CRON_SECRET=<that value>
--   (expand_project_url / expand_anon_key were already set to real values in
--   the Plan 3 Task 9 hosted deploy; nothing further to update here.)
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'sms_cron_secret') then
    perform vault.create_secret(encode(gen_random_bytes(24), 'hex'), 'sms_cron_secret');
  end if;
end $$;

-- ===== per-minute schedule =====
-- '* * * * *': the queue is drained every minute; an empty queue is a cheap
-- no-op (the function returns before any provider work). Backoff timing
-- resolution is therefore one minute, which the 1/5/15/60 schedule tolerates.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'send-sms-every-minute') then
    perform cron.unschedule('send-sms-every-minute');
  end if;
end $$;

select cron.schedule(
  'send-sms-every-minute',
  '* * * * *',
  $cron$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'expand_project_url')
           || '/functions/v1/send-sms',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer '
        || (select decrypted_secret from vault.decrypted_secrets where name = 'expand_anon_key'),
      'x-cron-secret',
        (select decrypted_secret from vault.decrypted_secrets where name = 'sms_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 15000
  );
  $cron$
);
