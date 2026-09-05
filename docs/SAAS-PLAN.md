# Stridetail SaaS plan — from one tenant to a product

Drafted 2026-08-29 at the sponsor's request: "Stridetail should aspire to be a service for
other dog walker businesses beside my daughter." This is the business/product plan; each
phase gets its own execution plan (docs/superpowers/plans/) when it starts.

**Prime directive: Alexandra first.** Nothing in Phase B or C starts until the Phase A exit
criteria are met. A SaaS with zero happy tenants is a website; one delighted tenant whose
real clients get real reports is the entire sales pitch. The architecture is already
multi-tenant (RLS on every table, per-business scoping, white-label branding) — the moat is
proof, not code.

---

## 1. Market & pricing research (fetched 2026-08-29)

| Competitor | Model | Price |
|---|---|---|
| Time To Pet (market leader) | Tiered + per-user | Lite $25/mo · Solo $50/mo · Team $40/mo + $16/active user (1–25), $5/user after · Facility $79/mo · 30-day trial |
| Precise Petcare | Staff-count tiers | Solo $15 · 2–5 staff $35 · 6–10 $75 · 11–20 $140 · 21–30 $180 |
| Scout | Per-user | $25/mo first user + $15/additional user |
| PetPocketbook | Flat | $25/mo all staff (billing-focused, lighter ops) |
| Pet Sitter Plus | Per-user | Solo $34/mo · Team $22/user/mo · up to $378 (25+ staff) |
| DoTimely | Freemium | Free core · Pro $15/mo + $10/staff (generic field-service tool, not pet-specific) |
| Easy Busy Pets | Premium all-in-one | $247/mo (promo $99) + $13/staff — the one that bundles a website builder |

Sources: Time To Pet help center + Capterra/GetApp listings, Precise Petcare support docs,
scoutforpets.com/pricing, Capterra Pet Sitter Plus, softwareadvice/getapp roundups
(see git history / session notes for URLs).

**Reading the market:**
- The band for solo-to-small-team is **$20–50/mo**. Time To Pet's Solo at $50 is the
  premium anchor; DoTimely free is the floor (and feels generic).
- Per-active-user pricing is the norm for teams; owners hate surprise per-user jumps
  (recurring complaint in reviews).
- Nobody in the core band bundles a public website — Easy Busy Pets charges ~$100–250/mo
  partly on the strength of it. **Stridetail already generates one** (the paw-and-whisker
  page). That is the pricing wedge.
- Every competitor pushes card processing (and its ~3% fees) as the payment path.
  Stridetail's Venmo/Zelle/Apple Pay-first, zero-fee posture is a genuine differentiator
  for owner-operators who already work that way.

### Recommended pricing

| Plan | Price | Includes |
|---|---|---|
| **Solo** | **$19/mo** (or $190/yr) | 1 walker (the owner), unlimited clients/visits, GPS walk reports with maps, client portal, invoicing/deposits/payouts, desktop dashboard, hosted business page |
| **Team** | **$39/mo** (or $390/yr) | Everything in Solo + up to 3 walkers; **+$8/mo per additional walker** |
| **Founding member** | Free → 50% off for life | First ~10 tenants, in exchange for feedback + testimonial + case study |

- **30-day free trial, no card required** (match Time To Pet; the wizard + demo-data
  option makes the trial self-demonstrating).
- Positioning line: *"Everything Time To Pet does for $50, plus the website Easy Busy
  Pets charges $100 for — at $19."*
- Unit economics support this: per-tenant marginal cost is cents (Supabase rows, one
  Mapbox static image per walk ≈ free tier for years, Resend email ~$0.001/msg). Solo at
  $19 is >95% gross margin. Revisit only if SMS (10DLC) or card processing land.
- **Billing infra:** Stripe Billing (subscriptions only — client payments stay P2P).
  `businesses.plan`, `plan_status`, `stripe_customer_id`, `stripe_subscription_id`;
  webhook edge function for lifecycle; grace period on failed payment (read-only mode,
  never data deletion). Plan gating enforced server-side (walker-count check in
  `create_invite`), surfaced client-side.

---

## 2. Phase A — Prove it with tenant #1 (now → early Oct)

Already in motion; this phase is the moat. Exit criteria:
- [ ] Alexandra onboarded (Sep 1 pack), running real walks for real clients
- [ ] ≥2 of her real clients enrolled in the portal and receiving reports/invoices
- [ ] She has collected real money through a Stridetail invoice
- [ ] Round 1–2 feedback folded in; she'd recommend it to another walker
- [ ] TestFlight distribution (replaces ad-hoc device builds) — prerequisite for anyone
      outside the family anyway

