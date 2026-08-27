# Stridetail — Web Experience design (client portal, landings, domains)

Date: 2026-08-26
Status: sponsor-requested plan; approved scope TBD in conversation
Covers: the public web surface — client-facing pages, the client portal (slice 3 core),
marketing landings for Stridetail and for tenants, and the .com/.app domain architecture.

## 0. The urgent gap (fix first)

Every `visit_finished` and `invoice_ready` email already links to
`https://stridetail.app/report/<token>` and `/invoice/<token>` — but stridetail.app points
at Squarespace parking. **The tokened pages are built and tested inside the Expo web app yet
nothing serves them publicly.** Deploying the web app and pointing the domain is not a new
feature; it is finishing an already-shipped one.

## 1. Domain architecture (recommended)

Two domains, two jobs — no blanket redirect:

| Domain | Role | Serves |
|---|---|---|
| **stridetail.app** | THE PRODUCT | Expo web app: tokened client pages (`/report/[t]`, `/invoice/[t]`), owner web (rail + week grid — already built), later the client portal (`/portal/...`). Also the iOS universal-link domain later (apple-app-site-association). |
| **stridetail.com** | MARKETING | Static marketing site: SaaS landing (coming-soon v1) at `/`, tenant SEO pages at `/p/[slug]` (first: `/p/paw-and-whisker`). Fast, crawlable, no app bundle. |
| www.stridetail.com | redirect | 301 → stridetail.com |
| www.stridetail.app | redirect | 301 → stridetail.app |

Why not everything on one domain: marketing pages want SEO-grade static HTML, instant loads,
and frequent copy edits; the product wants app semantics and universal links. Splitting keeps
each simple. The `.com → .app` question inverts: **.com doesn't forward to .app** — each has
a purpose; cross-links do the joining ("Sign in" on .com → app.stridetail? no —
stridetail.app; "About Stridetail" footer on .app → .com).

Per-tenant custom domains (pawandwhisker.com pointing at her page) = later slice; the
`/p/[slug]` page is built to make that a CNAME + config change, not a rebuild.

## 2. Hosting

- **stridetail.app — Vercel** (account already connected via MCP): deploy the existing
  `bunx expo export --platform web` output (static; 48 routes today). CI/CD: GitHub-linked
  project or CLI deploy in the release step. Custom domain via Squarespace DNS (A/ALIAS per
  Vercel instructions replacing the parked Squarespace A-records — NOTE the Squarespace
  Defaults preset holding those A records gets deleted for .app only; .com keeps or replaces
  its own as marketing hosting decides).
- **stridetail.com — Vercel too** (separate lightweight project; plain static HTML/CSS or a
  tiny SSG — no framework weight needed for v1). Alternative considered: build the landing in
  Squarespace itself (sponsor drags-and-drops copy edits). Rejected for v1 because the tenant
  SEO pages want structured data + eventual Supabase-driven generation; revisit if the
  sponsor prefers a visual editor for marketing copy.
- Env: the web app build needs the hosted `EXPO_PUBLIC_*` values (same trap as OTA — always
  export with the hosted env; encode it in the deploy script).

## 3. Client experience model — magic links AND accounts (both, staged)

**Tier 1 — magic links (exists today).** Tokened, no-login pages for reports and invoices.
This stays forever: the person dog-sitting for a client's neighbor should never need an
account. Tokens are revocable credentials; pages are leak-checked.

**Tier 2 — client accounts (the portal).** For engaged clients: passwordless email OTP /
magic-link **login** via Supabase Auth (no passwords for clients — matches how rarely they
visit). New linkage: `client_users(client_id, user_id)` created by an owner-sent invite
email ("Karla, view all your visits and invoices") or self-claim from a tokened invoice page
("Save these to an account?" → OTP to the client email on file → links automatically when
the address matches). Role model extends: a user may be owner/walker/client in different
businesses; client role gets NO membership row (separate table keeps walker/owner logic
untouched).

Portal scope, phased:
- **Portal v1 (read + request):** dashboard (upcoming visits, recent reports), invoice
  list + detail with payment history and the Venmo/tip button, report archive, pet profiles
  (view; photo update), **service request** form (service, date/time window, pets, note) →
  new `booking_requests` table → owner needs-attention "Requests" strip → approve = creates
  an offered/unassigned visit, decline with reason (emailed). RLS: client reads only rows
  joined through their `client_users` link; requests insert-only + own-select.
- **Portal v2 (communicate):** message threads per client↔business (`threads`, `messages`,
  read markers), owner side in-app, client side in portal, email notification fallback.
  Explicitly SECOND — messaging is a support burden and Alexandra currently texts.
- The portal lives in the same Expo app as a `(client)` route group (`/portal`) — one
  codebase, RLS already the security boundary, and it becomes the slice-3 client mobile app
  for free.

## 4. Marketing site content

**stridetail.com (SaaS, coming-soon v1):** hero ("Run your pet-care business, not your
paperwork"), 3–4 feature blocks with real screenshots (offline GPS walks, gated door codes,
one-link report+invoice, Venmo-friendly billing), the white-label promise, founder story
one-liner, email capture ("Get early access" → a `waitlist` table or a simple form service),
footer (privacy, terms — REQUIRED before App Store review anyway; draft both). No pricing
page v1 (undecided), no fake testimonials ever.

