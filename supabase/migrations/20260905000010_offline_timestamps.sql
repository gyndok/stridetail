-- Review fix #4 (P2, 2026-09-05): queued offline start/finish payloads carried
-- no occurrence time, so the RPCs stamped server now() — a 30-minute offline
-- walk uploaded afterward could read as lasting seconds in reports (and in the
-- duration the client sees). The app now captures the device instant when the
-- action happens and passes it here. Server-side validation, not trust: an
-- absent or unreasonable instant (future beyond 5 min of clock skew, or older
-- than 7 days — nothing queues that long) falls back to now() rather than
-- raising, so a bad clock can never park the sync queue. finish additionally
-- clamps to started_at so a duration is never negative.
--
-- Old single-instant signatures are DROPPED first: create-or-replace with an
-- added defaulted parameter would create an ambiguous overload (the
-- record_payment lesson). Deployed clients that omit the new argument resolve
-- to the same function through its default.
drop function if exists public.start_visit(uuid);
drop function if exists public.finish_visit(uuid, text);

create function public.validate_occurrence(p_at timestamptz)
returns timestamptz language sql stable as $$
  select case
    when p_at is null then null
    when p_at > now() + interval '5 minutes' then null
    when p_at < now() - interval '7 days' then null
    else p_at
  end
$$;

create function public.start_visit(p_visit uuid, p_started_at timestamptz default null)
returns void language plpgsql security definer set search_path = public as $$
declare v visits; v_at timestamptz;
begin
  select * into v from visits where id = p_visit;
  if v.id is null then raise exception 'visit not found'; end if;
  if v.walker_id is null or v.walker_id is distinct from auth.uid() then
    raise exception 'only the assigned walker can start this visit';
  end if;
  if v.status <> 'accepted' then
    raise exception 'visit is not accepted (status: %)', v.status;
  end if;
  v_at := coalesce(public.validate_occurrence(p_started_at), now());
  update visits set status = 'in_progress', started_at = v_at where id = p_visit;
  insert into visit_events (business_id, visit_id, type, occurred_at, client_uuid)
  values (v.business_id, p_visit, 'arrived', v_at, gen_random_uuid()),
         (v.business_id, p_visit, 'started', v_at, gen_random_uuid());
  perform queue_client_email(v.business_id, v.client_id, 'visit_started',
                             jsonb_build_object('visitId', p_visit));
end $$;

-- Body identical to 20260825000003 except finished_at/'finished' use the
-- validated instant (clamped to started_at).
create function public.finish_visit(
  p_visit uuid, p_private_notes text, p_finished_at timestamptz default null
) returns void language plpgsql security definer set search_path = public as $$
declare v visits; v_at timestamptz; dist double precision; tok text; summ jsonb; mode text;
begin
  select * into v from visits where id = p_visit;
  if v.id is null then raise exception 'visit not found'; end if;
  if v.walker_id is null or v.walker_id is distinct from auth.uid() then
    raise exception 'only the assigned walker can finish this visit';
  end if;
  if v.status <> 'in_progress' then
    raise exception 'visit is not in progress (status: %)', v.status;
  end if;
  v_at := coalesce(public.validate_occurrence(p_finished_at), now());
  if v.started_at is not null then v_at := greatest(v_at, v.started_at); end if;
  insert into visit_events (business_id, visit_id, type, occurred_at, client_uuid)
  values (v.business_id, p_visit, 'finished', v_at, gen_random_uuid());
  update visits set status = 'completed', finished_at = v_at where id = p_visit;
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

  select auto_invoice into mode from businesses where id = v.business_id;
  if mode in ('per_visit', 'per_sitting') then
    begin
      perform public.autoflow_invoice_for_visit(p_visit);
    exception when others then
      insert into audit_log (business_id, actor_user_id, action, entity, entity_id, meta)
      values (v.business_id, auth.uid(), 'invoice.autocreate_failed', 'visit', p_visit,
              jsonb_build_object('mode', mode, 'error', sqlerrm));
    end;
  end if;
end $$;

-- New signatures get PUBLIC execute by default — re-pin every time.
revoke execute on function public.validate_occurrence(timestamptz) from public, anon;
revoke execute on function public.start_visit(uuid, timestamptz) from public, anon;
revoke execute on function public.finish_visit(uuid, text, timestamptz) from public, anon;
grant execute on function public.validate_occurrence(timestamptz) to authenticated;
grant execute on function public.start_visit(uuid, timestamptz) to authenticated;
grant execute on function public.finish_visit(uuid, text, timestamptz) to authenticated;
