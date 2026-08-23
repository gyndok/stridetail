# Stridetail — Slice 1 "Operate" design spec

Date: 2026-08-23
Status: approved in conversation; awaiting written review
Precedence: this spec > plan.md > todo.md

## 1. Purpose

Stridetail is a mobile-first, multi-tenant operating system for independent pet-care
businesses (dog walkers, sitters, drop-in carers). Each business is a tenant with
its own branding; its clients see the business's name, not Stridetail's.

Slice 1 lets one business — Paw & Whisker Pet Care Services LLC, the showcase
tenant — run its daily operations: an owner who also walks, one contractor walker,
clients and pets managed by the owner, scheduled visits assigned to walkers, visits
executed in the field with reliable offline GPS and timestamped events, and a report
that reaches the client by SMS as a web link.

Slice 1 deliberately excludes invoicing (slice 2) and the client-facing app
(slice 3). Structural hooks for both, and for the subscription product model, are
included so neither needs a retrofit.

### Discovery inputs (Alexandra Klein, 2026-08-23)

- Team: owner + 1–2 contractors; 10–25 visits/week; 10–25 households.
- Work is mostly one-off and vacation care, with some recurring.
- Services: meet & greet (always required before first service), solo walk, puppy
  visit, feeding/drop-in, medication visit, overnight, transport, cat/small-animal
  care, bathing/grooming/nail trims. +$5 per additional pet.
- Must keep from Doggy Logs: GPS with distance and time, timestamped pee/poop markers
  and notes, automatic text to the client on start and finish, client/pet profiles
  with notes and document attachments.
- Pains: per-walker availability (shared schedule today), lost reports, invoicing
  (slice 2).
- Field needs at the door: door/lockbox/gate/alarm codes, leash/equipment location,
  reactivity. Codes must be visible only once a service has started.
- Pet profile: feeding schedule, health conditions, medications and schedule,
  allergies, reactivity, vet name/phone/address, proof of rabies, DHPP, lepto,
  Bordetella.
- Notifications clients want: on the way, started, ended, report ready.
- Walkers should accept/decline their own jobs, block their own schedule, and tell
  the owner when they cannot cover.
- Signal loss is rare; battery is not a concern; multi-dog visits are regular.

## 2. Scope

### In scope

1. Self-serve business creation (name, logo, brand color, IANA time zone, policies
   text). Creator becomes `owner`.
2. Memberships with roles `owner` and `walker`; invitation by SMS/email link;
   `is_platform_admin` flag on user profiles.
3. Clients (households) and pets with instructions, vet info, vaccine documents with
   expiry, and secured access info.
4. Per-business service catalog, seeded with Paw & Whisker's list on creation.
5. Scheduling: one-off visits and recurring series; assignment to a walker;
   walker accept/decline; per-walker weekly availability and time off; owner view of
   conflicts, declined, and unassigned visits.
6. Visit execution: Today screen, start/finish, background GPS when the service
   requires it, timestamped events per pet (pee, poop, ate, drank, meds, note,
   photo), multi-pet visits, private owner-only notes.
7. Reports: generated on finish, public tokenised web page, SMS to client on start
   and finish with the report link, retry on failure, owner resend/revoke.
8. Offline: day data cached on device; visit mutations and GPS buffered in a local
   outbox and synced in order.
9. Expo Web layout for owners on desktop (≥ 900 px): rail navigation, week grid.
10. White-label: business name, logo, and accent color on every client-facing surface
    (SMS sender text, report page) and in the app chrome.

### Out of scope (later slices)

- Invoices, deposits, payments, walker payouts, packages, discounts (slice 2).
- Client login, self-booking, in-app messaging, live map for clients, waivers,
  Stripe (slice 3).
- Push notifications to walkers beyond Expo push registration (SMS is the fallback
  in slice 1). Route optimisation. Multi-location businesses. Platform billing —
  `businesses.plan` is fixed to `free`.

## 3. Users and roles

| Role | Who | Sees |
|---|---|---|
| owner | Alexandra | Everything in her business; can switch to the walker Today view |
| walker | Contractor | Own visits, own availability, clients/pets for assigned visits only; never pricing, never other walkers' schedules |
| platform_admin | You/maintainers | Cross-business read for support; flag on profile, no UI in slice 1 beyond a badge |
| client | Households | No login. Receives SMS; opens public report pages |

A user may hold memberships in several businesses (a contractor working for two
owners). The active business is selected in-app and stored locally.

## 4. Architecture

- **App:** Expo SDK 57, Expo Router, React Native 0.86, TypeScript strict, Bun.
  One codebase for iOS, Android, and web (`react-native-web`).
- **Backend:** Supabase — Postgres with RLS, Auth, Storage, Edge Functions.
- **Data access:** Supabase JS v2 directly from the app under the user's JWT;
  TanStack Query with a persisted cache (`expo-sqlite` persister) for reads; a
  SQLite outbox for writes made during visits; Zustand for UI state.