**stridetail.com/p/paw-and-whisker (tenant SEO):** LocalBusiness JSON-LD (name, area:
Houston TX, services, hours, contact), service list with prices optional (her call),
photo(s), "Book a meet & greet" CTA (mailto/tel v1; portal request form when live),
Google-Business-Profile-ready copy. Target queries: "dog walker Houston", "pet sitter
77027", "cat sitting Houston". v1 hardcoded content (her sign-off on copy); later generated
from business settings.

## 5. What the whole surface should include (inventory)

Public/product (.app): tokened report + invoice (live), portal auth pages, portal v1 pages,
privacy policy + terms (shared), support/contact page, apple-app-site-association +
assetlinks.json (universal links, when app store ships), 404, favicon/OG images.
Marketing (.com): landing, /p/paw-and-whisker, privacy + terms (canonical copies), simple
blog-ready structure (later), robots.txt + sitemap.xml (BOTH domains; noindex the tokened
pages — they're unlisted, ensure `X-Robots-Tag: noindex` from the app host for /report/* and
/invoice/*).

## 6. Security & privacy notes

- Tokened pages: keep noindex; tokens stay revocable; no change.
- Portal RLS: client sees own invoices/payments/reports/visits/pets ONLY; never other
  clients, never business financials beyond their own, never codes (obviously), never walker
  personal info beyond display name.
- OTP login rate limits (Supabase default) + the existing email channel sends the OTP mails
  (Supabase Auth SMTP: configure Resend as custom SMTP so auth emails also come from
  stridetail.app — one settings change, better deliverability).
- Email confirmation currently OFF on hosted auth (dev shortcut) — the portal launch is the
  natural moment to turn it back on with proper flows (already a launch-blocker item).

## 7. Phasing (proposed plans)

- **Plan 7 — Ship the web (urgent → this week):** T1 deploy Expo web to Vercel + wire
  stridetail.app DNS (email links come alive; verify tokened pages + owner web login on
  real domain; noindex headers). T2 marketing site scaffold + coming-soon landing on
  stridetail.com + www redirects + privacy/terms drafts. T3 /p/paw-and-whisker SEO page
  (copy needs Alexandra's sign-off — build with placeholder-approved copy, mark draft).
  T4 sitemaps/robots/OG + Checkpoint 7 (email → inbox → tap → live page on real phone,
  no app installed).
- **Plan 8 — Client portal v1:** client_users + booking_requests schema/RLS/pgTAP, OTP auth
  flows, (client) route group (dashboard/invoices/reports/pets/request), owner Requests
  strip + approve/decline, invite-your-client flow, Supabase-SMTP-via-Resend.
- **Plan 9 — Portal v2:** messaging threads, notification preferences, self-claim from
  tokened pages, per-tenant custom domains.

## 8. Open questions

1. Sponsor: Vercel for both domains OK? (Free tier suffices initially.)
2. Alexandra: Paw & Whisker page copy, photos, whether prices are public, service area.
3. Alexandra: does she want requests-with-approval (recommended) or true self-booking
   (slice-3 spec said self-booking after meet & greet — portal v1's request+approve is the
   conservative bridge)?
4. Waitlist capture destination (Supabase table is fine).
5. Privacy/terms: draft with a template now, legal review before App Store submission.

## 9. Dashboard-brief decisions (added 2026-08-26, sponsor-approved)

The sponsor supplied a three-role dashboard brief (owner command center / walker
mobile dashboard / customer portal). Disposition, agreed in conversation:

**Accepted → Plan 8 (client portal v1):** activity feed with report cards (incl. walk
maps), booking request/reschedule/cancel, pet-profile self-service, access-code
(lockbox) self-service through the audited encrypted store, 1-tap tips.
**Accepted → Plan 8b (owner command strip):** business-health KPI cards (revenue
day/week, outstanding, pending requests, walks today), "on a walk now" live status
derived from visit state.

**Rejected — management/my-walks global toggle:** re-introduces the exact mode
confusion device testing eliminated; the unified Today (Up-next hero) stays.

**Deferred → Plan 9 (messaging), triggered by real portal clients:** chat (internal +
client threads), presence banners, urgent-bypass escalation. Presence will be DERIVED
(in_progress visit = on a walk) — no manual status dropdown; an "urgent" flag that
emails/pushes the owner is the v1 escalation. **Deferred pending scale:** dispatch map
of all active walks, team status grid, staff capacity (multi-walker features; first
tenant is currently solo), drag-and-drop reassignment (already a backlog item on the
web week grid). **Deferred pending Alexandra:** report approve-before-send (today
reports auto-send on finish — would become a per-business setting), per-walker tip
splitting (rides the payout-model question), saved payment methods (= Stripe, parked),
SOS button (solo business — the walker is the escalation target).

**Alexandra's Sep 1 question list gains:** report approval setting? tip splitting?
Stripe timing? how much does she want client chat?
