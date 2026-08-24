begin;
create extension if not exists pgtap with schema extensions;
select plan(74);

-- fixtures: owner A + two walkers in business A, owner B in business B. Fixed uuids so
-- cross-walker/cross-business failure tests can target real row ids (002/003/005 style).
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000021', 'owner-a@test.dev'),
  ('00000000-0000-0000-0000-000000000022', 'walker-a1@test.dev'),
  ('00000000-0000-0000-0000-000000000023', 'walker-a2@test.dev'),
  ('00000000-0000-0000-0000-000000000024', 'owner-b@test.dev');

insert into businesses (id, name, slug, time_zone) values
  ('00000000-0000-0000-0000-00000000aaaa', 'Paw & Whisker', 'paw-whisker-007', 'America/Chicago'),
  ('00000000-0000-0000-0000-00000000bbbb', 'Other Dogs Co', 'other-dogs-007', 'America/New_York');

insert into memberships (business_id, user_id, role, status) values
  ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-000000000021', 'owner', 'active'),
  ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-000000000022', 'walker', 'active'),
  ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-000000000023', 'walker', 'active'),
  ('00000000-0000-0000-0000-00000000bbbb', '00000000-0000-0000-0000-000000000024', 'owner', 'active');

insert into clients (id, business_id, name, phones) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000aaaa', 'Dana Harper', '{+15550001111}'),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-00000000aaaa', 'No Phone', '{}'),
  ('00000000-0000-0000-0000-0000000000c9', '00000000-0000-0000-0000-00000000bbbb', 'Remote Client', '{+15559998888}');

insert into pets (id, client_id, business_id, name) values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000c1',
   '00000000-0000-0000-0000-00000000aaaa', 'Biscuit');

insert into services (id, business_id, name, kind, base_price_cents, extra_pet_price_cents, duration_min, requires_gps) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-00000000aaaa', 'Walk', 'walk', 2500, 500, 30, true),
  ('00000000-0000-0000-0000-0000000000e9', '00000000-0000-0000-0000-00000000bbbb', 'Walk', 'walk', 3000, 500, 30, true);

-- f1: accepted, walker A1 (start_visit flow); f2: in_progress, walker A2 (cross-walker
-- denials); f3: accepted, walker A1 (non-running denials); f4: in_progress, walker A1,
-- started 30 min ago (events/tracks/distance/finish flow); f6: accepted, walker A1,
-- client with no phone (queue-skip); f9: business B visit (cross-business counts).
-- Fixture inserts take any status directly: the transition guard is an UPDATE trigger.
insert into visits (id, business_id, client_id, service_id, walker_id, pet_ids,
                    scheduled_start, scheduled_end, business_tz, status, price_cents_snapshot, started_at) values
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000aaaa',
   '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000e1',
   '00000000-0000-0000-0000-000000000022', '{00000000-0000-0000-0000-0000000000d1}',
   '2026-09-01 14:00+00', '2026-09-01 14:30+00', 'America/Chicago', 'accepted', 2500, null),
  ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-00000000aaaa',
   '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000e1',
   '00000000-0000-0000-0000-000000000023', '{}',
   '2026-09-01 15:00+00', '2026-09-01 15:30+00', 'America/Chicago', 'in_progress', 2500, now()),
  ('00000000-0000-0000-0000-0000000000f3', '00000000-0000-0000-0000-00000000aaaa',
   '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000e1',
   '00000000-0000-0000-0000-000000000022', '{}',
   '2026-09-02 14:00+00', '2026-09-02 14:30+00', 'America/Chicago', 'accepted', 2500, null),
  ('00000000-0000-0000-0000-0000000000f4', '00000000-0000-0000-0000-00000000aaaa',
   '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000e1',
   '00000000-0000-0000-0000-000000000022', '{00000000-0000-0000-0000-0000000000d1}',
   '2026-09-02 15:00+00', '2026-09-02 15:30+00', 'America/Chicago', 'in_progress', 2500,
   now() - interval '30 minutes'),
  ('00000000-0000-0000-0000-0000000000f6', '00000000-0000-0000-0000-00000000aaaa',
   '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000e1',
   '00000000-0000-0000-0000-000000000022', '{}',
   '2026-09-03 14:00+00', '2026-09-03 14:30+00', 'America/Chicago', 'accepted', 2500, null),
  ('00000000-0000-0000-0000-0000000000f9', '00000000-0000-0000-0000-00000000bbbb',
   '00000000-0000-0000-0000-0000000000c9', '00000000-0000-0000-0000-0000000000e9',
   null, '{}', '2026-09-03 15:00+00', '2026-09-03 16:00+00', 'America/New_York', 'unassigned', 3000, null);

