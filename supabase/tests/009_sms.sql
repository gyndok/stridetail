begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

-- Plan 4 Task 6 — notification queue transitions + owner invite-SMS insert
-- policy. 007 already covers: RPC-queued rows (email-only since 0013),
-- walker-invisible notifications, client roles cannot insert arbitrary
-- notifications. New here: the due-row claim semantics the channel senders
-- rely on, the next_attempt_at default, and the narrow owner INSERT path for
-- invite SMS. The sms channel is DORMANT (0013 unscheduled its cron; the RPCs
-- no longer queue sms rows) so the queue rows are seeded directly — the claim
-- mechanics and RLS are channel-agnostic and must keep working for the
-- toll-free re-enable.

-- fixtures: owner A + walker A in business A, owner B in business B.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000031', 'owner-a@sms.dev'),
  ('00000000-0000-0000-0000-000000000032', 'walker-a@sms.dev'),
  ('00000000-0000-0000-0000-000000000034', 'owner-b@sms.dev');

insert into businesses (id, name, slug, time_zone) values
  ('00000000-0000-0000-0000-0000000009aa', 'Paw & Whisker', 'paw-whisker-009', 'America/Chicago'),
  ('00000000-0000-0000-0000-0000000009bb', 'Other Dogs Co', 'other-dogs-009', 'America/New_York');

insert into memberships (business_id, user_id, role, status) values
  ('00000000-0000-0000-0000-0000000009aa', '00000000-0000-0000-0000-000000000031', 'owner', 'active'),
  ('00000000-0000-0000-0000-0000000009aa', '00000000-0000-0000-0000-000000000032', 'walker', 'active'),
  ('00000000-0000-0000-0000-0000000009bb', '00000000-0000-0000-0000-000000000034', 'owner', 'active');

-- Queue rows (as the RPCs/service role would write them):
-- n1 due now (business A), n2 due in an hour (business A), n3 due now (business B).
insert into notifications (id, business_id, "to", template, payload, status, next_attempt_at) values
  ('00000000-0000-0000-0000-00000000ff01', '00000000-0000-0000-0000-0000000009aa',
   '+15550001111', 'visit_started', '{}'::jsonb, 'queued', now() - interval '1 minute'),
  ('00000000-0000-0000-0000-00000000ff02', '00000000-0000-0000-0000-0000000009aa',
   '+15550001111', 'visit_finished', '{}'::jsonb, 'queued', now() + interval '1 hour'),
  ('00000000-0000-0000-0000-00000000ff03', '00000000-0000-0000-0000-0000000009bb',
   '+15559998888', 'visit_started', '{}'::jsonb, 'queued', now() - interval '1 minute');

-- n4: next_attempt_at omitted — the 0011 default must make it due immediately.
insert into notifications (id, business_id, "to", template, payload) values
  ('00000000-0000-0000-0000-00000000ff04', '00000000-0000-0000-0000-0000000009aa',
   '+15550001111', 'invite', '{"token":"tok"}'::jsonb);

select ok((select next_attempt_at from notifications
           where id = '00000000-0000-0000-0000-00000000ff04') is not null,
  'next_attempt_at defaults to now() (a queued row can never hide from the picker)');

-- ===== the claim the send-sms function performs =====
-- UPDATE ... WHERE status='queued' AND next_attempt_at <= now(): only due rows
-- flip to 'sending'; a second identical claim finds nothing (double-send race
-- guard — a concurrently claimed row is no longer 'queued').
update notifications set status = 'sending', updated_at = now()
 where status = 'queued' and next_attempt_at <= now();

select is((select status::text from notifications
           where id = '00000000-0000-0000-0000-00000000ff01'), 'sending',
  'a due queued row is claimed (queued -> sending)');

select is((select status::text from notifications
           where id = '00000000-0000-0000-0000-00000000ff02'), 'queued',
  'a future-dated row is not claimed');

select is((select count(*) from notifications
           where status = 'queued' and next_attempt_at <= now())::int, 0,
  're-claiming immediately finds zero rows (no double-send window)');

-- ===== RLS reads =====
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000031","role":"authenticated"}';

select is((select count(*) from notifications)::int, 3,
  'owner A sees exactly business A''s notification rows');

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000034","role":"authenticated"}';

select is((select count(*) from notifications)::int, 1,
  'owner B sees only business B''s rows (cross-business isolation)');

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000032","role":"authenticated"}';

select is((select count(*) from notifications)::int, 0,
  'walkers cannot see notifications at all');

-- ===== owner invite-SMS insert (0011 policy) =====
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000031","role":"authenticated"}';

select lives_ok($$
  insert into notifications (business_id, "to", template, payload)
  values ('00000000-0000-0000-0000-0000000009aa', '+15557770000', 'invite',
          '{"token":"tok2","link":"stridetail://invite/tok2"}'::jsonb)
$$, 'owner can queue an invite SMS for their own business');

select ok((select status = 'queued' and next_attempt_at is not null and attempts = 0
           from notifications
           where "to" = '+15557770000' and template = 'invite'),
  'the owner-queued invite row is born queued, due, with zero attempts');

select throws_ok($$
  insert into notifications (business_id, "to", template, payload)
  values ('00000000-0000-0000-0000-0000000009aa', '+15557770000', 'visit_started', '{}'::jsonb)
$$, '42501', null, 'owner cannot queue non-invite templates (RPCs own those)');

select throws_ok($$
  insert into notifications (business_id, channel, "to", template, payload)
  values ('00000000-0000-0000-0000-0000000009aa', 'email', '+15557770000', 'invite', '{}'::jsonb)
$$, '42501', null, 'owner cannot queue non-sms channels');

select throws_ok($$
  insert into notifications (business_id, "to", template, payload, status)
  values ('00000000-0000-0000-0000-0000000009aa', '+15557770000', 'invite', '{}'::jsonb, 'sent')
$$, '42501', null, 'owner cannot forge a non-queued status');

select throws_ok($$
  insert into notifications (business_id, "to", template, payload)
  values ('00000000-0000-0000-0000-0000000009bb', '+15557770000', 'invite', '{}'::jsonb)
$$, '42501', null, 'owner cannot queue into another business (is_owner null trap covered)');

select throws_ok($$
  update notifications set status = 'sent'
  where "to" = '+15557770000' and template = 'invite'
$$, '42501', null, 'owners cannot update queue rows (sender/service role only)');

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000032","role":"authenticated"}';

select throws_ok($$
  insert into notifications (business_id, "to", template, payload)
  values ('00000000-0000-0000-0000-0000000009aa', '+15557770000', 'invite', '{}'::jsonb)
$$, '42501', null, 'walker cannot queue invite SMS');

select * from finish();
rollback;
