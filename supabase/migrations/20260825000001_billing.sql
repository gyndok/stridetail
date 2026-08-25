-- Plan 5 Task 1 — billing schema: invoices, invoice_items, deposits, payments,
-- payout_statements, payout_items, plus memberships.payout_percent and the
-- businesses invoice settings (slice-2 spec §3, §4). Amount-bearing mutations get
-- their definer RPCs in Task 2; payout RPCs/UI land in Plan 6 — the tables ship
-- now so both migrations stay one file each.

-- ===== types =====
create type public.invoice_status as enum ('draft', 'sent', 'paid', 'void');
create type public.deposit_status as enum
  ('requested', 'held', 'applied', 'refunded', 'forfeited');
create type public.payment_method as enum ('venmo', 'zelle', 'cash', 'check', 'other');
create type public.payout_status as enum ('draft', 'finalized', 'paid');

-- ===== column additions =====
-- payout_percent: per-walker compensation as % of visit price (spec §2.5);
-- 0–100 sanity bounds. Whole-table memberships/businesses grants (core migration)
-- already cover the new columns.
alter table public.memberships
  add column payout_percent numeric(5,2) not null default 0
    check (payout_percent between 0 and 100);

alter table public.businesses
  add column payment_instructions_md text,
  add column invoice_next_number int not null default 1;

-- ===== invoices =====
-- number is the per-business INV-0001 sequence; Task 2's create_invoice allocates
-- it from businesses.invoice_next_number under a for-update lock. public_token is
-- stamped on send (report-page pattern: token = credential, revocable).
create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  number int not null,
  status public.invoice_status not null default 'draft',
  issued_on date not null,
  due_on date,
  public_token text unique,
  sent_at timestamptz,
  paid_at timestamptz,
  revoked_at timestamptz,
  notes_md text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index invoices_business on public.invoices(business_id);
create index invoices_client on public.invoices(client_id);
create unique index invoices_business_number on public.invoices(business_id, number);

