begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

-- Email channel (migration 20260824000012, sms retired by 20260824000013):
-- start_visit/finish_visit queue ONLY a channel='email' notification to
-- clients.email when present — sms rows are no longer queued (channel dormant
-- pending a toll-free future; queue_client_sms and send-sms stay deployed).
-- 007 covers the RPC email rows, 009 the claim semantics; new here is the
-- contact-matrix queuing behaviour.

-- fixtures: owner + walker in business A (010-scoped fixed uuids).
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000041', 'owner-a@email.dev'),
  ('00000000-0000-0000-0000-000000000042', 'walker-a@email.dev');

insert into businesses (id, name, slug, time_zone) values
  ('00000000-0000-0000-0000-000000000aaa', 'Paw & Whisker', 'paw-whisker-010', 'America/Chicago');

insert into memberships (business_id, user_id, role, status) values
  ('00000000-0000-0000-0000-000000000aaa', '00000000-0000-0000-0000-000000000041', 'owner', 'active'),
  ('00000000-0000-0000-0000-000000000aaa', '00000000-0000-0000-0000-000000000042', 'walker', 'active');

-- The queuing matrix: phone+email, email-only, phone-only, neither.
insert into clients (id, business_id, name, phones, email) values
  ('00000000-0000-0000-0000-0000000010c1', '00000000-0000-0000-0000-000000000aaa',
   'Both Contact', '{+15550001111}', 'both@example.com'),
  ('00000000-0000-0000-0000-0000000010c2', '00000000-0000-0000-0000-000000000aaa',
   'Email Only', '{}', 'email-only@example.com'),
  ('00000000-0000-0000-0000-0000000010c3', '00000000-0000-0000-0000-000000000aaa',
   'Phone Only', '{+15550003333}', null),
  ('00000000-0000-0000-0000-0000000010c4', '00000000-0000-0000-0000-000000000aaa',
   'No Contact', '{}', null);

insert into pets (id, client_id, business_id, name) values
  ('00000000-0000-0000-0000-0000000010d1', '00000000-0000-0000-0000-0000000010c1',
   '00000000-0000-0000-0000-000000000aaa', 'Biscuit');

insert into services (id, business_id, name, kind, base_price_cents, extra_pet_price_cents, duration_min, requires_gps) values
  ('00000000-0000-0000-0000-0000000010e1', '00000000-0000-0000-0000-000000000aaa',
   'Walk', 'walk', 2500, 500, 30, true);

-- One accepted visit per client, all assigned to walker 42 (fixture inserts
-- take any status directly: the transition guard is an UPDATE trigger).
insert into visits (id, business_id, client_id, service_id, walker_id, pet_ids,
                    scheduled_start, scheduled_end, business_tz, status, price_cents_snapshot) values
  ('00000000-0000-0000-0000-0000000010f1', '00000000-0000-0000-0000-000000000aaa',
   '00000000-0000-0000-0000-0000000010c1', '00000000-0000-0000-0000-0000000010e1',
   '00000000-0000-0000-0000-000000000042', '{00000000-0000-0000-0000-0000000010d1}',
   '2026-09-01 14:00+00', '2026-09-01 14:30+00', 'America/Chicago', 'accepted', 2500),
  ('00000000-0000-0000-0000-0000000010f2', '00000000-0000-0000-0000-000000000aaa',
   '00000000-0000-0000-0000-0000000010c2', '00000000-0000-0000-0000-0000000010e1',
   '00000000-0000-0000-0000-000000000042', '{}',
   '2026-09-01 15:00+00', '2026-09-01 15:30+00', 'America/Chicago', 'accepted', 2500),
  ('00000000-0000-0000-0000-0000000010f3', '00000000-0000-0000-0000-000000000aaa',
   '00000000-0000-0000-0000-0000000010c3', '00000000-0000-0000-0000-0000000010e1',
   '00000000-0000-0000-0000-000000000042', '{}',
   '2026-09-01 16:00+00', '2026-09-01 16:30+00', 'America/Chicago', 'accepted', 2500),
  ('00000000-0000-0000-0000-0000000010f4', '00000000-0000-0000-0000-000000000aaa',
   '00000000-0000-0000-0000-0000000010c4', '00000000-0000-0000-0000-0000000010e1',
   '00000000-0000-0000-0000-000000000042', '{}',
   '2026-09-01 17:00+00', '2026-09-01 17:30+00', 'America/Chicago', 'accepted', 2500);

-- ===== start_visit queuing matrix =====
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000042","role":"authenticated"}';

select lives_ok($$ select start_visit('00000000-0000-0000-0000-0000000010f1') $$,
  'start (phone + email client)');
select lives_ok($$ select start_visit('00000000-0000-0000-0000-0000000010f2') $$,
  'start (email-only client)');
select lives_ok($$ select start_visit('00000000-0000-0000-0000-0000000010f3') $$,
  'start (phone-only client)');
select lives_ok($$ select start_visit('00000000-0000-0000-0000-0000000010f4') $$,
  'start (no-contact client)');

set local request.jwt.claims to '{}';

select is((select count(*) from notifications
           where payload->>'visitId' = '00000000-0000-0000-0000-0000000010f1'
             and channel = 'sms')::int, 0,
  'both-contact client: NO sms row even with a phone on file (sms dormant, 0013)');

select is((select count(*) from notifications
           where payload->>'visitId' = '00000000-0000-0000-0000-0000000010f1'
             and channel = 'email' and "to" = 'both@example.com'
             and template = 'visit_started' and status = 'queued'
             and next_attempt_at is not null)::int, 1,
  'both-contact client: start queues the email row, born due');

select is((select count(*) from notifications
           where payload->>'visitId' = '00000000-0000-0000-0000-0000000010f2'
             and channel = 'email' and "to" = 'email-only@example.com'
             and template = 'visit_started')::int, 1,
  'email-only client: start queues the email row');

select is((select count(*) from notifications
           where payload->>'visitId' = '00000000-0000-0000-0000-0000000010f2'
             and channel = 'sms')::int, 0,
  'email-only client: no sms row (no phone on file)');

select is((select count(*) from notifications
           where payload->>'visitId' = '00000000-0000-0000-0000-0000000010f3'
             and channel = 'sms')::int, 0,
  'phone-only client: no sms row despite the phone (sms dormant, 0013)');

select is((select count(*) from notifications
           where payload->>'visitId' = '00000000-0000-0000-0000-0000000010f3'
             and channel = 'email')::int, 0,
  'phone-only client: no email row (email is null) — nothing queued at all');

select is((select count(*) from notifications
           where payload->>'visitId' = '00000000-0000-0000-0000-0000000010f4')::int, 0,
  'no-contact client: nothing queued at all');

-- ===== finish_visit: the email row alone carries the report token =====
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000042","role":"authenticated"}';
select finish_visit('00000000-0000-0000-0000-0000000010f1', null);
set local request.jwt.claims to '{}';

select is((select count(*) from notifications n
           join visit_reports r on r.visit_id = '00000000-0000-0000-0000-0000000010f1'
           where n.template = 'visit_finished'
             and n.payload->>'visitId' = '00000000-0000-0000-0000-0000000010f1'
             and n.payload->>'reportToken' = r.public_token
             and n.channel = 'email')::int, 1,
  'finish queues exactly one visit_finished row — email, carrying the report token');

select * from finish();
rollback;
