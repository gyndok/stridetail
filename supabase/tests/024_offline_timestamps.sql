begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

-- Review fix #4 (P2, 2026-09-05): start_visit/finish_visit accept a client
-- occurrence instant so a delayed upload of an offline walk keeps its real
-- times and duration. Validation is fallback-not-raise: an unreasonable
-- instant (future beyond 5 min, older than 7 days) is replaced with now(),
-- never an exception — a bad device clock must not park the sync queue.
-- now() is transaction-fixed in Postgres, so exact equality checks hold
-- across statements in this file.

-- ===== fixtures =====
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000241', 'owner24@test.dev'),
  ('00000000-0000-0000-0000-000000000242', 'walker24@test.dev');
insert into businesses (id, name, slug, time_zone, auto_invoice) values
  ('00000000-0000-0000-0000-00000024aaaa', 'Paw 024', 'paw-024', 'America/Chicago', 'manual');
insert into memberships (business_id, user_id, role, status) values
  ('00000000-0000-0000-0000-00000024aaaa', '00000000-0000-0000-0000-000000000241', 'owner', 'active'),
  ('00000000-0000-0000-0000-00000024aaaa', '00000000-0000-0000-0000-000000000242', 'walker', 'active');
insert into clients (id, business_id, name, phones, email) values
  ('00000000-0000-0000-0000-0000000024c1', '00000000-0000-0000-0000-00000024aaaa',
   'Casey 024', '{}', null);
insert into services (id, business_id, name, kind, base_price_cents, duration_min) values
  ('00000000-0000-0000-0000-000000240051', '00000000-0000-0000-0000-00000024aaaa',
   'Walk', 'walk', 2500, 30);
-- v1: the offline happy path; v2: unreasonable inputs; v3: old-client call shape.
insert into visits (id, business_id, client_id, service_id, walker_id, pet_ids,
                    scheduled_start, scheduled_end, business_tz, status)
select id, '00000000-0000-0000-0000-00000024aaaa', '00000000-0000-0000-0000-0000000024c1',
       '00000000-0000-0000-0000-000000240051', '00000000-0000-0000-0000-000000000242', '{}',
       now() - interval '1 hour', now() - interval '30 minutes', 'America/Chicago', 'accepted'
from unnest(array[
  '00000000-0000-0000-0000-000000240071'::uuid,
  '00000000-0000-0000-0000-000000240072'::uuid,
  '00000000-0000-0000-0000-000000240073'::uuid]) as id;

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000242","role":"authenticated"}';

-- ===== v1: a 25-minute offline walk uploaded late keeps its real times =====
select start_visit('00000000-0000-0000-0000-000000240071', now() - interval '30 minutes');
select is((select started_at from visits where id = '00000000-0000-0000-0000-000000240071'),
  now() - interval '30 minutes',
  'a delayed start upload preserves the device instant');
select is((select count(*)::int from visit_events
            where visit_id = '00000000-0000-0000-0000-000000240071'
              and type in ('arrived', 'started')
              and occurred_at = now() - interval '30 minutes'), 2,
  'the arrived/started events carry the same instant');

select finish_visit('00000000-0000-0000-0000-000000240071', null, now() - interval '5 minutes');
select is((select finished_at from visits where id = '00000000-0000-0000-0000-000000240071'),
  now() - interval '5 minutes',
  'a delayed finish upload preserves the device instant');
select is((select (summary->>'durationMin')::int from visit_reports
            where visit_id = '00000000-0000-0000-0000-000000240071'), 25,
  'the report duration comes from the real instants (25 min, not seconds)');
-- The snapshot column has NO client grant (compensation data, definer-only
-- like the price column) — assert as superuser, then resume the walker.
reset role;
select ok((select v.payout_percent_snapshot is not null from visits v
            where v.id = '00000000-0000-0000-0000-000000240071'),
  'finish_visit stamps the payout percent snapshot at completion (2026-09-06)');
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000242","role":"authenticated"}';

-- ===== v2: unreasonable instants fall back to now(), never raise =====
select start_visit('00000000-0000-0000-0000-000000240072', now() + interval '1 hour');
select is((select started_at from visits where id = '00000000-0000-0000-0000-000000240072'),
  now(), 'a far-future start instant is replaced with now()');

-- finish BEFORE the recorded start clamps to the start (no negative duration)
select finish_visit('00000000-0000-0000-0000-000000240072', null, now() - interval '20 minutes');
select is((select finished_at from visits where id = '00000000-0000-0000-0000-000000240072'),
  (select started_at from visits where id = '00000000-0000-0000-0000-000000240072'),
  'a finish instant before the start clamps to started_at');
select is((select (summary->>'durationMin')::int from visit_reports
            where visit_id = '00000000-0000-0000-0000-000000240072'), 0,
  'the clamped visit reports a zero duration, never negative');

select is(public.validate_occurrence(now() - interval '8 days'), null,
  'an instant older than the 7-day queue bound is rejected (falls back)');

-- ===== v3: deployed clients calling without the new argument still work =====
select start_visit('00000000-0000-0000-0000-000000240073');
select is((select started_at from visits where id = '00000000-0000-0000-0000-000000240073'),
  now(), 'the old single-argument call shape resolves via the default');
select finish_visit('00000000-0000-0000-0000-000000240073', null);
select is((select status::text from visits where id = '00000000-0000-0000-0000-000000240073'),
  'completed', 'the old two-argument finish shape resolves via the default');

select * from finish();
rollback;
