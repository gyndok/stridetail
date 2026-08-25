-- Email channel (post-Plan-4 strategy: no Twilio 10DLC — see docs/HANDOFF.md).
-- start_visit/finish_visit now ALSO queue a channel='email' notification to
-- clients.email when present, keeping the sms row — each channel's sender
-- (send-sms / send-email) decides deliverability for its own rows. The
-- notifications table needs no schema change: channel is plain text (Task 1).
--
-- Also schedules the per-minute send-email pg_cron job (mirror of
-- 20260824000011's send-sms job) with its OWN vault secret.

-- ===== queue_client_email helper =====
-- Mirror of queue_client_sms: silently skips when the client has no email on
-- file (the visit proceeds, nothing to notify on this channel).
create or replace function public.queue_client_email(
  p_business uuid, p_client uuid, p_template text, p_payload jsonb
) returns void language plpgsql security definer set search_path = public as $$
declare em text;
begin
  select email into em from clients where id = p_client;
  if em is null or em = '' then return; end if;
  insert into notifications (business_id, channel, "to", template, payload, status, next_attempt_at)
  values (p_business, 'email', em, p_template, p_payload, 'queued', now());
end $$;

-- ===== start_visit (replaced: adds the email queue call) =====
-- Body identical to 20260824000009 except the final queue_client_email line.
create or replace function public.start_visit(p_visit uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v visits;
begin
  select * into v from visits where id = p_visit;
  if v.id is null then raise exception 'visit not found'; end if;
  if v.walker_id is null or v.walker_id is distinct from auth.uid() then
    raise exception 'only the assigned walker can start this visit';
  end if;
  if v.status <> 'accepted' then
    raise exception 'visit is not accepted (status: %)', v.status;
  end if;
  update visits set status = 'in_progress', started_at = now() where id = p_visit;
  insert into visit_events (business_id, visit_id, type, occurred_at, client_uuid)
  values (v.business_id, p_visit, 'arrived', now(), gen_random_uuid()),
         (v.business_id, p_visit, 'started', now(), gen_random_uuid());
  perform queue_client_sms(v.business_id, v.client_id, 'visit_started',
                           jsonb_build_object('visitId', p_visit));
  perform queue_client_email(v.business_id, v.client_id, 'visit_started',
                             jsonb_build_object('visitId', p_visit));
end $$;

-- ===== finish_visit (replaced: adds the email queue call) =====
-- Body identical to 20260824000009 except the final queue_client_email line.
create or replace function public.finish_visit(p_visit uuid, p_private_notes text)
returns void language plpgsql security definer set search_path = public as $$
declare v visits; dist double precision; tok text; summ jsonb;
begin
  select * into v from visits where id = p_visit;
  if v.id is null then raise exception 'visit not found'; end if;
  if v.walker_id is null or v.walker_id is distinct from auth.uid() then
    raise exception 'only the assigned walker can finish this visit';
  end if;
  if v.status <> 'in_progress' then
    raise exception 'visit is not in progress (status: %)', v.status;
  end if;
  insert into visit_events (business_id, visit_id, type, occurred_at, client_uuid)
  values (v.business_id, p_visit, 'finished', now(), gen_random_uuid());
  update visits set status = 'completed', finished_at = now() where id = p_visit;
  dist := recompute_visit_distance(p_visit);
  select * into v from visits where id = p_visit;
  summ := jsonb_build_object(
    'petNames', coalesce((select jsonb_agg(p.name order by p.name)
                          from pets p where p.id = any(v.pet_ids)), '[]'::jsonb),
    'serviceName', (select s.name from services s where s.id = v.service_id),
    'scheduledStart', v.scheduled_start,
    'scheduledEnd', v.scheduled_end,
    'startedAt', v.started_at,
    'finishedAt', v.finished_at,
    'durationMin', case when v.started_at is null then null
                        else round(extract(epoch from (v.finished_at - v.started_at)) / 60.0)::int end,
    'distanceM', dist,
    'eventCounts', coalesce((select jsonb_object_agg(c.t, c.n)
                             from (select type::text as t, count(*) as n
                                   from visit_events where visit_id = p_visit
                                   group by type) c), '{}'::jsonb));
  tok := encode(extensions.gen_random_bytes(24), 'hex');
  insert into visit_reports (business_id, visit_id, public_token, summary, private_notes_md)
  values (v.business_id, p_visit, tok, summ, p_private_notes);
  perform queue_client_sms(v.business_id, v.client_id, 'visit_finished',
                           jsonb_build_object('visitId', p_visit, 'reportToken', tok));
  perform queue_client_email(v.business_id, v.client_id, 'visit_finished',
                             jsonb_build_object('visitId', p_visit, 'reportToken', tok));
end $$;

-- resend_report deliberately stays sms-only: it is the owner's explicit
-- "resend the SMS" action (the owner shares the link by email/other means via
-- the Share button). Revisit if an explicit "resend email" action is wanted.

-- ===== grants =====
-- Definer helper: only the RPCs reach it (queue_client_sms pattern).
revoke execute on function public.queue_client_email(uuid, uuid, text, jsonb) from public, anon, authenticated;
-- start_visit/finish_visit keep their 0009 grants across create-or-replace
-- (grants attach to the function signature and survive replacement), but
-- re-state them so this migration stands alone if 0009's ever change.
revoke execute on function public.start_visit(uuid) from public, anon;
revoke execute on function public.finish_visit(uuid, text) from public, anon;
grant execute on function public.start_visit(uuid) to authenticated;
grant execute on function public.finish_visit(uuid, text) to authenticated;

-- ===== vault secret (guarded) =====
-- email_cron_secret: must match the send-email function's EMAIL_CRON_SECRET
-- env (`supabase secrets set EMAIL_CRON_SECRET=...` on hosted;
-- supabase/functions/.env locally). Its OWN secret — leaking the sms or expand
-- secret never unlocks this function, and vice versa.
-- expand_project_url / expand_anon_key are REUSED from migration
-- 20260824000007 (same project URL, same anon key) — not duplicated.
--
-- LOCAL is a deliberate no-op exactly like 0007/0011: pg_cron inside the db
-- container cannot reach `supabase functions serve` on the host. The local
-- test path is `supabase functions serve send-email` + a direct POST.
-- On HOSTED, after deploying the function, align the env secret:
--   select decrypted_secret from vault.decrypted_secrets where name = 'email_cron_secret';
--   supabase secrets set EMAIL_CRON_SECRET=<that value>
--   supabase secrets set RESEND_API_KEY=<resend key> EMAIL_FROM=<from address>
--   (until RESEND_API_KEY/EMAIL_FROM are set the function marks rows
--   skipped_no_provider — same testable-before-credentials pattern as SMS.)
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'email_cron_secret') then
    perform vault.create_secret(encode(gen_random_bytes(24), 'hex'), 'email_cron_secret');
  end if;
end $$;

-- ===== per-minute schedule =====
do $$
begin
  if exists (select 1 from cron.job where jobname = 'send-email-every-minute') then
    perform cron.unschedule('send-email-every-minute');
  end if;
end $$;

select cron.schedule(
  'send-email-every-minute',
  '* * * * *',
  $cron$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'expand_project_url')
           || '/functions/v1/send-email',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer '
        || (select decrypted_secret from vault.decrypted_secrets where name = 'expand_anon_key'),
      'x-cron-secret',
        (select decrypted_secret from vault.decrypted_secrets where name = 'email_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 15000
  );
  $cron$
);
