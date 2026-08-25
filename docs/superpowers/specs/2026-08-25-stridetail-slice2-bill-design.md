# Stridetail — Slice 2 "Bill" design spec

Date: 2026-08-25
Status: approved in conversation (sponsor); Alexandra validates assumptions on return (~Sep 1)
Precedence: slice-1 spec conventions carry over; this spec > plans > conversation.

## 1. Purpose

Slice 2 removes Alexandra's largest pain: **~10 hours/week of manual invoicing**. Her exact
words (survey, 2026-08-23): visits can't be attached to invoices as line items; deposit
invoices are tracked by hand and manually subtracted; per-walker payouts are calculated
manually and paid through a second app. She wants to **stay on Venmo/Zelle** — so slice 2 is
bookkeeping automation, not payment processing. No Stripe, no card charging, no client login
(slice 3).

The unit of billing already exists: every visit carries `price_cents_snapshot` stamped at
creation. Slice 2 turns completed visits into invoice line items, applies deposits
automatically, records how money actually arrived, and produces walker payout statements.

## 2. Scope

### In scope

1. **Invoices**: owner selects a client (+ optional date range) → all completed, un-invoiced
   visits become line items at their snapshots. Manual free-form lines allowed (positive or
   negative — covers tips received, discounts, surcharges without dedicated features).
   Status machine: `draft → sent → paid`, side exits `draft|sent → void`, plus `partially_paid`
   derived (not stored) from payments. Invoice numbers per business: `INV-0001` sequence.
2. **Public invoice page**: tokenised web page (report-page pattern — token is the
   credential, revocable, report-safe: business branding, line items, deposit credit, total
   due, "pay by Venmo/Zelle" instructions text from business settings). Email to client on
   send ("invoice ready" template) with the link; resend/revoke like reports.
3. **Deposits**: a deposit ledger per client: `requested → held → applied | refunded |
   forfeited`. Recording a received deposit (amount, date, method, memo) puts it in `held`;
   invoice creation **auto-applies** the oldest held deposit(s) for that client as credit
   lines; cancellation flow can mark `forfeited` per her policy (refundable until 7 days
   before service; forfeited within 24 h — the policy TEXT lives in business settings, the
   ledger just records the outcome; no automatic enforcement in v1).
4. **Payments**: manual records against an invoice — method (`venmo`, `zelle`, `cash`,
   `check`, `other`), amount, received date, memo. Invoice flips to `paid` when payments +
   deposit credits ≥ total; partial payments leave it `sent` with balance shown.
5. **Walker payouts**: per-walker compensation as a **percentage of visit price**
   (`memberships.payout_percent`, default 0 for owners, settable per walker). Payout
   statement = period (date range) × walker → completed visits, each `price ×
   percent`, plus manual adjustment lines; statuses `draft → finalized → paid` (paid =
   recorded manually; she pays via her own transfer app). Walker sees ONLY their own
   finalized statements (read-only) in the walker view.
6. **Owner UI**: new owner tab **Billing** (replacing nothing; sixth tab on mobile, rail item
   on web): unpaid/overdue invoice list, deposit ledger, "New invoice" flow, invoice detail
   (lines, payments, actions), payouts section. Completed-visit screens link into billing
   ("Invoice this visit"). Money formatting via the existing services dollars helpers.
7. **Audit**: invoice create/send/void/paid, deposit transitions, payout finalize — all in
   `audit_log`.

### Out of scope (explicitly)

- Card processing, Stripe, payment links that collect money (slice 3+, per-tenant opt-in).
- Client login/portal (slice 3). Packages/prepaid bundles (open item — needs her input).
- Automatic deposit-policy enforcement on cancellation (v1 records outcomes; enforcement
  after she validates the policy encoding).
- Tax lines/rates (Texas pet services — revisit with an accountant before real invoices).
- Recurring/auto-generated invoices (her billing is per-sitting; a "bill this client"
  shortcut covers the cadence).

## 3. Data model (all tables: `business_id`, timestamps, RLS owner-only unless noted)

| Table | Key columns |
|---|---|
| `invoices` | `client_id`, `number int` (per-business sequence), `status` (`draft`,`sent`,`paid`,`void`), `issued_on date`, `due_on date?`, `public_token` (on send), `sent_at`, `paid_at`, `revoked_at`, `notes_md` |
| `invoice_items` | `invoice_id`, `visit_id?` (unique when set — a visit is invoiced once), `description`, `amount_cents int` (may be negative), `kind` (`visit`,`manual`,`deposit_credit`) |
| `deposits` | `client_id`, `amount_cents`, `status` (`requested`,`held`,`applied`,`refunded`,`forfeited`), `method?`, `received_on?`, `applied_invoice_id?`, `memo` |
| `payments` | `invoice_id`, `method` (`venmo`,`zelle`,`cash`,`check`,`other`), `amount_cents`, `received_on date`, `memo` |
| `payout_statements` | `walker_id`, `period_start date`, `period_end date`, `status` (`draft`,`finalized`,`paid`), `total_cents`, `finalized_at`, `paid_at` |
| `payout_items` | `statement_id`, `visit_id?` (unique when set), `description`, `amount_cents` |
| `memberships` | + `payout_percent numeric(5,2) default 0` |
| `businesses` | + `payment_instructions_md` (shown on the public invoice page), `invoice_next_number int default 1` |

