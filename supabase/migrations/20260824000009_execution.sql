-- Plan 4 Task 1 — visit execution: visit_events, visit_tracks, visit_reports,
-- notifications, start/finish RPCs, report resend/revoke, distance recompute
-- (spec §5, §6.4, §11 stages 6–8).
--
-- Probe (recorded): auth.uid() inside a SECURITY DEFINER function still returns
-- the CALLER's JWT sub (it reads the request.jwt.claims GUC, which definer
-- context does not change). The Plan-3 transition trigger therefore validates
-- walker + transition when start_visit/finish_visit update visits.status —
-- the RPCs run as the table owner (RLS bypassed) but the who-check still sees
-- the walker.

-- ===== types =====
create type public.event_type as enum
  ('arrived', 'started', 'pee', 'poop', 'ate', 'drank', 'meds', 'note', 'photo', 'finished');

create type public.notification_status as enum
  ('queued', 'sending', 'sent', 'failed', 'skipped_no_provider');

-- ===== visit_events =====
-- client_uuid is the offline-sync idempotency key: the app generates it locally
-- and replays inserts with on-conflict-do-nothing; a replay can never duplicate.
create table public.visit_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  visit_id uuid not null references public.visits(id) on delete cascade,
  pet_id uuid references public.pets(id) on delete set null,
  type public.event_type not null,
  occurred_at timestamptz not null default now(),
  text text,
  photo_path text,
  client_uuid uuid not null unique,
  created_at timestamptz not null default now()
);
create index visit_events_visit on public.visit_events(visit_id, occurred_at);
create index visit_events_business on public.visit_events(business_id);

-- ===== visit_tracks =====
-- One row per GPS segment; points is the ordered array of {t,lat,lng,acc?}.
create table public.visit_tracks (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  visit_id uuid not null references public.visits(id) on delete cascade,
  segment_no int not null check (segment_no >= 0),
  points jsonb not null default '[]'::jsonb,
  client_uuid uuid not null unique,
  created_at timestamptz not null default now()
);
create index visit_tracks_visit on public.visit_tracks(visit_id, segment_no);
create index visit_tracks_business on public.visit_tracks(business_id);

-- ===== visit_reports =====
-- summary holds ONLY report-safe fields (spec §6.4) — never address, codes,
-- price, or walker contact; events themselves are read live by report-public.
create table public.visit_reports (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  visit_id uuid not null unique references public.visits(id) on delete cascade,
  public_token text not null unique,
  summary jsonb not null default '{}'::jsonb,
  private_notes_md text,
  sent_at timestamptz,
  sms_status text,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index visit_reports_business on public.visit_reports(business_id);

-- ===== notifications =====
-- The outbound SMS queue (Task 6 drains it). "to" is quoted everywhere: TO is a
-- reserved word, and the plan names the column literally.
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  channel text not null default 'sms',
  "to" text not null,
  template text not null,
  payload jsonb not null default '{}'::jsonb,
  status public.notification_status not null default 'queued',
  provider_id text,
  attempts int not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index notifications_business on public.notifications(business_id);
-- Queue picker: due rows only.
create index notifications_due on public.notifications(next_attempt_at)
  where status = 'queued';

-- ===== RLS =====
alter table public.visit_events enable row level security;
alter table public.visit_tracks enable row level security;
alter table public.visit_reports enable row level security;
alter table public.notifications enable row level security;

-- Events/tracks: the walker writes them directly (offline sync path) but only on
-- their own visit while it is running, and only with the visit's own business_id
-- (no tenant spoofing). Reads: owner sees everything in the business; the walker
-- sees their own visits' rows regardless of status (report disputes, mirrors the
-- Plan-3 visibility decision). auth.uid() wrapped in a scalar subselect so the
-- planner evaluates it once.
create policy "owner reads events" on public.visit_events for select
  using (public.is_owner(business_id));
create policy "walker reads own visit events" on public.visit_events for select
  using (exists (
    select 1 from public.visits v
    where v.id = visit_events.visit_id and v.walker_id = (select auth.uid())));
