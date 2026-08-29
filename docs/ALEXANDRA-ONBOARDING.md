# Alexandra onboarding — Sep 1 prep pack

Everything needed to turn Alexandra's real business into a live Stridetail tenant on the
Sep 1 build day. Sources: her published website paw-and-whisker.com (fetched 2026-08-28),
`docs/HANDOFF.md` (tenant profile, feedback loop, environment), and the demo catalog in
`supabase/migrations/20260823000001_core.sql`.

## 0. Name correction

Her site brands the business **"Paw & Whisker Pet Services"** — not "Pet Care".
**Legal entity CONFIRMED 2026-08-28: "Paw & Whisker Pet Care Services LLC"** — her public
Thumbtack listing (thumbtack.com/tx/houston/dog-walking/paw-whisker-pet-care-services-llc/…,
"Credentials: Background Check — Alexandra Klein", 5.0 · 4 reviews, hired 3×) matches the
HANDOFF record. So: display name = "Paw & Whisker Pet Services" everywhere client-facing
(business record, report sender label, invites); legal name = "Paw & Whisker Pet Care
Services LLC" if/where invoices ever need the legal entity. Nothing left to verify here.

### Thumbtack facts worth folding in (fetched 2026-08-28)
- **Payments she accepts today: Apple Pay, Cash, Venmo, Zelle — no cards.** Billing config:
  Venmo handle, Zelle (email/phone), and Apple Pay destination are all first-class fields in
  Billing settings as of 2026-08-29 — set all three on onboarding day; the invoice page shows
  a Venmo pay button plus "More ways to pay" send-to rows. Mention cash in
  payment_instructions_md. This effectively pre-answers the **Stripe question: not needed
  today** — revisit only if she wants card payments later.