- **Privileged operations** run only in edge functions with the service role:
  `send-sms`, `report-public` (token → report-safe JSON), `ingest-track`
  (GPS batch upsert and distance recompute), `invite-accept`.
- **SMS:** Twilio via `send-sms`. Sender text is prefixed with the business name.
- **Maps:** `react-native-maps` (Apple Maps on iOS, Google Maps on Android with API
  key), light and dark styles. Web report page uses a static polyline render.
- **Location:** `expo-location` + `expo-task-manager` background task; Android
  foreground service; iOS `UIBackgroundModes: location`. Development builds only
  (Expo Go cannot run these).
- **Builds:** EAS Build and EAS Update. Bundle id `app.stridetail` is set at the
  first store build, after trademark and store-name checks.

### Repository layout

```
stridetail/
  app/                      expo-router routes
    (auth)/                 sign-in, sign-up, invite/[token]
    (owner)/                today, schedule, clients, team, settings
    (walker)/               today, schedule, clients
    report/[token]          public report page (web)
  src/
    features/               auth, business, clients, pets, services, schedule, visit, report
    lib/                    supabase, offline (outbox, cache), gps, sms, brand, theme, tz
    ui/                     design system: tokens, components
  supabase/
    migrations/             SQL including RLS and functions
    functions/              send-sms, report-public, ingest-track, invite-accept
    tests/                  pgTAP policy tests
  docs/superpowers/         specs, plans
```

## 5. Data model

All tables except `profiles` carry `business_id uuid not null` and
`created_at/updated_at`. Ids are UUIDs generated client-side where offline creation
is possible (visits, visit_events, visit_tracks).

| Table | Key columns |
|---|---|
| `profiles` | `user_id` (auth.users), `display_name`, `phone`, `is_platform_admin bool` |
| `businesses` | `name`, `slug`, `logo_path`, `brand_color`, `time_zone` (IANA), `policies_md`, `plan text default 'free'`, `access_grace_hours int default 12` |
| `memberships` | `user_id`, `role` (`owner`/`walker`), `status` (`invited`/`active`/`inactive`), `invite_token`, `invited_phone`, `invited_email` |
| `clients` | `name`, `phones text[]`, `email`, `address`, `lat`, `lng`, `notes_md`, `mg_completed_at` |
| `client_access` | `client_id`, `door_code`, `lockbox_code`, `gate_code`, `alarm_code`, `key_location`, `notes` — all sensitive columns encrypted with pgsodium |
| `pets` | `client_id`, `name`, `species`, `breed`, `birthdate`, `feeding_md`, `meds_md`, `allergies`, `reactivity_md`, `vet_name`, `vet_phone`, `vet_address`, `photo_path` |
| `pet_documents` | `pet_id`, `type` (`rabies`/`dhpp`/`lepto`/`bordetella`/`other`), `storage_path`, `expires_on` |
| `services` | `name`, `kind` (`meet_greet`/`walk`/`dropin`/`meds`/`overnight`/`transport`/`grooming`/`other`), `base_price_cents`, `extra_pet_price_cents`, `duration_min`, `requires_gps bool`, `active bool` |
| `availability_rules` | `user_id`, `weekday`, `start_local time`, `end_local time` |
| `time_off` | `user_id`, `starts_at`, `ends_at`, `reason` |
| `visit_series` | `client_id`, `service_id`, `walker_id`, `rrule`, `starts_on`, `ends_on`, `local_start time`, `pet_ids uuid[]` |
| `visits` | `client_id`, `service_id`, `series_id?`, `walker_id?`, `pet_ids uuid[]`, `scheduled_start timestamptz`, `scheduled_end timestamptz`, `business_tz`, `status`, `price_cents_snapshot`, `owner_notes_md`, `decline_reason`, `started_at`, `finished_at`, `distance_m` |
| `visit_events` | `visit_id`, `pet_id?`, `type` (`arrived`/`started`/`pee`/`poop`/`ate`/`drank`/`meds`/`note`/`photo`/`finished`), `occurred_at`, `text`, `photo_path`, `client_uuid` (idempotency) |
| `visit_tracks` | `visit_id`, `segment_no`, `points jsonb` (`[{t, lat, lng, acc}]`), `client_uuid` |
| `visit_reports` | `visit_id`, `public_token`, `summary jsonb`, `private_notes_md`, `sent_at`, `sms_status`, `revoked_at` |
| `notifications` | `channel` (`sms`), `to`, `template`, `payload jsonb`, `status`, `provider_id`, `attempts`, `next_attempt_at` |
| `audit_log` | `actor_user_id`, `action`, `entity`, `entity_id`, `meta jsonb` |