-- ===== invoice_items =====
-- amount_cents may be negative (manual discounts, deposit_credit lines). The
-- partial unique index is the "a visit is invoiced once" guarantee; void_invoice
-- (Task 2) deletes the items, which releases the slot for re-invoicing.
create table public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  visit_id uuid references public.visits(id) on delete set null,
  description text not null,
  amount_cents int not null,
  kind text not null check (kind in ('visit', 'manual', 'deposit_credit')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index invoice_items_business on public.invoice_items(business_id);
create index invoice_items_invoice on public.invoice_items(invoice_id);
create unique index invoice_items_visit on public.invoice_items(visit_id)
  where visit_id is not null;

-- ===== deposits =====
-- Per-client ledger: requested -> held -> applied | refunded | forfeited.
-- applied_invoice_id links a consumed deposit to the invoice that credited it.
create table public.deposits (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  amount_cents int not null check (amount_cents > 0),
  status public.deposit_status not null default 'requested',
  method public.payment_method,
  received_on date,
  applied_invoice_id uuid references public.invoices(id) on delete set null,
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index deposits_business on public.deposits(business_id);
create index deposits_client on public.deposits(client_id);

-- ===== payments =====
-- Manual records of money actually received (Venmo/Zelle/...); no processing.
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  method public.payment_method not null,
  amount_cents int not null check (amount_cents > 0),
  received_on date not null,
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index payments_business on public.payments(business_id);
create index payments_invoice on public.payments(invoice_id);

-- ===== payout_statements =====
create table public.payout_statements (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  walker_id uuid not null references auth.users(id),
  period_start date not null,
  period_end date not null,
  status public.payout_status not null default 'draft',
  total_cents int not null default 0,
  finalized_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (period_end >= period_start)
);
create index payout_statements_business on public.payout_statements(business_id);
create index payout_statements_walker on public.payout_statements(walker_id);

-- ===== payout_items =====
-- amount_cents may be negative (manual adjustments). A visit pays out once.
create table public.payout_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  statement_id uuid not null references public.payout_statements(id) on delete cascade,
  visit_id uuid references public.visits(id) on delete set null,
  description text not null,
  amount_cents int not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index payout_items_business on public.payout_items(business_id);
create index payout_items_statement on public.payout_items(statement_id);
create unique index payout_items_visit on public.payout_items(visit_id)
  where visit_id is not null;

-- ===== invoice status machine =====
-- draft -> sent -> paid, side exits draft|sent -> void. Who: owner-only — walkers
-- have no RLS/grant path to invoices at all, so this is belt and braces. A request
-- with no JWT (service role, migrations, direct privileged SQL) skips only the
-- who-check; the transition matrix itself always applies.
create or replace function public.enforce_invoice_transition() returns trigger
language plpgsql set search_path = public as $$
declare
  elevated boolean := auth.uid() is null;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;
  -- is_owner returns null (not false) for a non-member — compare with `is true`.
  if not (elevated or public.is_owner(old.business_id) is true) then
    raise exception 'only the business owner can change invoice status';
  end if;
  if (old.status = 'draft' and new.status = 'sent')
     or (old.status = 'sent' and new.status = 'paid')
     or (old.status = 'draft' and new.status = 'void')
     or (old.status = 'sent' and new.status = 'void') then
    new.updated_at := now();
    return new;
  end if;
  raise exception 'illegal invoice status transition: % -> %', old.status, new.status;
end $$;

create trigger invoices_enforce_transition
before update of status on public.invoices
for each row execute function public.enforce_invoice_transition();

-- ===== RLS =====
alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;
alter table public.deposits enable row level security;
alter table public.payments enable row level security;
alter table public.payout_statements enable row level security;
alter table public.payout_items enable row level security;

-- All billing tables are owner-only (walkers must never see client pricing —
-- the slice-1 rule extends to invoices/payments/deposits). Direct owner writes
-- cover v1 draft editing; the amount-bearing lifecycle RPCs arrive in Task 2.
create policy "owner reads invoices" on public.invoices for select
  using (public.is_owner(business_id));
create policy "owner writes invoices" on public.invoices for insert
  with check (public.is_owner(business_id));
create policy "owner updates invoices" on public.invoices for update
  using (public.is_owner(business_id)) with check (public.is_owner(business_id));
create policy "owner removes invoices" on public.invoices for delete
  using (public.is_owner(business_id));

create policy "owner reads invoice items" on public.invoice_items for select
  using (public.is_owner(business_id));
create policy "owner writes invoice items" on public.invoice_items for insert
  with check (public.is_owner(business_id));
create policy "owner updates invoice items" on public.invoice_items for update
  using (public.is_owner(business_id)) with check (public.is_owner(business_id));
create policy "owner removes invoice items" on public.invoice_items for delete
  using (public.is_owner(business_id));

create policy "owner reads deposits" on public.deposits for select
  using (public.is_owner(business_id));
create policy "owner writes deposits" on public.deposits for insert
  with check (public.is_owner(business_id));
create policy "owner updates deposits" on public.deposits for update
  using (public.is_owner(business_id)) with check (public.is_owner(business_id));
create policy "owner removes deposits" on public.deposits for delete
  using (public.is_owner(business_id));

create policy "owner reads payments" on public.payments for select
  using (public.is_owner(business_id));
create policy "owner writes payments" on public.payments for insert
  with check (public.is_owner(business_id));
create policy "owner updates payments" on public.payments for update
  using (public.is_owner(business_id)) with check (public.is_owner(business_id));
create policy "owner removes payments" on public.payments for delete
  using (public.is_owner(business_id));

-- Payouts: owner-only plus the one walker exception — a walker reads their OWN
-- statement once it is out of draft (finalized or paid), and the items chain
-- through their statement. No walker write path exists. auth.uid() wrapped in a
-- scalar subselect so the planner evaluates it once.
create policy "owner reads payout statements" on public.payout_statements for select
  using (public.is_owner(business_id));
create policy "walker reads own finalized payout statements" on public.payout_statements for select
  using (walker_id = (select auth.uid()) and status <> 'draft');
create policy "owner writes payout statements" on public.payout_statements for insert
  with check (public.is_owner(business_id));
create policy "owner updates payout statements" on public.payout_statements for update
  using (public.is_owner(business_id)) with check (public.is_owner(business_id));
create policy "owner removes payout statements" on public.payout_statements for delete
  using (public.is_owner(business_id));

create policy "owner reads payout items" on public.payout_items for select
  using (public.is_owner(business_id));
create policy "walker reads own finalized payout items" on public.payout_items for select
  using (exists (
    select 1 from public.payout_statements s
    where s.id = payout_items.statement_id
      and s.walker_id = (select auth.uid())
      and s.status <> 'draft'));
create policy "owner writes payout items" on public.payout_items for insert
  with check (public.is_owner(business_id));
create policy "owner updates payout items" on public.payout_items for update
  using (public.is_owner(business_id)) with check (public.is_owner(business_id));
create policy "owner removes payout items" on public.payout_items for delete
  using (public.is_owner(business_id));

-- ===== grants =====
-- Strip first: hosted migrations apply as postgres, whose default privileges
-- auto-grant every new table; locally the CLI applies as supabase_admin, where
-- nothing is granted. Revoking then granting exactly makes both stacks identical.
revoke all on public.invoices, public.invoice_items, public.deposits, public.payments,
  public.payout_statements, public.payout_items
  from anon, authenticated;

grant select, insert, update, delete
  on public.invoices, public.invoice_items, public.deposits, public.payments,
     public.payout_statements, public.payout_items
  to authenticated;

grant select, insert, update, delete
  on public.invoices, public.invoice_items, public.deposits, public.payments,
     public.payout_statements, public.payout_items
  to service_role;

-- Functions get PUBLIC execute by default — strip it.
revoke execute on function public.enforce_invoice_transition()
  from public, anon, authenticated;