-- ===== walker direct event inserts under RLS (the Task 2 app path) =====
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000022","role":"authenticated"}';

select lives_ok($$
  insert into visit_events (business_id, visit_id, type, occurred_at, client_uuid)
  values ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-0000000000f4',
          'pee', now(), '00000000-0000-0000-0000-00000000ee01')
$$, 'walker can insert an event on their own in_progress visit');

select lives_ok($$
  insert into visit_events (business_id, visit_id, type, occurred_at, client_uuid)
  values ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-0000000000f4',
          'pee', now(), '00000000-0000-0000-0000-00000000ee01')
  on conflict (client_uuid) do nothing
$$, 'replaying the same client_uuid with on-conflict-do-nothing succeeds (idempotent sync)');

select is((select count(*) from visit_events
           where visit_id = '00000000-0000-0000-0000-0000000000f4' and type = 'pee')::int, 1,
  'the replay inserted no second row (unique client_uuid)');

select lives_ok($$
  insert into visit_events (business_id, visit_id, pet_id, type, occurred_at, client_uuid)
  values ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-0000000000f4',
          '00000000-0000-0000-0000-0000000000d1', 'poop', now(), '00000000-0000-0000-0000-00000000ee02')
$$, 'walker can insert a pet-tagged event');

select throws_ok($$
  insert into visit_events (business_id, visit_id, type, occurred_at, client_uuid)
  values ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-0000000000f2',
          'pee', now(), '00000000-0000-0000-0000-00000000ee03')
$$, '42501', null, 'walker cannot insert events on another walker''s visit');

select throws_ok($$
  insert into visit_events (business_id, visit_id, type, occurred_at, client_uuid)
  values ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-0000000000f3',
          'pee', now(), '00000000-0000-0000-0000-00000000ee04')
$$, '42501', null, 'walker cannot insert events on their own visit while it is not in_progress');

select throws_ok($$
  insert into visit_events (business_id, visit_id, type, occurred_at, client_uuid)
  values ('00000000-0000-0000-0000-00000000bbbb', '00000000-0000-0000-0000-0000000000f4',
          'pee', now(), '00000000-0000-0000-0000-00000000ee05')
$$, '42501', null, 'event business_id must match the visit''s business (no tenant spoofing)');

select throws_ok($$
  update visit_events set text = 'edited'
  where client_uuid = '00000000-0000-0000-0000-00000000ee01'
$$, '42501', null, 'events are append-only for client roles (no update grant)');

-- ===== walker track segments under RLS =====
-- Segment 1: (0,0) -> (0.001,0) with a bad-accuracy (acc 99 > 50) point in the middle
-- that MUST be filtered out (kept, it would add thousands of km). Pure-latitude moves
-- make the haversine hand-checkable: R * radians(dLat) = 111.19493 m per 0.001 deg.
select lives_ok($$
  insert into visit_tracks (business_id, visit_id, segment_no, points, client_uuid)
  values ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-0000000000f4', 0,
          '[{"t":1,"lat":0,"lng":0,"acc":5},
            {"t":2,"lat":10,"lng":10,"acc":99},
            {"t":3,"lat":0.001,"lng":0,"acc":5}]'::jsonb,
          '00000000-0000-0000-0000-00000000aa01')
$$, 'walker can insert a track segment on their own in_progress visit');

-- Segment 2: (10,20) -> (10.002,20), no acc keys (kept) = 222.38985 m. Its start is
-- thousands of km from segment 1''s end — summing across the boundary would show up loudly.
select lives_ok($$
  insert into visit_tracks (business_id, visit_id, segment_no, points, client_uuid)
  values ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-0000000000f4', 1,
          '[{"t":4,"lat":10,"lng":20},{"t":5,"lat":10.002,"lng":20}]'::jsonb,
          '00000000-0000-0000-0000-00000000aa02')
$$, 'walker can insert a second segment');

select lives_ok($$
  insert into visit_tracks (business_id, visit_id, segment_no, points, client_uuid)
  values ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-0000000000f4', 1,
          '[{"t":4,"lat":10,"lng":20},{"t":5,"lat":10.002,"lng":20}]'::jsonb,
          '00000000-0000-0000-0000-00000000aa02')
  on conflict (client_uuid) do nothing
$$, 'replaying a segment client_uuid with on-conflict-do-nothing succeeds');