create policy "walker logs events on own running visit" on public.visit_events for insert
  with check (exists (
    select 1 from public.visits v
    where v.id = visit_events.visit_id
      and v.walker_id = (select auth.uid())
      and v.status = 'in_progress'
      and v.business_id = visit_events.business_id));

create policy "owner reads tracks" on public.visit_tracks for select
  using (public.is_owner(business_id));
create policy "walker reads own visit tracks" on public.visit_tracks for select
  using (exists (
    select 1 from public.visits v
    where v.id = visit_tracks.visit_id and v.walker_id = (select auth.uid())));
create policy "walker logs tracks on own running visit" on public.visit_tracks for insert
  with check (exists (
    select 1 from public.visits v
    where v.id = visit_tracks.visit_id
      and v.walker_id = (select auth.uid())
      and v.status = 'in_progress'
      and v.business_id = visit_tracks.business_id));

-- Reports: select only (owner all, walker own); every write goes through the
-- definer RPCs below — no client-role insert/update/delete policy or grant.
create policy "owner reads reports" on public.visit_reports for select
  using (public.is_owner(business_id));
create policy "walker reads own visit report" on public.visit_reports for select
  using (exists (
    select 1 from public.visits v
    where v.id = visit_reports.visit_id and v.walker_id = (select auth.uid())));

-- Notifications: owner-select only; rows are written by the RPCs (definer) and
-- the Task-6 sender (service role).
create policy "owner reads notifications" on public.notifications for select
  using (public.is_owner(business_id));

-- ===== helpers =====
-- Queue an SMS to the client's first phone; silently skips when the client has
-- no phone on file (recorded: the visit proceeds, nothing to notify).
create or replace function public.queue_client_sms(
  p_business uuid, p_client uuid, p_template text, p_payload jsonb
) returns void language plpgsql security definer set search_path = public as $$
declare ph text;
begin
  select phones[1] into ph from clients where id = p_client;
  if ph is null then return; end if;
  insert into notifications (business_id, channel, "to", template, payload, status, next_attempt_at)
  values (p_business, 'sms', ph, p_template, p_payload, 'queued', now());
end $$;

-- ===== recompute_visit_distance =====
-- SQL mirror of src/lib/gps/geo.ts trackDistanceMeters: same Earth radius
-- (6371008.8 m), points with acc > 50 dropped (points without acc kept),
-- consecutive-pair haversine summed WITHIN each segment only — never across
-- segment boundaries. Persists visits.distance_m and returns it. Duplicate
-- segment uploads are impossible rows (unique client_uuid), so recompute is
-- naturally idempotent.
create or replace function public.recompute_visit_distance(p_visit uuid)
returns double precision language plpgsql security definer set search_path = public as $$
declare d double precision;
begin
  select coalesce(sum(
           2 * 6371008.8 * asin(sqrt(
             power(sin(radians(lat - prev_lat) / 2), 2) +
             cos(radians(prev_lat)) * cos(radians(lat)) *
             power(sin(radians(lng - prev_lng) / 2), 2)))), 0)
    into d
  from (
    select lat, lng,
           lag(lat) over w as prev_lat,
           lag(lng) over w as prev_lng
    from (
      select t.id as track_id, e.ord,
             (e.p->>'lat')::double precision as lat,
             (e.p->>'lng')::double precision as lng
      from visit_tracks t
      cross join lateral jsonb_array_elements(t.points) with ordinality as e(p, ord)
      where t.visit_id = p_visit
        and ((e.p->>'acc') is null or (e.p->>'acc')::double precision <= 50)
    ) filtered
    window w as (partition by track_id order by ord)
  ) pairs
  where prev_lat is not null;
  update visits set distance_m = d, updated_at = now() where id = p_visit;
  return d;
end $$;

-- ===== start_visit =====
-- Caller must be the assigned walker; accepted -> in_progress runs through the
-- Plan-3 transition trigger (auth.uid() is still the walker in definer context —
-- see probe note above), which also writes the visit.start audit row.
-- Idempotent-safe: a re-call fails the status gate with a clear error and
-- duplicates nothing.
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
end $$;