- Additional services she lists there (not on her own site's rate card): **Aquarium Services,
  House Sitting, Dog Grooming, Cat Grooming** — ask whether to add them to her Stridetail
  catalog (with her prices) on onboarding day.
- Species range: dogs, cats, fish, birds +3 more — the pets model's species field already
  handles this.
- The SEO page now cites the Thumbtack background check + 5.0 rating (with link) and quotes
  two of its reviews (Jenny L., Austin C.).

## 1. Service catalog (seed her real business)

Prices from her published rate card. The demo catalog's Overnight uses **720 min** as the
duration precedent; follow it. All prices in cents (`base_price_cents`, `extra_pet_price_cents`).

| Service name | Kind | Duration (min) | Base price (¢) | Extra-pet price (¢) |
|---|---|---|---|---|
| Meet & greet | `meet_greet` | 30 | 0 | 0 |
| 30-Minute Dog Walk | `walk` | 30 | 2500 | 500 |
| 60-Minute Dog Walk | `walk` | 60 | 4000 | 500 |
| 30-Minute Drop-In (cats & small mammals) | `dropin` | 30 | 2500 | 500 |
| Overnight Stay | `overnight` | 720 | 8500 | 2000 |

Notes:
- Her published extra-pet pricing: **+$5/pet** on walks and drop-ins, **+$20/pet** on overnights
  (`extra_pet_price_cents` = 500 / 2000). This differs from the demo catalog's 1000¢ overnight —
  her price wins.
- Her overnight includes an evening walk and a morning walk; that's part of the service
  description, not separate line items.
- Every service promises GPS tracking, a full visit report, and photos — exactly what
  Stridetail's execution/report pipeline delivers; no custom config needed.
- Her survey also mentioned meds, transport, and grooming/nails as occasional services; they are
  not on her published rate card. Ask on onboarding day whether to add them (demo-catalog
  precedents exist: meds 20 min/2500¢, transport 60 min/3500¢, grooming 45 min/4000¢).

## 2. Policies to configure

- **20% booking deposit** — the deposits ledger exists (Plan 6 billing). Record deposits at 20%
  of quoted total; they auto-apply to the invoice as credits. Her published terms: dates are not
  reserved until the deposit is received; deposit applies toward the total balance.
- **Vaccination requirements** — the vaccine-docs feature tracks documents with expiry. Use her
  published requirements as the per-species checklist:
  - Canines: Rabies, DHPP, Leptospirosis, Bordetella
  - Felines: Rabies, FVRCP
  - Other species: inquire (no fixed list)
- **Cancellation tiers** — her published policy: 14+ days' notice → deposit refundable;
  under 14 days → deposit becomes a credit toward a booking within 60 days of cancellation;
  under 24 hours / same-day → deposit forfeited (non-refundable, non-transferable; she reserves
  the right to require prepayment for future bookings after a same-day cancellation).
  **Not yet a product feature** — record as a Plan-9-era candidate (the PRD's slice-2 deposit
  rules row uses different tiers; hers should drive the design). Until then it's a manual policy
  she enforces herself; the deposits ledger at least tracks the money.

## 3. Answers her site implies for the open-questions list

(Open questions tracked in `docs/PRD-CHECKLIST.md` "Open" row.)

- **Show prices in the portal/requests?** Her prices are public on her own site — showing them
  in the client portal and request flow is consistent with her existing practice.
- **Report approve-before-send?** Her site promises "real-time updates sent straight to your
  phone and email" after each visit, with no client account needed. Auto-send on completion plus
  magic-link report pages match the promise she already makes; an approve-before-send gate would
  break "real-time". Flag this when the question is put to her — default to auto-send.
- **Booking flow:** her site's "Book now" is a Squarespace form. The portal request flow
  (request → owner approves) replaces it one-to-one; she already operates request-then-confirm,
  so request-approve (not open self-book) matches her current business.

## 4. Onboarding-day checklist (Sep 1)

Aligned with the HANDOFF environment/onboarding thread (Apple Developer Program membership is
the prerequisite for the first device build; App Store Connect record exists — bundle
`app.stridetail`, team NJ4JGW72MW, untouched until TestFlight).

1. **Register her iPhone UDID** in the Apple Developer account (the drafted onboarding email
   carries the device-registration link; HANDOFF does not record a URL — it's in the sponsor's
   Gmail drafts). Plan 7b Task 3 (react-native-maps) and the lazy-loaded native map ride this
   same build cut.
2. **Cut the build** (EAS device build including her UDID); install on her iPhone.
3. **Create her business**: name "Paw & Whisker Pet Services", time zone `America/Chicago`,
   keep default brand color unless she picks one.
4. **Seed services** from the table in §1 (replace/edit the demo catalog rows).
5. **Invite her as owner** (`create_invite`, role `owner`) to
   pawandwhiskerpetservices@gmail.com; her personal Klein.alexandraaerin@gmail.com is the
   backup contact.
6. Enter her vaccination checklist expectations (§2) as she adds her first pets; confirm the
   20% deposit workflow against a real upcoming booking.
7. Walk her through: Today screen, starting a visit (GPS + code reveal on start), finishing a
   report, the report link a client sees, and the invoice + deposit ledger.
8. Collect Round 1 feedback (execution screens + the rebuilt SEO page copy — she signs off on
   prices/phone/bio/testimonials at Round 1) on the round's GitHub issue in
   `gyndok/stridetail-mockups`.
9. Legal entity name CONFIRMED via Thumbtack (§0) — nothing to ask.

## 5. Where "Pet Care" still appears

- `docs/HANDOFF.md` ("The first tenant" section) — historical record; correct on next HANDOFF
  edit rather than rewriting history now.
- Old SEO-page draft — fixed 2026-08-28.
- Nothing in app code carries the tenant name (display name comes from the business record).

## 6. One more question for Round 1: preferred walker on requests?

Clients currently request a service + time window only; the owner assigns the walker at
approval (the approve card now shows availability hints — off / busy / outside hours — per
walker before you pick). Question for Alexandra: should clients be able to REQUEST a
specific walker (advisory preference on the request), or does she prefer keeping
assignment fully owner-side? Some owners dislike clients picking staff; some clients have
a favorite. Schema-wise it is a small addition when wanted.