### Visit status machine

`unassigned → offered → accepted → in_progress → completed`
Side exits: `offered → declined` (returns to owner as unassigned with reason);
any pre-`in_progress` state → `cancelled`. Only the assigned walker may move
`accepted → in_progress → completed`. Owners may force-assign (`accepted` without
offer) for their own visits.

### Time handling

`scheduled_start/end` are UTC instants. `business_tz` is copied onto each visit at
creation. "Today", week grids, availability matching, and RRULE expansion are
computed in `business_tz` on the client using `date-fns-tz`; the server never assumes
a zone. No default zone is hardcoded anywhere.

## 6. Security

1. **RLS on every table; no service-role use from the app.** Policies use
   `current_business_ids()` (active memberships of `auth.uid()`) and
   `current_role_in(business_id)`.
2. **Walker visibility:** walkers select `visits` only where `walker_id = auth.uid()`
   or status is `offered` to them; `clients`/`pets` only via those visits;
   `services` without price columns (a view `services_public`); no access to
   `availability_rules`/`time_off` of others; no `audit_log`.
3. **Access codes:** `client_access` has no select policy. A security-definer
   function `reveal_access(visit_id)` verifies: caller is `visits.walker_id`, visit
   status is `in_progress`, and the visit belongs to the client. It inserts an
   `audit_log` row and returns decrypted fields. Owners may call
   `reveal_access_owner(client_id)` at any time (also audited).
4. **Public reports:** the `report-public` edge function looks up
   `visit_reports.public_token`, rejects revoked tokens, and returns only: business
   name/logo/color, pet names, service name, times, duration, distance, polyline,
   events (type, time, text, photo URLs signed for 24 h). Never address, codes,
   price, or walker contact details.
5. **Auth:** Supabase Auth email + password and magic link. Tokens stored in
   `expo-secure-store`; `autoRefreshToken` on; app foreground triggers
   `startAutoRefresh`.
6. **Storage:** bucket `media`, paths `business_id/visit_id/...` and
   `business_id/pets/...`; policies mirror table access. Public report photos are
   served via short-lived signed URLs.
7. **Audit:** status changes, assignment changes, code reveals, report resend/revoke.
8. **Secrets:** Twilio and service-role keys only in edge function env. `.env` is
   gitignored; `.env.example` is tracked.

## 7. Flows

### 7.1 Business setup
Sign up → "Create your business" (name, tz auto-detected, brand color, logo optional)
→ owner membership → services seeded → "Invite a teammate" (phone or email) →
invitee opens link → signs up/in → `invite-accept` activates membership.

### 7.2 Client intake
Owner adds client (contact, address geocoded on save), pets, access codes (separate
screen with a lock icon), vaccine documents (camera or file). Meet & greet is a visit
with a `meet_greet` service; completing one sets `clients.mg_completed_at`.

### 7.3 Scheduling
Owner creates a visit (client → service → pets → date/time → walker). The walker
picker shows each walker's availability for that window, time off, and overlapping
visits. Save → status `offered` (or `accepted` when self-assigned). Walker receives
SMS (push later) and accepts/declines in-app. Declines show in the owner's Today
"Needs attention" strip. Series: RRULE editor limited to weekly patterns and date
ranges; generates `visits` rows 8 weeks ahead via a nightly edge cron and on edit.

### 7.4 Visit execution (walker)
Today → visit card → detail (pets, instructions, equipment, reactivity; **Reveal
codes** disabled until Start) → **Start**: `arrived`+`started` events, SMS
"started", GPS task begins if `requires_gps` → event buttons per pet, camera, note,
timer and live distance → **Finish**: GPS stops, `finished` event, report row with
token, SMS "finished" with link → "Note for owner" (private).

### 7.5 Report
`/report/[token]` (Expo Web route) calls `report-public`. Shows business branding,
pets, times, duration, distance, polyline map, timeline, photos. Owner can resend
(new SMS) or revoke (token invalidated).

## 8. Offline and GPS

- **Cache:** on launch, on foreground, and every 15 min while open: visits for
  today ±2 days with clients, pets, services, and instructions → persisted TanStack
  cache. Access codes are never cached; if offline, the last reveal for that client
  within `access_grace_hours` is shown from secure storage, else an explicit "No
  signal — call owner" action.
- **Outbox:** SQLite table `outbox(id, kind, payload, created_at, attempts, state)`.
  Start, events, photos, finish, and track segments are appended locally first,
  then uploaded in order by a sync worker (foreground + background fetch). All
  server writes are idempotent by `client_uuid`.
- **GPS:** background task samples every 5 s or 10 m (`accuracy: High`), writes to
  SQLite `track_points`; every 60 s points roll into a `visit_tracks` segment in the
  outbox. Distance is recomputed server-side from all segments on each ingest (safe
  under duplicates); the app shows a local running estimate.
