# Stridetail Money Feature — Agent Implementation Prompt

Implement a clear, user-friendly “Money” experience in the existing Stridetail application: https://github.com/gyndok/stridetail.

The product serves independent small dog-walking and pet-care businesses. Service delivery already works well. This feature should let a business owner quickly understand who owes them money, how much they owe each walker, and the visits, tips, payments, and payouts behind those amounts.

Implement this in the existing application. Do not create a separate app or merely deliver a mockup. Preserve existing service-delivery workflows, business data, authorization, and supported platforms.

## 1. Start by understanding the current application

Read repository instructions, `docs/HANDOFF.md`, the current manual, and relevant design documents. Inspect the latest code and migrations before making changes; the paths below were identified during a review of commit `cc569be`, and may have changed.

Relevant areas include:

- `app/(owner)/billing/index.tsx`
- `app/(owner)/billing/payouts.tsx`
- Existing invoice, deposit, client-detail, and walker earnings screens
- `src/features/billing/clientBalances.ts`
- `src/features/billing/clientPrices.ts`
- `src/features/billing/payouts.ts`
- Billing types, APIs, and money helpers
- Database functions for invoices, payments, deposits, tips, and payout statements
- `supabase/migrations/20260905000007_walker_owed_now.sql`
- `src/ui/tokens.ts` and the existing theme/components

Follow the repository’s Bun-only workflow.

Before implementing, trace how money is currently created, allocated, corrected, and displayed. Identify which existing calculations and APIs can be reused and which need correction. Establish a baseline of the relevant tests.

Write a short implementation plan, then proceed. Make routine design decisions autonomously. Ask only when a material business-policy ambiguity cannot be resolved from the repository or these requirements.

## 2. Desired experience

Create one primary owner-facing destination called “Money,” preferably by evolving the current Billing destination.

The owner should be able to answer within a few seconds:

1. Which clients owe me money, and how much?
2. How much do I still owe each walker?
3. Which services, tips, payments, and payouts explain those amounts?
4. What requires my attention?

Organize around people and their balances. Invoices and payout statements remain available as supporting records.

Preserve existing routes and deep links where possible. If routes change, provide compatible navigation or redirects. Keep existing billing settings accessible without allowing them to dominate the overview.

## 3. Money overview

Show three clearly labeled summary amounts:

### Clients owe

The remaining unpaid amount on issued, non-void invoices, after valid payments, applied deposits, and supported credits.

- Identify the overdue portion separately.
- Do not include drafts or uninvoiced work as if already invoiced.
- Do not subtract one client’s credit from another client’s debt.
- Do not silently subtract deposits reserved for future care.
- Prevent accidental double counting of applied deposits.
- Clearly distinguish outstanding from overdue.

### You owe walkers

All earned compensation and allocated tips that remain unpaid, including relevant adjustments.

- Include earnings not yet on a statement.
- Include unpaid earnings on draft or finalized statements.
- Subtract recorded payouts exactly once.
- Creating or finalizing a statement does not mean money was paid.
- Do not count the same visit or tip both independently and through a statement.
- Do not lose an outstanding balance when a walker becomes inactive or is removed from the active team.
- Preserve the existing business policy for when service compensation becomes earned. Do not silently make earnings depend on whether the client has paid.
- Handle the business owner’s own visits explicitly and consistently with existing product behavior. Do not silently treat business proceeds as a contractor liability.

### Client deposits held

Money received and still held for future care.

- Keep it separate from unpaid invoices.
- Distinguish deposits from general unapplied credit if both exist.
- Applying, refunding, or otherwise releasing a deposit must update this amount correctly.

Every summary must open or lead naturally to the records explaining it.

## 4. Walker pay section

Show each relevant walker’s name and amount still owed. Prioritize unpaid balances, while keeping settled people and history accessible.

Selecting a walker should show:

- Service earnings
- Tips allocated to them
- Adjustments with reasons
- Payouts already recorded
- Remaining unpaid amount
- Relevant statement status
- Visit-level earning details
- Payout history

Use an understandable reconciliation:

Service earnings + allocated tips + adjustments − recorded payouts = still owed.

For each visit, show enough detail to explain the calculation:

- Date
- Client and pet
- Service
- Applicable service price or compensation basis
- Rate or percentage used
- Service earnings
- Allocated tip
- Amount paid and remaining, where supported

