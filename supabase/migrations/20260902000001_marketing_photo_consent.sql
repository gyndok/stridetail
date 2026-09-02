-- Marketing-photo consent per client (beta wish list #6, 2026-09-01).
-- Three states: null = never asked (treat as NO), true = allowed, false = refused.
-- Staff-facing operational field: owner/walker read it via the existing full
-- table grant; portal clients cannot read the clients table at all (2026-08-29
-- hardening dropped their row policy), so no new exposure.
alter table public.clients add column marketing_photos_ok boolean;

comment on column public.clients.marketing_photos_ok is
  'Client consent to use pet photos in marketing. null = not asked yet (treat as no), true = allowed, false = refused.';