select is((select count(*) from visit_tracks
           where visit_id = '00000000-0000-0000-0000-0000000000f4')::int, 2,
  'the duplicated segment inserted no third row');

select throws_ok($$
  insert into visit_tracks (business_id, visit_id, segment_no, points, client_uuid)
  values ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-0000000000f2', 0,
          '[]'::jsonb, '00000000-0000-0000-0000-00000000aa03')
$$, '42501', null, 'walker cannot insert tracks on another walker''s visit');

select throws_ok($$
  insert into visit_tracks (business_id, visit_id, segment_no, points, client_uuid)
  values ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-0000000000f3', 0,
          '[]'::jsonb, '00000000-0000-0000-0000-00000000aa04')
$$, '42501', null, 'walker cannot insert tracks on a visit that is not in_progress');

-- ===== cross-walker read isolation =====
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000023","role":"authenticated"}';

select is((select count(*) from visit_events)::int, 0,
  'another walker sees zero events (only own-visit events are readable)');

select is((select count(*) from visit_tracks)::int, 0,
  'another walker sees zero track segments');

-- ===== start_visit =====
select throws_ok(
  $$ select start_visit('00000000-0000-0000-0000-0000000000f1') $$,
  'P0001', 'only the assigned walker can start this visit',
  'a different walker cannot start the visit');

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000021","role":"authenticated"}';

select throws_ok(
  $$ select start_visit('00000000-0000-0000-0000-0000000000f1') $$,
  'P0001', 'only the assigned walker can start this visit',
  'the owner is not exempt from the walker gate on start');

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000022","role":"authenticated"}';

select lives_ok(
  $$ select start_visit('00000000-0000-0000-0000-0000000000f1') $$,
  'the assigned walker can start their accepted visit');

reset role;
set local request.jwt.claims to '{}';

select is((select status::text from visits where id = '00000000-0000-0000-0000-0000000000f1'),
  'in_progress', 'start moves the visit to in_progress (transition trigger satisfied)');

select ok((select started_at from visits where id = '00000000-0000-0000-0000-0000000000f1') is not null,
  'start stamps started_at');

select is((select count(*) from visit_events
           where visit_id = '00000000-0000-0000-0000-0000000000f1' and type = 'arrived')::int, 1,
  'start inserts one arrived event');

select is((select count(*) from visit_events
           where visit_id = '00000000-0000-0000-0000-0000000000f1' and type = 'started')::int, 1,
  'start inserts one started event');

select is((select count(*) from notifications
           where business_id = '00000000-0000-0000-0000-00000000aaaa'
             and template = 'visit_started' and "to" = '+15550001111'
             and status = 'queued' and next_attempt_at is not null
             and payload->>'visitId' = '00000000-0000-0000-0000-0000000000f1')::int, 1,
  'start queues a visit_started SMS to the client''s first phone');

select is((select count(*) from audit_log
           where action = 'visit.start' and entity = 'visit'
             and entity_id = '00000000-0000-0000-0000-0000000000f1'
             and actor_user_id = '00000000-0000-0000-0000-000000000022')::int, 1,
  'start is audited with the walker as actor (auth.uid() inside the definer RPC)');

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000022","role":"authenticated"}';

select throws_ok(
  $$ select start_visit('00000000-0000-0000-0000-0000000000f1') $$,
  'P0001', 'visit is not accepted (status: in_progress)',
  're-calling start is a clear error, not a duplicate start');

select lives_ok(
  $$ select start_visit('00000000-0000-0000-0000-0000000000f6') $$,
  'start works for a client with no phone on file');

reset role;
set local request.jwt.claims to '{}';

select is((select count(*) from notifications
           where payload->>'visitId' = '00000000-0000-0000-0000-0000000000f6')::int, 0,
  'no notification is queued when the client has no phone (skip recorded)');

-- ===== recompute_visit_distance: hand-checkable fixture =====
-- Expected: seg1 111.19493 m (bad-acc point filtered) + seg2 222.38985 m = 333.58478 m.
-- Segment boundary (0.001,0) -> (10,20) is ~2,500 km and must NOT be summed.
select ok(abs(recompute_visit_distance('00000000-0000-0000-0000-0000000000f4') - 333.58478) < 0.01,
  'distance = per-segment haversine sum, acc>50 filtered, no cross-segment leg');

select ok(abs((select distance_m from visits where id = '00000000-0000-0000-0000-0000000000f4') - 333.58478) < 0.01,
  'recompute persists distance_m on the visit');

