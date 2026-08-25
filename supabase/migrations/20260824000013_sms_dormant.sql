-- SMS channel goes dormant (post-Plan-4 strategy, sponsor request: kill the
-- permanent "SMS pending setup" needs-attention noise). Twilio 10DLC was
-- dropped (docs/HANDOFF.md); email (Resend) is the live channel. This
-- migration stops NEW sms rows from being queued and stops the sms cron —
-- the send-sms function, its templates, queue_client_sms, and the
-- notifications.channel machinery all stay deployed, dormant, for a possible
-- toll-free future. Existing sms notification rows are deliberately KEPT
-- (delivery history).
--
-- Re-enable hooks (toll-free future), in one place:
--   1. Re-add the `perform queue_client_sms(...)` calls to start_visit /
--      finish_visit (see the 0012 bodies) — and to resend_report if wanted.
--   2. Re-schedule the cron (see the commented cron.schedule at the bottom).

-- ===== start_visit (replaced: email-only queueing) =====
-- Body identical to 20260824000012 minus the queue_client_sms call.
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
  perform queue_client_email(v.business_id, v.client_id, 'visit_started',
                             jsonb_build_object('visitId', p_visit));
end $$;

-- ===== finish_visit (replaced: email-only queueing) =====
-- Body identical to 20260824000012 minus the queue_client_sms call.
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
  perform queue_client_email(v.business_id, v.client_id, 'visit_finished',
                             jsonb_build_object('visitId', p_visit, 'reportToken', tok));
end $$;

-- ===== resend_report (replaced: re-queues the EMAIL notification) =====
-- 0012 left resend sms-only; with sms dormant the owner's "resend" action now
-- re-queues the visit_finished EMAIL. Audit action stays 'report.resend'.
create or replace function public.resend_report(p_visit uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v visits; r visit_reports; em text;
begin
  select * into v from visits where id = p_visit;
  if v.id is null then raise exception 'visit not found'; end if;
  if public.is_owner(v.business_id) is not true then
    raise exception 'only the business owner can resend reports';
  end if;
  select * into r from visit_reports where visit_id = p_visit;
  if r.id is null then raise exception 'no report for this visit'; end if;
  if r.revoked_at is not null then raise exception 'report has been revoked'; end if;
  select email into em from clients where id = v.client_id;
  if em is null or em = '' then
    raise exception 'client has no email on file';
  end if;
  perform queue_client_email(v.business_id, v.client_id, 'visit_finished',
                             jsonb_build_object('visitId', p_visit, 'reportToken', r.public_token));
  update visit_reports set sent_at = now(), updated_at = now() where visit_id = p_visit;
  insert into audit_log (business_id, actor_user_id, action, entity, entity_id, meta)
  values (v.business_id, auth.uid(), 'report.resend', 'visit_report', r.id,
          jsonb_build_object('visit_id', p_visit));
end $$;

-- ===== grants (re-stated so this migration stands alone) =====
revoke execute on function public.start_visit(uuid) from public, anon;
revoke execute on function public.finish_visit(uuid, text) from public, anon;
revoke execute on function public.resend_report(uuid) from public, anon;
grant execute on function public.start_visit(uuid) to authenticated;
grant execute on function public.finish_visit(uuid, text) to authenticated;
grant execute on function public.resend_report(uuid) to authenticated;

-- ===== stop the sms cron =====
-- The queue no longer grows sms rows; a per-minute drain of nothing is pure
-- noise (and on hosted it POSTs send-sms sixty times an hour for zero rows).
-- The function + templates + sms_cron_secret stay deployed and dormant.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'send-sms-every-minute') then
    perform cron.unschedule('send-sms-every-minute');
  end if;
end $$;

-- Toll-free re-enable: restore the schedule with the 0011 job verbatim —
-- select cron.schedule('send-sms-every-minute', '* * * * *', $cron$ ... net.http_post to /functions/v1/send-sms ... $cron$);
-- (full body in 20260824000011_sms_cron.sql; secrets are all still in vault.)
