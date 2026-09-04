-- Push channel (beta round 4, 2026-09-03: Alexandra — "notifications to
-- walkers for when a call needs to be reviewed and accepted/declined").
-- Wish-list #8, staff-first. Mirrors the sms/email queue exactly: DB writers
-- insert channel='push' notification rows at the three staff moments, and a
-- per-minute send-push cron drains them through Expo's push API.
--
-- "to" holds the RECIPIENT USER ID (uuid as text) — the sender resolves it to
-- Expo push tokens at send time, so a user with three devices gets three
-- pushes and a user with none becomes a terminal skip.

-- ===== push_tokens: one row per (user, device token) =====
create table public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null unique,
  platform text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index push_tokens_user on public.push_tokens(user_id);
alter table public.push_tokens enable row level security;

-- Users manage only their own device tokens; the sender reads via service role.
create policy "own tokens select" on public.push_tokens for select
  using (user_id = (select auth.uid()));
create policy "own tokens insert" on public.push_tokens for insert
  with check (user_id = (select auth.uid()));
create policy "own tokens update" on public.push_tokens for update
  using (user_id = (select auth.uid()));
create policy "own tokens delete" on public.push_tokens for delete
  using (user_id = (select auth.uid()));
grant select, insert, update, delete on public.push_tokens to authenticated;

-- ===== queue_push helper (mirror of queue_client_email) =====
create or replace function public.queue_push(
  p_business uuid, p_user uuid, p_template text, p_payload jsonb
) returns void language plpgsql security definer set search_path = public as $$
begin
  if p_user is null then return; end if;
  insert into notifications (business_id, channel, "to", template, payload, status, next_attempt_at)
  values (p_business, 'push', p_user::text, p_template, p_payload, 'queued', now());
end $$;
revoke execute on function public.queue_push(uuid, uuid, text, jsonb) from public, anon, authenticated;

-- ===== offer_visit (replaced: queues the walker's push) =====
-- Body identical to 20260824000005 plus the final queue_push line.
create or replace function public.offer_visit(p_visit uuid, p_walker uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v visits;
begin
  select * into v from visits where id = p_visit;
  if v.id is null then raise exception 'visit not found'; end if;
  if public.is_owner(v.business_id) is not true then
    raise exception 'only the business owner can offer visits';
  end if;
  if not exists (select 1 from memberships
                 where business_id = v.business_id and user_id = p_walker and status = 'active') then
    raise exception 'walker is not an active member of this business';
  end if;
  update visits
     set walker_id = p_walker, status = 'offered', decline_reason = null, updated_at = now()
   where id = p_visit;
  perform queue_push(v.business_id, p_walker, 'visit_offered',
                     jsonb_build_object('visitId', p_visit));
end $$;

-- ===== decline_visit (replaced: queues the owners' push) =====
-- Body identical to 20260824000005 plus the final owner loop. The declining
-- walker is captured BEFORE the update nulls walker_id.
create or replace function public.decline_visit(p_visit uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v visits; o record;
begin
  select * into v from visits where id = p_visit;
  if v.id is null then raise exception 'visit not found'; end if;
  if v.walker_id is null or v.walker_id is distinct from auth.uid() then
    raise exception 'only the offered walker can decline this visit';
  end if;
  if v.status <> 'offered' then raise exception 'visit is not offered'; end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'decline requires a reason';
  end if;
  update visits
     set status = 'unassigned', walker_id = null, decline_reason = p_reason, updated_at = now()
   where id = p_visit;
  for o in
    select user_id from memberships
     where business_id = v.business_id and role = 'owner' and status = 'active'
  loop
    perform queue_push(v.business_id, o.user_id, 'visit_declined',
                       jsonb_build_object('visitId', p_visit, 'reason', p_reason,
                                          'walkerId', v.walker_id));
  end loop;
end $$;

-- ===== booking requests: push the owners on arrival =====
create or replace function public.notify_booking_request()
returns trigger language plpgsql security definer set search_path = public as $$
declare o record;
begin
  for o in
    select user_id from memberships
     where business_id = new.business_id and role = 'owner' and status = 'active'
  loop
    perform queue_push(new.business_id, o.user_id, 'booking_request',
                       jsonb_build_object('requestId', new.id, 'clientId', new.client_id));
  end loop;
  return new;
end $$;

drop trigger if exists booking_request_push on public.booking_requests;
create trigger booking_request_push
  after insert on public.booking_requests
  for each row execute function public.notify_booking_request();

-- ===== per-minute send-push cron (mirror of send-sms/send-email) =====
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'push_cron_secret') then
    perform vault.create_secret(encode(gen_random_bytes(24), 'hex'), 'push_cron_secret');
  end if;
end $$;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'send-push-every-minute') then
    perform cron.unschedule('send-push-every-minute');
  end if;
end $$;

select cron.schedule(
  'send-push-every-minute',
  '* * * * *',
  $cron$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'expand_project_url')
           || '/functions/v1/send-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer '
        || (select decrypted_secret from vault.decrypted_secrets where name = 'expand_anon_key'),
      'x-cron-secret',
        (select decrypted_secret from vault.decrypted_secrets where name = 'push_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 15000
  );
  $cron$
);