Historical earnings must not silently change when a walker’s rate or a service price is edited. Inspect current snapshot behavior and preserve historical amounts. If historical data is insufficient to reconstruct a rate confidently, do not invent it.

Keep payout statement creation, review, finalization, and existing history available, but use plain language. The owner should not have to create a statement just to discover what they owe.

Important existing behavior to investigate:
`walker_owed_now` previously counted only earnings and tips not yet placed on any payout statement. That is not a complete unpaid balance. Correct the overview calculation without double counting or breaking statement workflows.

## 5. Client balances section

Show each client’s name, useful pet context, remaining amount due, and overdue status.

Selecting a client should show:

- Invoiced services
- Payments applied toward services
- Deposits applied toward services
- Supported credits or adjustments
- Remaining amount due
- Tips received, separately
- Deposits still held for future care
- Unapplied money, if supported
- Invoice and payment history

Show each service’s charge, payments or allocations, and remaining balance when those allocations are actually known.

Do not invent service-level precision. If a payment belongs to an invoice containing multiple services and the existing model lacks line-level allocation, either implement an explicit, auditable allocation mechanism or clearly show the payment at invoice level. Do not silently attribute it to arbitrary visits.

A client can simultaneously have an unpaid invoice and a deposit for future care. Show both:

“You owe $25 for Friday’s walk.”
“We’re holding $50 for next week’s care.”

Do not collapse this into a single credit that hides the unpaid service.

Important existing behavior to investigate:
`clientBalances.ts` previously netted held deposits against outstanding invoices. Replace or supplement this presentation carefully, and review every consumer of that shared calculation so unrelated screens remain coherent.

## 6. Connect money to the visit

Make the financial story of a service traceable from both client and walker details.

Example, using sample data only:

- Service charge: $25
- Client payment received: $30 through Venmo
- Applied toward service: $25
- Tip: $5 allocated to Maya
- Maya’s service earnings: $15 at the applicable 60% rate
- Maya’s total earnings: $20
- Client payment status: paid
- Walker payment status: unpaid

Client payment and walker payout are independent statuses. Never imply that paying an invoice means the walker has been paid.

Keep this financial detail owner-only unless an existing authorized client or walker view explicitly needs a safe subset. Do not expose business prices, staff compensation, private notes, or other clients’ data through shared queries.

## 7. Record client payments

Provide a clear “Record client payment” action.

Use existing functionality where possible, improved to support:

- Client
- Total amount actually received
- Date received
- Payment method
- Allocation toward invoice/service balances
- Tip amount
- Tip recipient or recipients when needed
- Optional memo or reference

Before saving, show a clear reconciliation of the total received and its allocations.

Requirements:

- Partial payments work.
- Overpayments are explicitly handled as supported unapplied credit, another allocation, or a validation decision; never silently become tips.
- Tips do not reduce the service balance.
- Tips covering multiple walkers require an explicit allocation or a visible “Needs allocation” state.
- Allocated amounts reconcile exactly using integer cents.
- Existing removal/correction workflows remain available and auditable.
- Guard against accidental double submission.
- Do not add real payment processing or move money externally.

Preserve the existing behavior that allocated tips flow to the appropriate walker, without inventing a new tip-sharing policy.

## 8. Record walker payouts

Use “Record walker payout” or similarly clear wording. The application records money transferred elsewhere; it must not imply that it sends money.

Support:

- Walker
- Amount actually paid
- Payment date
- Method
- Optional memo/reference
- Allocation to the relevant earnings or statement balance
- Updated remaining amount owed
- Visible payout history

Support partial payouts with a sound persisted model, not a display-only approximation.

If the current schema only supports marking an entire statement paid:

- Extend it through an additive migration and compatible APIs.
- Preserve existing paid statements as settled.
- Do not duplicate historical payouts.
- Do not fabricate historical payment methods, references, or dates.
- Document how legacy settled statements are represented.
- Prevent older full-payment actions from paying an already settled balance again.
- Keep payout corrections auditable and reconcile all affected balances.

Distinguish preparing a statement, finalizing it, and recording a payment.

## 9. Needs attention

Add a compact, actionable section for financial exceptions supported by real data, such as:

- Completed visits not yet invoiced
- Overdue invoices
- Tips needing a recipient
- Payments needing allocation

Each item should lead to a useful resolution screen or action.

Avoid decorative charts, generic warnings, or invented counts. The purpose is to help the owner finish a task.

## 10. Date ranges, freshness, and error states