select ok(abs(recompute_visit_distance('00000000-0000-0000-0000-0000000000f4') - 333.58478) < 0.01,
  'recompute is stable on re-run (duplicated segment never made a row)');

-- ===== finish_visit =====
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000023","role":"authenticated"}';

select throws_ok(
  $$ select finish_visit('00000000-0000-0000-0000-0000000000f4', null) $$,
  'P0001', 'only the assigned walker can finish this visit',
  'a different walker cannot finish the visit');

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000021","role":"authenticated"}';

select throws_ok(
  $$ select finish_visit('00000000-0000-0000-0000-0000000000f4', null) $$,
  'P0001', 'only the assigned walker can finish this visit',
  'the owner is not exempt from the walker gate on finish');

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000022","role":"authenticated"}';

select throws_ok(
  $$ select finish_visit('00000000-0000-0000-0000-0000000000f3', null) $$,
  'P0001', 'visit is not in progress (status: accepted)',
  'a visit that never started cannot be finished');

select lives_ok(
  $$ select finish_visit('00000000-0000-0000-0000-0000000000f4', 'Biscuit did great') $$,
  'the assigned walker can finish their in_progress visit');

reset role;
set local request.jwt.claims to '{}';

select is((select status::text from visits where id = '00000000-0000-0000-0000-0000000000f4'),
  'completed', 'finish moves the visit to completed');

select ok((select finished_at from visits where id = '00000000-0000-0000-0000-0000000000f4') is not null,
  'finish stamps finished_at');

select is((select count(*) from visit_events
           where visit_id = '00000000-0000-0000-0000-0000000000f4' and type = 'finished')::int, 1,
  'finish inserts one finished event');

select is((select count(*) from visit_reports
           where visit_id = '00000000-0000-0000-0000-0000000000f4')::int, 1,
  'finish builds exactly one report row');

select is((select length(public_token) from visit_reports
           where visit_id = '00000000-0000-0000-0000-0000000000f4'), 48,
  'public_token is 24 random bytes hex-encoded (48 chars)');

select is((select summary->>'serviceName' from visit_reports
           where visit_id = '00000000-0000-0000-0000-0000000000f4'), 'Walk',
  'summary carries the service name');

select is((select summary->'petNames' from visit_reports
           where visit_id = '00000000-0000-0000-0000-0000000000f4'), '["Biscuit"]'::jsonb,
  'summary carries the pet names');

select is((select (summary->>'durationMin')::int from visit_reports
           where visit_id = '00000000-0000-0000-0000-0000000000f4'), 30,
  'summary durationMin = finished_at - started_at in minutes');

select ok(abs((select (summary->>'distanceM')::float8 from visit_reports
               where visit_id = '00000000-0000-0000-0000-0000000000f4') - 333.58478) < 0.01,
  'summary carries the recomputed distance');

select is((select summary->'eventCounts' from visit_reports
           where visit_id = '00000000-0000-0000-0000-0000000000f4'),
  '{"pee":1,"poop":1,"finished":1}'::jsonb,
  'summary counts events by type');

select ok((select summary ?& array['scheduledStart','scheduledEnd','startedAt','finishedAt']
           from visit_reports where visit_id = '00000000-0000-0000-0000-0000000000f4'),
  'summary carries the schedule and actual timestamps');

select is((select private_notes_md from visit_reports
           where visit_id = '00000000-0000-0000-0000-0000000000f4'), 'Biscuit did great',
  'finish stores the walker''s private notes (never in summary)');

select is((select count(*) from notifications n
           join visit_reports r on r.visit_id = '00000000-0000-0000-0000-0000000000f4'
           where n.template = 'visit_finished' and n."to" = '+15550001111'
             and n.status = 'queued'
             and n.payload->>'visitId' = '00000000-0000-0000-0000-0000000000f4'
             and n.payload->>'reportToken' = r.public_token)::int, 1,
  'finish queues a visit_finished SMS carrying the report token');

select is((select count(*) from audit_log
           where action = 'visit.complete' and entity = 'visit'
             and entity_id = '00000000-0000-0000-0000-0000000000f4'
             and actor_user_id = '00000000-0000-0000-0000-000000000022')::int, 1,
  'finish is audited with the walker as actor');

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000022","role":"authenticated"}';

select throws_ok(
  $$ select finish_visit('00000000-0000-0000-0000-0000000000f4', null) $$,
  'P0001', 'visit is not in progress (status: completed)',
  're-calling finish is a clear error, not a duplicate report');

