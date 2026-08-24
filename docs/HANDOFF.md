# Stridetail — project handoff

Last updated: 2026-08-23. Everything below is context that is *not* derivable from the code.

## What this is

A mobile-first (iOS + Android, plus Expo Web for desktop) operating system for independent
pet-care businesses. Three role modes: **Owner** (runs the business, also walks), **Walker**
(contractor doing visits), **Client** (books and pays — slice 3). Multi-tenant with per-business
white-labeling: a business's clients see that business's name and colors, not "Stridetail".

**Business model (confirmed):** this is a product company. Per-business subscriptions tiered by
team size, plus a Stripe Connect application fee on client payments later. Hooks for that are in
the schema from day one (`businesses.plan`, `profiles.is_platform_admin`, multi-business
memberships, tenant-scoped storage paths). One app in the stores; no per-business store listings.

## The first tenant

**Paw & Whisker Pet Care Services LLC**, owned by **Alexandra Klein** (the project sponsor's
daughter). She is the showcase tenant, primary tester, and the reason the product exists.
Contact for updates: pawandwhiskerpetservices@gmail.com (business, primary);
Klein.alexandraaerin@gmail.com (personal, also checked daily).

Her business today: she does most visits, one contractor friend covers overflow and vacations,
10–25 visits/week across 10–25 households, mostly one-off and vacation care. Services include
walks, drop-ins, meds, overnights, transport, cats, and grooming/nail trims; +$5 per extra pet.
Meet & greet is always required before any service. Deposit-based cancellation policy.

She uses **Doggy Logs** (rates it 3/5). What she needs kept: GPS with distance/time, timestamped
pee/poop markers and notes, automatic texts to clients on start/finish, pet profiles with
documents. Her real pains, in order: **invoicing (~10 h/week)** — visits not attachable as line
items, deposits tracked by hand, no per-walker payouts; **no per-walker availability**; lost
reports. She wants door/lockbox/alarm codes visible **only once a visit has started**. She wants
to **stay on Venmo/Zelle** (no card fees) — so "payments" for her means bookkeeping automation,
not card processing. Her one-thing-to-do-perfectly: "reports and communications."

Full survey: Google Sheet
https://docs.google.com/spreadsheets/d/1TUU09dZ56X7HWwAFqAxar-wjlA18lIsIKo9bpl-lL2o/edit

## Slice order (agreed)

1. **Operate** (current): owner + contractor, clients/pets/access codes, schedule with per-walker
   availability and assignment, offline GPS visits with events/photos, report → SMS link to a
   web report page. Checkpoint 1 = offline GPS walk survives force-kill on a real phone.
2. **Bill**: invoice ledger with visit line items, auto-applied deposits, manual "paid via Venmo"
   recording, walker payout statements. No card processing.
3. **Client app**: client login, self-booking after meet & greet, in-app reports/live map,
   messaging, waivers, optional Stripe per tenant.

Plan 1 (`docs/superpowers/plans/...plan1-foundation.md`) covers slice 1 stages 1–3. Plans 2–4
(clients/pets/access; scheduling; execution/reports/web) are still to be written from the spec.

## Decisions and why

- **Fresh project, not the old PawPath Pro repo.** The old Next.js app looked like a desktop
  tool; it is now a requirements reference only. Its mistakes to avoid: service-role client
  bypassing RLS, no session refresh, trusting a client-supplied user id in OAuth, hardcoded
  `America/Chicago`, non-transactional signup, zero tests.
- **Expo + Expo Web** over native/Flutter/separate Next.js: one TypeScript codebase, maintained
  modules for background location/camera/SQLite/push, EAS for signing and distribution.
- **Supabase-direct with a local outbox** over a sync engine: signal loss is rare for her;
  the offline surface is the day's data plus visit writes.
- **Visual direction B "Bold & Warm"** (cream `#FFF4E6`, orange `#E8642C`, ink `#2B1D12`,
  rounded cards, big type — Partiful/Duolingo feel). Active-visit screen defaults to a dark
  "field mode" while recording; user-toggleable.