Outstanding balances are “as of now” and must include older unpaid amounts.

A date filter may change activity, earnings, or payment history, but must not hide an old unpaid balance or relabel period activity as the total outstanding amount.

Clearly label whether numbers refer to:

- Current outstanding balance
- Earnings from services performed in a period
- Payments received in a period
- Payouts recorded in a period

Show freshness or stale-data status where useful.

Never render failed or unavailable financial data as zero. Include useful loading, empty, error, and retry states. Do not show a settled message when the balance could not be calculated.

After a financial mutation, update all affected totals and detail views consistently.

## 11. Visual and interaction design

Use the existing warm Stridetail theme, tokens, typography, and components. Improve the information hierarchy without redesigning unrelated areas.

- Clear wording: “Clients owe,” “You owe walkers,” “Tips,” “Paid,” “Still owed.”
- Avoid ambiguous negative balances when plain language is clearer.
- Use color alongside labels, never as the only signal.
- Right-align monetary values where appropriate.
- Use progressive disclosure so the overview stays easy to scan.
- Desktop can show walker pay and client balances side by side.
- Mobile should stack naturally without cramped tables or horizontal page scrolling.
- Support keyboard navigation, accessible labels, readable contrast, and touch targets.
- Keep essential actions available without hover.

Do not introduce revenue/profit charts, bank integrations, payroll tax features, or broader bookkeeping scope for this task.

## 12. Data integrity and compatibility

Treat this as financial behavior, not merely a UI rearrangement.

- Use integer cents and consistent rounding.
- Prefer one authoritative calculation for each balance across overview and details.
- Preserve tenant isolation and role permissions.
- Validate that referenced clients, services, visits, statements, and payments belong to the correct business.
- Keep privileged mutations server-side and transactional.
- Prevent duplicate allocations and concurrent overpayment where applicable.
- Preserve existing audit records and add meaningful records for new mutations.
- Use new migrations rather than editing deployed migrations.
- Account for existing data and older client calls.
- Do not silently recalculate historical earnings from today’s rates.
- Do not delete or rewrite production records.
- Do not deploy, apply hosted migrations, or initiate external payments.

Avoid changing scheduling, GPS, offline visit execution, report delivery, authentication, or unrelated features unless a narrowly necessary integration requires it.

## 13. Regression tests and acceptance scenarios

Add meaningful tests at the appropriate layers. At minimum, verify:

1. A $25 service with a $30 payment records $25 toward care and $5 tip; the service is paid without creating a negative service balance.
2. At a 60% service compensation rate, the walker earns $15 plus the $5 allocated tip.
3. Creating and finalizing a payout statement do not reduce the total owed.
4. Recording a partial payout reduces the balance by exactly the payout amount.
5. Recording the remaining payout settles the balance without duplicate allocation.
6. Correcting a payment or payout updates affected balances while preserving history and existing restrictions.
7. A held future deposit remains separately visible alongside an unpaid invoice.
8. Applying a deposit reduces held funds and the relevant service balance exactly once.
9. An older unpaid amount stays visible when viewing this week’s activity.
10. A removed or inactive walker’s unpaid balance remains visible to the owner.
11. Multi-walker tips cannot silently disappear or be assigned arbitrarily.
12. Historical earnings remain stable after rate changes.
13. Legacy paid statements remain settled after migration.
14. Business A cannot read, allocate, or modify business B’s financial records.
15. Client and walker roles cannot access owner-only financial details.
16. Query errors do not display false zero balances.
17. Overview totals reconcile with the underlying detail records.
18. Existing invoice, deposit, statement, client portal, and walker earnings workflows still work.

Run the repository’s relevant unit tests, database tests, typecheck, and lint. Inspect the actual screens on desktop and a narrow mobile viewport, including expanded details and payment/payout forms.

If tooling blocks a check, report the exact limitation and which assertions remain unverified. Do not claim tests passed unless they ran.

## 14. Completion

Deliver the working feature, not only a plan.

Update the user manual and project tracking documents as required by repository instructions.

Finish with:

- What changed for the owner
- The precise meaning of each balance
- Schema/API changes and legacy-data handling
- Tests and visual checks performed
- Any unresolved limitations or business-policy questions
- Deployment requirements, without deploying

The acceptance standard is that an owner can see how much each client owes and how much each walker is owed, open either person to understand every amount, record money received or paid, and trust that the totals reconcile—without disrupting the existing service-providing experience.
