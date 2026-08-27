# Stridetail Plan 8 — Client portal v1

> Spec: `docs/superpowers/specs/2026-08-26-stridetail-web-experience-design.md` §3, §6–§7,
> plus the dashboard-brief decisions in §9 (added 2026-08-26). Sponsor approved the
> Plan 8 / 8b / 9 sequencing in conversation 2026-08-26.
> House constraints apply. Tick the Plan 8 table in docs/PRD-CHECKLIST.md per task.

**Goal:** engaged clients get an account: passwordless OTP login, a dashboard of their
visits and report cards, their invoices with the Venmo/tip flow, editable pet profiles
and access codes, and a request-a-service flow the owner approves. Magic links stay
forever — the portal is additive. Lives in the same Expo app as a `(portal)` route
group; web-first on stridetail.app, becomes the slice-3 client mobile app for free.

## Decisions absorbed from the sponsor's dashboard brief (2026-08-26)
- **IN:** activity feed w/ report cards (maps included), booking request/reschedule/cancel,
  pet-profile self-service, **access-code (lockbox) self-service** — clients edit their own
  codes through the audited encrypted store, **1-tap tips** (already on the invoice page).
- **OUT (deferred, recorded in spec §9):** management/my-walks mode toggle (unified Today
  won on device testing), chat/messaging + presence + urgent escalation (Plan 9, after real
  clients exist; presence will be DERIVED from visit state, not a manual status), saved
  payment methods (= Stripe, parked for Alexandra), SOS button (solo business — the walker
  is the escalation target), per-walker tip splitting (rides the payout-model answer).
- **Alexandra's Sep 1 questions gain:** report approve-before-send as a per-business
  setting? tips split to walkers? Stripe timing? chat priority?

### Task 1: schema + RLS + pgTAP — client_users, booking_requests, client read scope
- `client_users(client_id, user_id, business_id, linked_at, linked_via invite|claim)` —
  unique (client_id, user_id); NO memberships row (walker/owner logic untouched).
- `booking_requests(business_id, client_id, service_id, pet_ids, window_start, window_end,
  note_md, status pending|approved|declined, decline_reason, created_by, decided_by,
  decided_at, visit_id null)`.
- Client-scoped SELECT policies (via client_users join): own visits (scheduled+completed;
  never price snapshots beyond what invoice pages show — reuse the named-column
  discipline), own visit_reports summaries, own invoices/invoice_items/payments, own
  pets, own client row. INSERT booking_requests (own, pending only) + own-select.
- RPCs (definer, `revoke from public` + anon/authenticated as appropriate):
  `approve_booking_request` (owner: creates an offered/unassigned visit at the service
  price, stamps visit_id), `decline_booking_request(reason)` (owner), both queueing the
  client email. pgTAP: full 4-actor matrix incl. cross-tenant client, client cannot see
  other clients/prices/codes of others, request state machine.
### Task 2: OTP auth + role routing + Supabase SMTP via Resend
- Supabase Auth email OTP (signInWithOtp, no passwords for clients). Custom SMTP =
  Resend (auth emails from stridetail.app; SPONSOR ACTION: dashboard SMTP settings —
  hand exact values). Rate limits stay at Supabase defaults.
- Routing: session user with membership rows → existing owner/walker tabs (unchanged);
  else with client_users row → `(portal)` group; else → existing onboarding.
  A dual-role user (staff + client) lands on staff; portal switch = later.
- NOTE the launch-blocker interplay: email confirmation is OFF on hosted (dev shortcut).
  OTP login is self-confirming; the confirmation re-enable for password signups stays a
  launch blocker, unchanged here.
### Task 3: invite-your-client + claim linking
- Owner: "Invite to portal" on the client screen → `client_invite` email template
  (queue) with portal link. Linking on first OTP login: definer RPC matches the
  authenticated email against `clients.email` in businesses that invited it (and, for
  self-claim later, exact email match from a tokened page CTA — v1 ships invite path
  only). Audited (`client_user.link`). OTP to the on-file address IS proof of ownership.
### Task 4: portal shell + dashboard
- `(portal)` route group: header with business branding (name/color/logo — the tenant's,
  not Stridetail's), tabs/sections: Home, Reports, Invoices, Pets, Requests.
- Home: next upcoming visit(s), recent report cards (map thumbnail, date, service),
  outstanding balance banner → Invoices.
### Task 5: reports archive + invoices
- Reports: chronological report cards reusing the public report page components
  (map image, timeline, photos) fetched through the client's OWN RLS reads (not the
  public token path). Invoices: list w/ status chips + detail reusing the public invoice
  components incl. tip chips + Venmo button + payment history.
### Task 6: pets + access-codes self-service
- Pets: edit feeding/behavioral notes, vet info, photo (client-scoped UPDATE policies on
  the named columns only). Access codes: client sets/updates their own codes via the
  existing encrypted-store pattern (audited set/reveal RPCs extended with the client-own
  path); UI mirrors the owner's access screen (component state only, wiped on blur).
### Task 7: booking requests end-to-end
- Client: request form (service, date + time window, pets, note), list with status.
- Owner: "Requests" strip on Today/needs-attention + Schedule; approve → offered visit
  (walker picker optional), decline → reason → email. Emails: `booking_request_received`
  (owner), `booking_request_approved` / `booking_request_declined` (client).
### Task 8: hosted deploy + Checkpoint 8
- Migrations via MCP, advisors clean, SQL-role-impersonation smoke with SMOKE- fixtures
  (fully cleaned). Deploy web (push). checkpoints.md **Checkpoint 8**: real phone,
  no app — owner invites Karla → OTP login → sees tonight's report card w/ map → edits a
  pet note + lockbox code → requests a walk → owner approves from the app → client gets
  the email. Portal pages carry noindex.

### Definition of done
A client with only an email can log in with a code, see every report and invoice, fix
their own lockbox code, and ask for a walk the owner approves in two taps — with RLS
proven so they see nothing beyond their own animals and money.