- **Recovery:** on launch, if a visit is `in_progress` locally, the task is
  re-registered if missing and the active screen is restored.
- **Report delivery:** `notifications` rows retry with backoff (1, 5, 15, 60 min, up
  to 6 attempts); failures surface as a "Report not sent" badge on the owner's
  visit and a Today strip count.

## 9. UI

- **Direction B, Bold & Warm:** cream `#FFF4E6` surface, primary `#E8642C`
  (overridable per business), ink `#2B1D12`, 24 px card radius, pill buttons,
  heavy headings. Tokens in `src/ui/tokens.ts`; business accent applied via theme
  provider.
- **Field mode:** the active-visit screen uses a dark map and dark sheet with
  orange accents by default while recording; setting `walkTheme: auto | warm |
  dark` in the walker's profile.
- **Owner tabs:** Today · Schedule · Clients · Team · Settings. **Walker tabs:**
  Today · Schedule · Clients. Owner has a one-tap "My visits" toggle to the walker
  Today view.
- **Today (owner):** Needs-attention strip (declined, unassigned, unsent reports),
  then the day's visits grouped by walker. **Today (walker):** next visit hero card
  with Start, then the day's list.
- **Web ≥ 900 px:** tabs become a left rail; Schedule is a week grid with drag to
  reassign; Clients is list + detail.

## 10. Testing and verification

- **Unit (jest-expo):** RRULE expansion in business tz across a DST boundary;
  distance from segments with duplicates; outbox ordering and idempotency; status
  machine transitions.
- **Database (pgTAP):** walker cannot read another walker's visits or any pricing;
  `reveal_access` fails unless caller is assigned and visit is `in_progress`;
  revoked tokens return 404; cross-business reads return zero rows.
- **E2E (Maestro, iOS simulator + Android emulator):** sign up → business → client →
  schedule → start → finish → report renders.
- **Judging script (real devices — owner's iPhone, contractor's phone, a client
  phone):**
  1. Create business; invite contractor; contractor accepts on second phone.
  2. Add client with codes and pet with vaccine PDF; schedule a walk for the
     contractor; contractor sees and accepts; owner sees acceptance.
  3. Contractor taps Reveal codes before Start → denied; after Start → shown; owner
     sees an audit entry.
  4. Airplane mode on. Start visit; walk 10 min; add pee, photo, note; force-kill the
     app; relaunch; finish. Airplane mode off → everything syncs; report shows full
     route and events. **Checkpoint 1 — no further feature work until this passes.**
  5. Client phone receives "started" and "finished" texts; report link opens with
     branding, map, photos; no address, codes, or price visible.
  6. Owner on a laptop reschedules tomorrow's visits in the week grid; walker sees
     the change.

## 11. Build order and checkpoints

1. Repo, Expo app, design tokens, Supabase project, CI (lint, tsc, jest, pgTAP).
2. **GPS + offline spike** on a physical device: background task, SQLite buffer,
   kill/relaunch recovery. Checkpoint 1 (judging step 4 in isolation).
3. Auth, business creation, memberships, invitations, RLS and pgTAP tests.
4. Clients, pets, documents, access codes with `reveal_access`.
5. Services, availability, time off, visits, series, assignment, accept/decline.
6. Visit execution UI wired to the outbox and GPS; events, photos, notes.
7. Reports, `report-public`, SMS with retries, owner resend/revoke.
8. Expo Web layout; owner week grid.
9. Full judging script on real devices; fix; EAS builds to TestFlight and internal
   Play track for Alexandra and the contractor.

## 12. Decisions and rationale

- **Expo over native/Flutter:** one TypeScript codebase for iOS, Android, and web;
  background location, camera, SQLite, and push are maintained modules; EAS
  handles signing and distribution.
- **Supabase-direct + outbox (Approach A) over a sync engine:** signal loss is rare;
  the required offline surface is the day's data and visit writes; one backend to
  debug; PowerSync can be added later on the same schema if needed.
- **Codes gated in the database, not the UI:** her explicit requirement; the UI
  cannot leak what it cannot query.
- **SMS + web report instead of client app in slice 1:** clients need nothing
  installed; the report page is the seed of the slice-3 client experience.
- **Visits vs series:** recurring care expands to concrete visits so assignment,
  execution, and (later) invoicing operate on one unit.
- **Product-model hooks now:** `plan`, `is_platform_admin`, multi-business
  memberships, and tenant-scoped storage paths cost little now and are painful
  later.

## 13. Open items (not blocking slice 1)

- Trademark (USPTO) and store-name checks for "Stridetail"; register
  stridetail.com and stridetail.app.
- Twilio A2P 10DLC registration for US SMS (takes days; start early).
- Google Maps API key for Android.
- Apple Developer and Google Play accounts under the platform entity.