-- ===== visit_reports RLS =====
select is((select count(*) from visit_reports)::int, 1,
  'the walker reads their own visit''s report');

select throws_ok($$
  update visit_reports set revoked_at = now()
  where visit_id = '00000000-0000-0000-0000-0000000000f4'
$$, '42501', null, 'no client role can update reports (revoke/resend go through RPCs)');

select throws_ok($$
  insert into visit_reports (business_id, visit_id, public_token)
  values ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-0000000000f1', 'forged')
$$, '42501', null, 'no client role can insert reports');

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000023","role":"authenticated"}';

select is((select count(*) from visit_reports)::int, 0,
  'another walker sees zero reports');

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000024","role":"authenticated"}';

select is((select count(*) from visit_reports)::int, 0,
  'cross-business: owner B sees zero reports of business A');

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000021","role":"authenticated"}';

select is((select count(*) from visit_reports)::int, 1,
  'owner reads the business''s reports');

-- ===== notifications RLS =====
select is((select count(*) from notifications)::int, 2,
  'owner reads the business''s notifications (started + finished)');

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000022","role":"authenticated"}';

select is((select count(*) from notifications)::int, 0,
  'notifications are invisible to walkers');

select throws_ok($$
  insert into notifications (business_id, "to", template)
  values ('00000000-0000-0000-0000-00000000aaaa', '+15550001111', 'visit_started')
$$, '42501', null, 'client roles cannot insert notifications (RPCs and service only)');

-- ===== anon: nothing =====
set local role anon;

select throws_ok($$ select * from visit_events $$, '42501', null, 'anon cannot select visit_events');
select throws_ok($$ select * from notifications $$, '42501', null, 'anon cannot select notifications');
select throws_ok(
  $$ select start_visit('00000000-0000-0000-0000-0000000000f1') $$,
  '42501', null, 'anon cannot execute the visit RPCs');

-- ===== resend_report / revoke_report: owner-only, audited =====
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000022","role":"authenticated"}';

select throws_ok(
  $$ select resend_report('00000000-0000-0000-0000-0000000000f4') $$,
  'P0001', 'only the business owner can resend reports', 'walker cannot resend');

select throws_ok(
  $$ select revoke_report('00000000-0000-0000-0000-0000000000f4') $$,
  'P0001', 'only the business owner can revoke reports', 'walker cannot revoke');

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000024","role":"authenticated"}';

select throws_ok(
  $$ select resend_report('00000000-0000-0000-0000-0000000000f4') $$,
  'P0001', 'only the business owner can resend reports',
  'cross-business owner cannot resend (is_owner null trap covered)');

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000021","role":"authenticated"}';

select lives_ok(
  $$ select resend_report('00000000-0000-0000-0000-0000000000f4') $$,
  'owner can resend the report');

reset role;
set local request.jwt.claims to '{}';

select ok((select sent_at from visit_reports
           where visit_id = '00000000-0000-0000-0000-0000000000f4') is not null,
  'resend bumps sent_at');

select is((select count(*) from notifications
           where template = 'visit_finished'
             and payload->>'visitId' = '00000000-0000-0000-0000-0000000000f4')::int, 2,
  'resend queues a second visit_finished notification');

select is((select count(*) from audit_log
           where action = 'report.resend' and entity = 'visit_report'
             and actor_user_id = '00000000-0000-0000-0000-000000000021')::int, 1,
  'resend is audited');

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000021","role":"authenticated"}';

select lives_ok(
  $$ select revoke_report('00000000-0000-0000-0000-0000000000f4') $$,
  'owner can revoke the report');

reset role;
set local request.jwt.claims to '{}';

select ok((select revoked_at from visit_reports
           where visit_id = '00000000-0000-0000-0000-0000000000f4') is not null,
  'revoke stamps revoked_at');

select is((select count(*) from audit_log
           where action = 'report.revoke' and entity = 'visit_report'
             and actor_user_id = '00000000-0000-0000-0000-000000000021')::int, 1,
  'revoke is audited');

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000021","role":"authenticated"}';

select throws_ok(
  $$ select resend_report('00000000-0000-0000-0000-0000000000f4') $$,
  'P0001', 'report has been revoked', 'a revoked report cannot be resent');

select throws_ok(
  $$ select revoke_report('00000000-0000-0000-0000-0000000000f4') $$,
  'P0001', 'report is already revoked', 're-revoking is a clear error');

select * from finish();
rollback;