- **Name "Stridetail"** chosen after screening ~70 candidates; Walkbook, PawPath, WagRoute,
  Leashly, TailCrew, Strideo and most paw/wag puns were taken or conflicting. Still owed by the
  sponsor: USPTO search, App Store / Play search, registering stridetail.com and stridetail.app.
- **pgsodium is deprecated** on new Supabase projects — use Vault or pgcrypto for `client_access`
  in Plan 2.

## Process

Borrowed from https://github.com/rami-maalouf/fable-5-vs-gpt-5-6: spec → plan → tasks with a
kickoff, a numbered on-device **judging script** in the spec, `DEVIATIONS.md` and
`checkpoints.md` during autonomous work, riskiest thing first.

## Feedback loop

- Mockup gallery (public): https://gyndok.github.io/stridetail-mockups/ (repo
  `gyndok/stridetail-mockups`). Round 0 = direction B + active-walk default, issue #1.
- Alexandra answers on the round's GitHub issue or by email to the sponsor; read open rounds at
  the start of a session.
- Sponsor sends update emails from his Gmail; drafts are prepared for his approval.

### Round 0 answers (Alexandra, by email 2026-08-24)

1. **Direction B — yes, "but would like greens added."** Keep the warm cream/orange base; add a
   green accent to the palette (success/nature notes), don't repaint.
2. **Active-walk screen: WARM by default.** This overrides spec §9's dark-by-default field mode;
   dark stays available as the `walkTheme` setting.
3. **Today needs a direct way into the client and pet profile** — she wants to reach the profile
   from a Today card, not only from a visit.
4. **Quick buttons Pee · Poop · Photo · Note are the right four.** "Any additional pet needs can
   be added to the notes" — Ate/Drank/Meds do not deserve top-level buttons.
5. **Nothing reads as "that's Doggy Logs again."**

## Environment

- Development moves to an always-on Mac mini: clone this repo there; needs Bun, Xcode
  (simulator), Docker Desktop, Supabase CLI, Claude Code, an Expo/EAS login, and an Apple
  Developer Program membership before the first device build.
- Prefer a hosted Supabase project for dev (always on, reachable from phones); keep Docker for
  `supabase test db`.
- The hosted dev project is `vrxoswukuiaerhwammlh` — deliberately **repurposed from the old
  "Dog Walker" / PawPath learning project** (sponsor-approved wipe of its schema and users on
  2026-08-23; the existing $10/mo project was reused instead of paying for a new one). All
  Stridetail migrations are tracked there via the Supabase MCP.
- Start Twilio A2P 10DLC registration early (days to approve); Google Maps API key for Android.

## Open items

- ~~Alexandra's Round 0 answers~~ — **received 2026-08-24, see Feedback loop above.** Round 1
  (execution screens: warm field mode, Today profile shortcuts, report page) is the next ask.
- Trademark checks for Stridetail (USPTO phonetic search classes 9/42, App Store / Play name reservation). **stridetail.com registered 2026-08-23** (Squarespace Domains, auto-renew, privacy, lock; renews 2029-08-23). **stridetail.app registered 2026-08-23** (same settings, renews 2029-08-23). Domains done. **Knockout searches clean (2026-08-24):** USPTO wordmark search — zero live or dead marks for stridetail / stridetale / strydetail / stridetails; App Store and Google Play — no app named Stridetail (closest: Stride Fitness, Stridist, StrideTV — different words/fields). **App Store Connect record created 2026-08-24** (name 'Stridetail' reserved, bundle `app.stridetail`, team NJ4JGW72MW, status 'Prepare for Submission' — leave untouched until TestFlight). Remaining: Play Console listing when that account exists (names not globally unique there; low urgency), and decide on a 1(b) intent-to-use USPTO filing in classes 9+42 (attorney search opinion recommended before filing).
- Developer accounts (Apple, Google Play, Expo) under the platform entity.
