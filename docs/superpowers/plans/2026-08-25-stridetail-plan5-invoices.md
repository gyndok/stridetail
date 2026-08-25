# Stridetail Plan 5 — Invoices, Deposits, Payments

> **For agentic workers:** execute task-by-task with tests first (subagent per task). All Plan 1–4 global constraints + the whole of DEVIATIONS.md apply (named-columns/price rule, `is not true` guards, `revoke from public`, explicit grants, RNTL 14 async, `useRefetchOnFocus`, tokens-only colors, dollars helpers in `src/features/services/form.ts`, DateField/TimeField for dates, OTA ships JS — no native modules without flagging). Spec: `docs/superpowers/specs/2026-08-25-stridetail-slice2-bill-design.md` (THE source of truth — read it whole). Tick the Plan 5 table in `docs/PRD-CHECKLIST.md` per task.

**Goal:** spec §2 items 1–4, 6–7 — completed visits become invoices with auto-applied deposits, sent by email to a tokenised public page, paid by manually-recorded Venmo/Zelle payments. Payout tables land in the migration (Plan 6 builds their RPCs/UI).

### Task 1: Migration — billing schema (+ pgTAP)
`supabase/migrations/20260825000001_billing.sql`, `supabase/tests/011_billing.sql`.
Tables/columns exactly per spec §3 (incl. payout tables + `memberships.payout_percent` +
`businesses.payment_instructions_md`/`invoice_next_number`). RLS owner-only on all billing
tables; payout walker-read policy (`walker_id = auth.uid() and status <> 'draft'`). Unique
partial index on `invoice_items.visit_id` and `payout_items.visit_id` (where not null).
Invoice status enum + transition-guard trigger (draft→sent→paid, draft|sent→void; who:
owner-only — walkers have no path). Explicit grants per house pattern.
pgTAP: cross-role isolation matrix, visit-invoiced-once, walker payout visibility
(finalized-own yes / draft-own no / other-walker no), grants.
Commit: `feat(db): billing schema — invoices, deposits, payments, payouts`

### Task 2: Migration — billing RPCs (+ pgTAP)
`supabase/migrations/20260825000002_billing_rpcs.sql`, `supabase/tests/012_billing_rpcs.sql`.
Definer RPCs per spec §4: `create_invoice(p_client, p_from date, p_to date)` — completed
un-invoiced visits in range (or all when dates null) → `visit` items at snapshots; oldest
`held` deposits auto-applied as negative `deposit_credit` items (cap at invoice subtotal;
a deposit larger than the subtotal applies partially — REJECT splitting one deposit across
invoices in v1: apply min(remaining subtotal, deposit) and keep the remainder held? NO —
keep v1 simple: apply whole deposits while subtotal remains ≥ deposit, leave the rest held;
record choice); allocates `invoice_next_number` with `for update` lock (gapless, concurrent-
safe — pgTAP it with two concurrent creates via dblink? if impractical, lock-based
serialization asserted single-session; record). `send_invoice` (token via gen_random_bytes,
sent_at, queues `invoice_ready` email — extend `queue_client_email`), `record_payment`
(clamps: reject amount ≤ 0; over-payment allowed but flagged in audit meta; auto-flip to
`paid` when payments + credits ≥ total), `void_invoice` (releases visit items — delete
items — returns applied deposits to `held`), `record_deposit`, `forfeit_deposit`,
`refund_deposit` (held-only transitions). Every RPC audited. Add `invoice_ready` to the
send-email templates (function redeploy comes in Task 5).
pgTAP: totals math incl. negative manual lines; auto-apply ordering + partial-subtotal
rule; void releases visits + deposits; paid flip incl. exact and over payment; guards.
Commit: `feat(db): billing rpcs — create, send, pay, void, deposit lifecycle`

### Task 3: Billing feature API + owner Billing tab shell + invoice list
`src/features/billing/{types,api,money}.ts` (+tests), `app/(owner)/billing/` (`_layout.tsx`,
`index.tsx`), tab registration in `app/(owner)/_layout.tsx` (sixth tab; web rail picks it up
automatically — verify) — summary strip (unpaid total, overdue = due_on past & unpaid count,
held-deposit total), invoice list (number, client, date, status chip — greens for paid —
balance), filter chips (all/unpaid/draft). Named columns; totals computed client-side from
items+payments via pure helpers (`invoiceTotal`, `invoiceBalance`, `isOverdue`) — jest the
math hard (negatives, partial, overpay, void).
Commit: `feat(billing): api, owner tab, invoice list`

### Task 4: New-invoice flow + invoice detail + deposits screen
`app/(owner)/billing/new.tsx` (client picker → un-invoiced completed visits pre-checked with
dates/amounts → held deposits preview → manual line editor (description + signed dollars) →
Create → detail), `app/(owner)/billing/[id].tsx` (lines, payments list, balance; actions:
Send (confirm → RPC → share sheet offer), Record payment (method chips + amount + DateField
+ memo), Void (destructive confirm), Share link / Resend email / Revoke — reuse report-card
patterns), `app/(owner)/billing/deposits.tsx` (ledger grouped by client, record-deposit form,
held→forfeited/refunded actions with confirms). "Invoice this visit" entry: completed-visit
report card in `VisitScreen` gains a "Billing →" link when un-invoiced (query by
invoice_items.visit_id) prefilling new.tsx's client.
Commit: `feat(billing): invoice creation, detail, payments, deposit ledger`

### Task 5: invoice-public function + public page + email template
`supabase/functions/invoice-public/` (mirror report-public exactly: verify_jwt off in
config.toml with rationale, token credential, indistinguishable 404s incl. revoked, per-IP
rate limit, allow-list payload per spec §4), redeploy `send-email` with the `invoice_ready`
template (subject/body incl. link via REPORT_BASE_URL sibling INVOICE_BASE_URL —
`https://stridetail.app/invoice` fallback, and `app/invoice/[token].tsx` public page:
branding header, line items table, deposit credits, total + balance, payment-instructions
block, paid stamp when paid). E2E local serve: leak-check (no address/phone/email/codes/
walker markers; client first name only), revoke → 404, rate limit. Deno tests for template.
Commit: `feat(billing): public invoice page with email delivery`

### Task 6: Hosted deploy, checklist, OTA + Checkpoint 6 script
Migrations 1–2 hosted via MCP; deploy invoice-public + redeploy send-email; advisors sweep;
SQL-impersonation smoke (create→send→public fetch→payment→paid→void path on throwaway
fixtures, cleaned); push, CI green; OTA publish (`--environment preview`, verify no
localhost in dist); PRD checklist Plan 5 table + spec-§2 slice-2 annotations; append
Checkpoint 6 script to `checkpoints.md` (spec §7 last bullet; owner device + sim walker).
Commit: `chore(release): plan 5 hosted deploy`

## Definition of done
Owner can go client → invoice (visits + deposit credit) → email → branded public page →
record Venmo payment → paid, with every mutation audited, walkers blind to all of it, and
the visit un-invoiceable twice. Plan 6 picks up payouts UI + corrections polish +
Checkpoint 6 device run.
