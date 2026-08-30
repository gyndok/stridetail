-- Early-access leads (2026-08-29). The landing page's "Get early access" was a
-- mailto: to hello@stridetail.app — a mailbox that does not exist (neither
-- domain has MX records), so every attempt ever made BOUNCED. Replaced with a
-- real form posting to the `early-access` edge function, which inserts here
-- and notifies the sponsor by email.
--
-- Service-role only: RLS enabled with NO policies, and all client roles
-- revoked — the edge function (service key) is the single writer; reads are
-- dashboard/SQL for now. This is platform (Stridetail-the-product) data, not
-- tenant data — no business_id.

create table public.early_access_leads (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  business_name text,
  email text not null,
  note text,
  created_at timestamptz not null default now()
);

alter table public.early_access_leads enable row level security;

revoke all on public.early_access_leads from public, anon, authenticated;
grant select, insert on public.early_access_leads to service_role;