-- ===== finish_visit =====
-- in_progress -> completed (trigger-validated, audited as visit.complete), then
-- builds the report row: 24-random-byte hex token + report-safe summary. A
-- re-call fails the status gate, so a second report row is impossible (and
-- visit_id is unique anyway).
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
end $$;

-- ===== resend_report / revoke_report (owner-only, audited) =====
-- is_owner returns null (not false) for a non-member — compare with `is not true`.
create or replace function public.resend_report(p_visit uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v visits; r visit_reports;
begin
  select * into v from visits where id = p_visit;
  if v.id is null then raise exception 'visit not found'; end if;
  if public.is_owner(v.business_id) is not true then
    raise exception 'only the business owner can resend reports';
  end if;
  select * into r from visit_reports where visit_id = p_visit;
  if r.id is null then raise exception 'no report for this visit'; end if;
  if r.revoked_at is not null then raise exception 'report has been revoked'; end if;
  if (select phones[1] from clients where id = v.client_id) is null then
    raise exception 'client has no phone number on file';
  end if;
  perform queue_client_sms(v.business_id, v.client_id, 'visit_finished',
                           jsonb_build_object('visitId', p_visit, 'reportToken', r.public_token));
  update visit_reports set sent_at = now(), updated_at = now() where visit_id = p_visit;
  insert into audit_log (business_id, actor_user_id, action, entity, entity_id, meta)
  values (v.business_id, auth.uid(), 'report.resend', 'visit_report', r.id,
          jsonb_build_object('visit_id', p_visit));
end $$;

create or replace function public.revoke_report(p_visit uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v visits; r visit_reports;
begin
  select * into v from visits where id = p_visit;
  if v.id is null then raise exception 'visit not found'; end if;
  if public.is_owner(v.business_id) is not true then
    raise exception 'only the business owner can revoke reports';
  end if;
  select * into r from visit_reports where visit_id = p_visit;
  if r.id is null then raise exception 'no report for this visit'; end if;
  if r.revoked_at is not null then raise exception 'report is already revoked'; end if;
  update visit_reports set revoked_at = now(), updated_at = now() where visit_id = p_visit;
  insert into audit_log (business_id, actor_user_id, action, entity, entity_id, meta)
  values (v.business_id, auth.uid(), 'report.revoke', 'visit_report', r.id,
          jsonb_build_object('visit_id', p_visit));
end $$;

-- ===== grants =====
-- Strip first: hosted migrations apply as postgres, whose default privileges
-- auto-grant every new table; locally the CLI applies as supabase_admin, where
-- nothing is granted. Revoking then granting exactly makes both stacks identical.
revoke all on public.visit_events, public.visit_tracks, public.visit_reports, public.notifications
  from anon, authenticated;

-- Events/tracks are append-only for client roles: select + insert, never
-- update/delete. Reports/notifications are read-only; writes go through RPCs
-- or the service role.
grant select, insert on public.visit_events, public.visit_tracks to authenticated;
grant select on public.visit_reports, public.notifications to authenticated;

grant select, insert, update, delete
  on public.visit_events, public.visit_tracks, public.visit_reports, public.notifications
  to service_role;

-- Functions get PUBLIC execute by default — strip it, then grant exactly.
revoke execute on function public.queue_client_sms(uuid, uuid, text, jsonb) from public, anon, authenticated;
revoke execute on function public.recompute_visit_distance(uuid) from public, anon, authenticated;
revoke execute on function public.start_visit(uuid) from public, anon;
revoke execute on function public.finish_visit(uuid, text) from public, anon;
revoke execute on function public.resend_report(uuid) from public, anon;
revoke execute on function public.revoke_report(uuid) from public, anon;
grant execute on function public.start_visit(uuid) to authenticated;
grant execute on function public.finish_visit(uuid, text) to authenticated;
grant execute on function public.resend_report(uuid) to authenticated;
grant execute on function public.revoke_report(uuid) to authenticated;
-- The Task-2 ingest function (service role) recomputes after each segment upsert.
grant execute on function public.recompute_visit_distance(uuid) to service_role;
