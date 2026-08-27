-- Post-Checkpoint 8 polish — approve_booking_request gains p_start: the client
-- asks for a WINDOW ("come anytime 11–1") but the owner had no way to choose
-- the actual start inside it; the visit was pinned to window_start and the UI
-- said "reschedule it after". Now the owner picks the start on the request
-- card and the RPC honors it.
--
-- Signature note: `create or replace` with an added defaulted parameter would
-- create an OVERLOAD in postgres (different arg-type signature), leaving two
-- functions and ambiguous 1-/2-arg calls — so the old (uuid, uuid) function is
-- DROPPED first. Its only callers are the app RPC and the pgTAP suite (both
-- updated in lockstep); no trigger, view, or other function references it.
-- Exactly one function remains, and the grants/revokes are re-applied to the
-- new signature (functions get PUBLIC execute by default — strip it).

drop function public.approve_booking_request(uuid, uuid);

-- approve_booking_request: owner-only, pending-only. Creates the visit at the
-- service's current price (base + extra_pet x (pets - 1) — the expand-series
-- formula) for duration_min. p_start null -> scheduled at window_start (the
-- pre-Checkpoint-8 behavior); given -> must sit inside the half-open request
-- window [window_start, window_end) and the visit is created there. p_walker
-- null -> unassigned; p_walker -> offered (active-membership check, offer_visit
-- pattern). Stamps the request, queues the client email (carrying the CHOSEN
-- start), audits (meta carries the chosen start too).
create or replace function public.approve_booking_request(
  p_request uuid, p_walker uuid default null, p_start timestamptz default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  r booking_requests; s services; biz businesses;
  v_id uuid; price int; st public.visit_status; v_start timestamptz;
begin
  select * into r from booking_requests where id = p_request;
  if r.id is null then raise exception 'booking request not found'; end if;
  if public.is_owner(r.business_id) is not true then
    raise exception 'only the business owner can approve booking requests';
  end if;
  if r.status <> 'pending' then
    raise exception 'booking request is not pending (status: %)', r.status;
  end if;
  if p_start is not null then
    if p_start < r.window_start then
      raise exception 'start time is before the requested window';
    end if;
    if p_start >= r.window_end then
      raise exception 'start time must be before the window end';
    end if;
  end if;
  v_start := coalesce(p_start, r.window_start);
  select * into s from services where id = r.service_id;
  if s.id is null then raise exception 'service not found'; end if;
  select * into biz from businesses where id = r.business_id;
  if p_walker is null then
    st := 'unassigned';
  else
    if not exists (select 1 from memberships
                   where business_id = r.business_id and user_id = p_walker
                     and status = 'active') then
      raise exception 'walker is not an active member of this business';
    end if;
    st := 'offered';
  end if;
  price := s.base_price_cents
           + s.extra_pet_price_cents * greatest(coalesce(array_length(r.pet_ids, 1), 0) - 1, 0);
  insert into visits (business_id, client_id, service_id, walker_id, pet_ids,
                      scheduled_start, scheduled_end, business_tz, status,
                      price_cents_snapshot)
  values (r.business_id, r.client_id, r.service_id, p_walker, r.pet_ids,
          v_start, v_start + make_interval(mins => s.duration_min),
          biz.time_zone, st, price)
  returning id into v_id;
  update booking_requests
     set status = 'approved', visit_id = v_id,
         decided_by = auth.uid(), decided_at = now(), updated_at = now()
   where id = p_request;
  perform queue_client_email(r.business_id, r.client_id, 'booking_request_approved',
    jsonb_build_object('requestId', p_request, 'visitId', v_id,
                       'serviceName', s.name, 'scheduledStart', v_start));
  insert into audit_log (business_id, actor_user_id, action, entity, entity_id, meta)
  values (r.business_id, auth.uid(), 'booking_request.approve', 'booking_request', p_request,
          jsonb_strip_nulls(jsonb_build_object(
            'visit_id', v_id, 'walker_id', p_walker, 'price_cents', price,
            'scheduled_start', v_start)));
  return v_id;
end $$;

-- ===== grants: re-apply exactly for the new signature =====
-- Authenticated only, as before (the `is not true` guard needs a JWT sub;
-- a service_role grant would be dead code — Plan 3 Task 1 precedent).
revoke execute on function public.approve_booking_request(uuid, uuid, timestamptz) from public, anon;
grant execute on function public.approve_booking_request(uuid, uuid, timestamptz) to authenticated;