Derived, never stored: invoice total (sum of items), balance (total − payments), partially-paid.

## 4. Security

- All billing tables owner-only via RLS (walkers must never see client pricing — slice-1
  rule extends to invoices/payments/deposits). Exception: `payout_statements`/`payout_items`
  walker-readable where `walker_id = auth.uid()` AND status ≠ `draft`.
- Amount-bearing mutations via security-definer RPCs (audited, `is not true` guards,
  `revoke from public, anon`): `create_invoice(client, from, to)` (assembles visit lines +
  auto-applies held deposits, allocates number), `send_invoice` (token + email queue),
  `record_payment`, `void_invoice`, `record_deposit`, `forfeit_deposit`, `refund_deposit`,
  `create_payout_statement(walker, from, to)`, `finalize_payout`, `mark_payout_paid`.
- `invoice-public` edge function mirrors `report-public` exactly (verify_jwt off, token =
  credential, 404 indistinguishable for unknown/revoked, rate-limited, allow-list payload:
  business name/logo/color, client FIRST name only, lines, totals, payment instructions.
  Never: address, phones, emails, codes, walker anything).
- Email: `invoice_ready` template on the existing notifications queue/channel.

## 5. Flows

1. **Bill a sitting**: Billing → New invoice → pick client → un-invoiced completed visits
   listed pre-checked (with dates + snapshots) → held deposits shown, auto-applied → add
   manual line if needed → Create (draft) → review → **Send** (email + link live) → client
   pays Venmo → owner **Record payment** → paid.
2. **Deposit**: client books a sitting → owner records requested/received deposit → it waits
   `held` → next invoice for that client consumes it as a `deposit_credit` line.
3. **Payout run**: Billing → Payouts → pick walker + period → statement drafts from completed
   visits × `payout_percent` → adjust → finalize (walker can now see it) → pay via own app →
   mark paid.
4. **Corrections**: void (draft/sent) reopens the visits for re-invoicing (items released);
   deposits on a voided invoice return to `held`.

## 6. UI

Owner **Billing** tab: summary strip (unpaid total, overdue count, held deposits), invoice
list (status chips, balance), invoice detail (lines, payments, Send/Record payment/Void/
Share link/Resend email/Revoke), New-invoice flow, Deposits screen (ledger + record),
Payouts screen (statements + new). Walker: "Earnings" row in Settings → own finalized
statements. Direction B styling; greens for `paid`; DateField/TimeField for dates; money via
dollars helpers. Web rail gains Billing; week grid untouched.

## 7. Testing

- pgTAP: RLS isolation (walker sees no invoices/payments/deposits; walker sees own finalized
  payout only — not drafts, not others'); visit invoiced exactly once (unique + release on
  void); deposit auto-apply ordering (oldest first) and totals; number sequence gapless per
  business under concurrent create; paid-state transition math incl. negative manual lines;
  RPC guards (non-owner rejected everywhere); audit rows on every money mutation.
- Jest: totals/balance math (incl. negatives, partial payments, over-payment clamp),
  dollars round-trips, invoice/payout builders, query shapes (named columns).
- E2E (local serve): invoice-public leak-check (same rigor as report-public: no address/
  phone/email/codes/walker markers), revoke → byte-identical 404.
- **Checkpoint 6 (device)**: owner invoices the real completed walks → emails himself the
  invoice → opens the branded page → records a Venmo payment → paid; walker (sim) sees their
  finalized payout statement and nothing else.

## 8. Build order (Plan 5, then Plan 6)

- **Plan 5 — invoices, deposits, payments**: schema+RPCs+pgTAP → invoice-public function +
  email template → owner Billing tab (list/new/detail/deposits) → public page → checkpoint.
- **Plan 6 — payouts + polish**: payout schema is in Plan 5's migration; Plan 6 adds RPCs UI
  (owner + walker read side), corrections flow polish, and anything Checkpoint 6 shakes out.

## 9. Decisions and open items

- **Payout = % of visit price** is an ASSUMPTION (survey says only "manual calculations");
  flat-per-visit or per-service overrides may be needed — validate with Alexandra (open).
- Tips/discounts as manual signed lines, not features (cheap, covers the survey wants).
- Packages/prepaid bundles: OPEN — needs her input; deposits ledger is the structural
  neighbor it would extend.
- Invoice numbering per business, no year prefix (INV-0042); revisit if she wants her own
  scheme. Tax: none in v1 (open item before real invoices go out).
- Public invoice page shows client first name only — same privacy posture as reports.
