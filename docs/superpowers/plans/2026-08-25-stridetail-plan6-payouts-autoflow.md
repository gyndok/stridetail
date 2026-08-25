# Stridetail Plan 6 — Payouts, Auto-Invoice Flow, Pay-by-Venmo Link

> **For agentic workers:** task-by-task, tests first, all Plan 1–5 constraints + DEVIATIONS.md.
> Spec: slice-2 spec §2 item 5 (payouts) plus the sponsor-approved auto-flow design
> (2026-08-25 conversation, recorded here as normative). Tick the Plan 6 table in
> `docs/PRD-CHECKLIST.md` per task.

**Sponsor-approved auto-flow (normative):** after a walk the client gets ONE link: the report
page grows an invoice section/link; the invoice is created automatically per a per-business
setting (`auto_invoice`: `per_visit` | `per_sitting` | `manual`, default `per_visit`); the
public invoice page gains a **"Pay $X with Venmo"** deep link (amount + INV-#### note
prefilled) with a tip nudge (preset +$ buttons adjusting the prefill), Zelle/other as
instructions text; detection stays manual-but-one-tap (owner's "Mark paid" flow already
exists). True auto-detection = Stripe = slice-3 question for Alexandra (parked).

### Task 1: Migration — auto-invoice setting + finish hook + payout RPCs (+ pgTAP)
`supabase/migrations/20260825000003_autoflow_payouts.sql`, `supabase/tests/013_autoflow.sql`.
- `businesses.auto_invoice text not null default 'per_visit'` (check in ('per_visit','per_sitting','manual')); `businesses.venmo_handle text` (for the deep link; nullable = Venmo button hidden).
- `finish_visit` (replace, 0013 body as base): after report creation, when `auto_invoice = 'per_visit'` → create invoice for this client containing exactly this visit (reuse create_invoice internals via a private helper or inline; deposits auto-apply as normal), then `send_invoice` it (token + `invoice_ready` email queued). When `per_sitting` → attach the visit as an item to that client's open draft invoice (create the draft if none; do NOT send). When `manual` → today's behavior. Record: per_visit failures must not fail the visit finish (wrap in exception handler → audit 'invoice.autocreate_failed'; visit completion is sacred).
- The report link email (visit_finished) is unchanged; the combined page is app-side (Task 3).
- Payout RPCs (spec §4): `create_payout_statement(p_walker, p_from, p_to)` (completed visits in local-date range for that walker, item amount = price_cents_snapshot × memberships.payout_percent/100 rounded, one item per visit; visits already on another statement excluded via payout_items unique), `add_payout_item` (manual adjustment, signed), `finalize_payout`, `mark_payout_paid`, `void_payout_statement` (draft only, releases visits). Owner-only, audited, revoke-from-public.
- pgTAP: auto per_visit → finishing a visit yields sent invoice w/ token + email row + deposit applied; per_sitting accumulates on one draft across two visits; manual unchanged; finish never fails when invoice creation raises (forced error path); payout math incl. percent rounding + manual adjustments; statement visit-once; finalize/walker-visibility flip (011's walker-read policy now exercised end-to-end); guards.
- Commit: `feat(db): auto-invoice on finish and payout statement rpcs`

### Task 2: Owner payouts UI + billing settings
`src/features/billing/payouts.ts` (+tests), `app/(owner)/billing/payouts.tsx` (+`[statementId].tsx` if cleaner inline), settings additions.
- Billing index gains "Payouts" link row. Payouts screen: per-walker statement list (period, total, status chip), "New statement" (walker picker + DateField range → create RPC → detail), detail (items, adjustment add, Finalize confirm → walker-visible note, Mark paid, Void draft).
- Billing settings card (on billing index or settings): auto-invoice mode picker (3 chips with one-line explanations), venmo handle TextField, payment-instructions editor (multiline → businesses update; owner RLS update on businesses exists — verify, else RPC). Record where it lands.
- Commit: `feat(billing): payout statements ui and billing settings`

### Task 3: Combined report+invoice page + Venmo pay link + tip nudge
`supabase/functions/report-public/index.ts` (extend payload: when a sent/paid invoice exists containing this visit → `invoice {token}` — token only, page fetches invoice-public), `app/report/[token].tsx` (invoice card: total due / PAID + "View invoice & pay →" linking the invoice page), `app/invoice/[token].tsx` + `invoice-public` (payload gains `venmo {handle, amountCents, note}` when handle set & unpaid): page renders **Pay with Venmo** button (deep link `venmo://paycharge?txn=pay&recipients=<handle>&amount=<dollars>&note=INV-XXXX` with `https://venmo.com/<handle>?txn=pay...` web fallback — verify current Venmo URL scheme conventions, record) + tip preset chips (+$5/+$10/custom → adjusts amount in the link + shows "includes $X tip"), Zelle/instructions block unchanged. Walker-side finish alert ("Text the client") body: when auto_invoice produced an invoice, the combined link IS the report link — no change needed; record.
- Leak/E2E: report-public still leak-clean with invoice token present; invoice-public venmo block only when unpaid + handle; deno/jest for link builder + tip math (pure `venmoLink(handle, cents, note, tipCents)` shared TS + function copy per house pattern).
- Commit: `feat(billing): one-link report and invoice with venmo pay and tips`

### Task 4: Polish debts
- Resend-email on a SENT invoice: `resend_invoice_email(p_invoice)` RPC (sent/paid, re-queues invoice_ready; audited) + Resend button on invoice detail (Plan 5 deviation closed).
- New-invoice preview estimates wart: `uninvoiced_visit_amounts(p_client)` definer RPC returning visit_id + price_cents_snapshot (owner-guarded) so the preview shows true amounts (Plan 5 Task 4 deviation closed); wire into new.tsx.
- Missed-visits needs-attention line (backlog item 2026-08-25): accepted/offered visits whose scheduled_end passed > 1 h ago without start → "N visits missed" line linking Schedule (owner Today); pure helper + tests.
- Commit: `feat(billing): resend email, true preview amounts, missed-visit surfacing`

### Task 5: Hosted deploy, OTA, Checkpoint 6 update
House deploy pattern (MCP migrations + redeploy report-public/invoice-public/send-email if touched; advisors; SQL smoke: finish a SMOKE visit under per_visit → invoice auto-sent + combined payload; payout statement lifecycle; cleanup incl. counter reset), push, CI, OTA (`--environment preview`, localhost grep). Update Checkpoint 6 script: auto-invoice path (finish → one email → combined page → Venmo button prefills → owner one-tap Mark paid) + walker payout visibility (sim walker sees own finalized statement; billing otherwise blind). Checklist annotations.
- Commit: `chore(release): plan 6 hosted deploy`

## Definition of done
Finish a walk → client email carries one link → report page shows the walk AND "View
invoice & pay" → Venmo opens prefilled (tip optional) → owner taps Mark paid. Walkers see
their finalized earnings and nothing else. Stripe question queued for Alexandra.