## 3. Phase B — SaaS foundation (Oct → Nov)

The gap between "my daughter's app" and "a product a stranger can buy" is exactly four
things: they can sign up, they can pay, they're legally covered, and they can get help.

### 3a. Self-serve onboarding wizard
Today a business is created by hand. The wizard is the product's first impression:

1. **Sign up** — public owner signup (email OTP, same passwordless posture as the portal;
   today's flow is invite-only claim — this is a new path, gated by a Stripe-trial record)
2. **Your business** — name, time zone, brand color, logo, and **coverage zip codes**
   (2026-08-30 sponsor direction: collected from day one — it feeds the tenant page's
   local SEO and `areaServed` schema immediately, and becomes the matching key when the
   Phase-C directory turns on)
3. **Your services** — pre-seeded catalog templates (30/60-min walk, drop-in, overnight,
   meet & greet at market-typical prices — Alexandra's catalog is the template) that the
   owner edits rather than builds from scratch
4. **Your availability** — working hours per weekday (feeds the slot-hint engine)
5. **Getting paid** — Venmo/Zelle/Apple Pay handles + payment instructions + auto-invoice
   mode (default per-visit)
6. **Your team** — invite walkers now or skip (Solo default)
7. **Your clients** — three doors: add one manually · **import the roster CSV** (the
   Alexandra template, productized: upload → preview → geocode → insert, with the
   opening-balances procedure from the onboarding pack baked in as a guided step) · skip
8. **Your website** — see 3b; slug claimed here
9. **Try it** — offer demo data (one fake client/pet/completed walk with a real-looking
   report) so the app isn't empty; one tap removes it later

Each step skippable, progress saved, resumable. Instrument every step (see 5f) — wizard
drop-off is the single most important early metric.

### 3b. Business website: link or creation
Productize the hand-built paw-and-whisker page:

- **Creation (default):** every business gets `stridetail.com/p/<slug>` generated from
  data it already has — name, brand color, logo, service area, catalog with prices,
  policies, "book a meet & greet" CTA (mailto/tel now; portal request form once they have
  clients), LocalBusiness JSON-LD with offers. The current static page becomes a template
  rendered from the business record: an edge function renders + caches to the marketing
  bucket on publish/update; owner gets a "Website" screen with preview, publish toggle,
  and editable bio/testimonials sections.
- **Link (they have a site):** business page still exists (it's the SEO/booking target),
  plus a "Powered by Stridetail" badge + booking-link snippet they can paste into their
  Squarespace/Wix — the booking funnel matters more than the homepage.
- **Later (paid add-on or Team perk):** custom domain (CNAME), photo gallery, review
  auto-import.
- Every page footer links back to stridetail.com — each tenant's site is also
  distribution (this is the network-effect loop Easy Busy Pets never built at its price).

### 3c. Legal & trust (before the first stranger signs up)
- Terms of Service + Privacy Policy (lawyer-reviewed; data is pet + client PII + location
  traces), data-processing summary, cookie posture (already minimal)
- Security page: RLS everywhere, encrypted access codes with audited reveals, no card
  data stored (P2P payments)
- Backups/DR: document Supabase PITR settings; per-tenant **data export** (JSON/CSV of
  clients, pets, visits, invoices) — also the ethical exit door; tenant deletion flow
- The RLS audit in 5a is a hard gate for Phase B launch

### 3d. Support & help
- The in-app manual already exists and is audience-tagged — publish it as public web docs
  (marketing site /help) from the same content source
- support@stridetail.app inbox; in-app "Contact support" link
- Founding members get a direct line (their feedback is the product roadmap)

## 4. Phase C — Growth (Dec →)

- **App Store launch** (public listing; one multi-tenant app, login routes by membership —
  already true today). Android is a real decision point: Expo makes the build cheap, but
  support surface doubles; gate on demand from founding members.
- **Competitor migration importers**: Time To Pet and Precise Petcare CSV exports →
  Stridetail (the roster importer generalizes). "We move your data free" is the
  highest-leverage sales offer in this market — switching pain is why people stay on TTP.
- **Founding-member recruitment**: Houston-first via Alexandra's network, Thumbtack
  walkers, r/petsitting, Pet Sitters International / NAPPS communities. Her case study
  (real reports, real maps, real reviews) is the ad.
- **SMS notifications** (10DLC registration — the toll-free work already scoped) as a
  Team-plan feature.
- **Stripe card payments as an optional add-on** (owner absorbs or passes the fee) —
  competitor parity for owners who want cards, without surrendering the zero-fee default.
- **Referral loop**: a founding member refers a walker → both get a free month.
- Later, honestly evaluated only after ~25 tenants: reviews on business pages, route
  optimization, Wag/Rover import.
- **Zip-code directory ("find a walker", 2026-08-30 sponsor direction).** Mechanism:
  tenants declare coverage zips (collected since onboarding, above); a pet parent enters
  their zip at stridetail.com and sees providers covering it, feeding the per-tenant
  lead flow. SEQUENCING RULES: (a) coverage DATA ships early — it has single-player SEO
  value with one tenant; (b) the directory UI waits for DENSITY — turn it on per-metro
  once several zips have 2–3 providers (Houston first), because an empty-result search
  is a burned visitor; (c) bridge: the marketing site asks pet PARENTS for their zip
  ("looking for a walker?") — each entry is a hand-off lead when a covering tenant
  exists and a recruiting map for where to find the next founding walker; (d) decide the
  same-zip RANKING rule before building (rotation/rating/response-time — arbitrary-feeling
  order angers tenants); (e) note the posture change: a directory makes Stridetail a
  CHANNEL (vetting/reviews/dispute questions) and is also the differentiator no core-band
  competitor has — potential premium-tier or per-lead pricing.

## 5. The parts nobody asks about (but that decide whether this works)

a. **Multi-tenant hardening (Phase B gate):** an adversarial RLS audit — every table,
   every policy, attempted cross-tenant reads/writes with pgTAP proof (723+ tests exist;
   add explicit cross-tenant negative suites). Per-IP rate limits already exist on public
   endpoints; add per-tenant caps on costed actions (Mapbox renders, emails).
b. **Email deliverability at scale:** today everything sends from auth@/reports@
   stridetail.app via Resend. More tenants = shared reputation; the Marcus-went-to-junk
   lesson generalizes. Warm the domain, per-tenant sender *names* (not domains), SPF/DKIM
   already pass; monitor bounce/complaint rates per tenant and suspend abusers.
c. **Cost telemetry:** per-tenant counters (emails sent, map renders, storage bytes) in a
   monthly rollup — invisible until the tenant who runs 900 walks/month shows up.
d. **Abuse:** a free trial that sends email is a spam vector. Trial tenants get send caps
   until a subscription starts.
e. **Naming/trademark:** basic USPTO knockout search for "Stridetail" + the .com/.app are
   already held. Do this before spending on the brand.
f. **Metrics from day one:** signup → wizard completion → first walker invited → first
   client → first completed walk → first paid invoice (activation funnel), plus MRR,
   churn, weekly active tenants. Simple event table + a dashboard panel — the same
   KPI infrastructure the owner dashboard already has, pointed at Stridetail itself.
g. **The two-sided asset:** every walk report and business page is client-facing surface
   area. Quality bar on those pages IS the marketing budget.
h. **Sales tax (geographic-expansion gate, added 2026-09-04):** several states tax pet
   services — HI/NM/SD/WV tax nearly all services; KY/MN/NE/RI tax pet care explicitly;
   NY/CT/NJ conditionally (per Avalara). Invoices currently have NO tax model: before
   onboarding a business in a taxing state we need per-business tax config, a
   taxable-per-service flag, a tax line on invoices/public pages, and a collected-tax
   report. Signup should capture state and gate accordingly (or at minimum warn).
   Texas/CA/FL etc. generally exempt walking — P&W unaffected today (her "Overnight
   stay" nuance referred to her CPA). Two existing designs already help: tips are
   separated from service revenue (voluntary tips generally non-taxable), and payout
   statements double as 1099-NEC records for contractors over $600/yr.

## 6. Sequencing summary

```
Sep      Alexandra live (Phase A) ───────────► exit criteria met
Oct      Stripe billing + legal + RLS audit + wizard v1 (Phase B)
Nov      Website product + docs site + TestFlight→App Store submission
Dec      Founding members 2–10, importers, referral loop (Phase C)
2027 Q1  Public App Store launch, SMS, evaluate Android + card payments
```

Decision points deliberately deferred: Android build, card processing, marketplace,
custom domains. Each gets decided by real tenant demand, not speculation.
