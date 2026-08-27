# Checkpoints

Evidence for spec checkpoints. Screenshots go under `docs/evidence/`.

## Checkpoint 1 — background GPS survives airplane mode + force-kill (Plan 1, Task 5)

**Status: PASS (2026-08-23, with caveats).** Run on the sponsor's iPhone using the `preview`
EAS build `91abd85f`, airplane mode on, reached via `stridetail://dev/gps-spike` from a Note.
Recording survived a force-kill: 37 pts / 494 m before kill → relaunch showed **Recording**
with 40 pts / 524 m → Finish → Idle, 5 outbox items. Caveats: walk was ~5 min, not the full
10; Wi-Fi radio stayed on under airplane mode (no data). See DEVIATIONS.md.

### Prerequisites
1. Apple Developer account signed in to EAS (`bunx eas-cli login`), or Xcode with a signing team.
2. If EAS is not configured: `bunx eas-cli init` then `bunx eas-cli build:configure`.
3. Build a development client (expo-dev-client is installed; Expo Go cannot run background
   location with custom Info.plist entries):
   - `bunx eas-cli build --profile development --platform ios`, or
   - `bunx expo run:ios --device` (local Xcode build).
4. Install on the iPhone, start Metro with `bun run start`, open the app.

**Use the `preview` profile for the actual checkpoint run.** A `development` build loads JS from
Metro, so after a force-kill in airplane mode it cannot reload. `preview` embeds the bundle.
Reach the spike screen with the deep link `stridetail://dev/gps-spike` (type it in Safari or
tap it from a Note — works offline).

Builds done 2026-08-23 (EAS, team `geffreykleins-team`, device UDID `00008140-001C71C021BB001C`):
- development: `fb918661-2f2c-4996-878b-67db28ab9c02`
- preview: `91abd85f-e06a-461c-8036-9296bb49dfff`

### Procedure
1. Navigate to `stridetail://dev/gps-spike` (or type `/dev/gps-spike` in the dev menu).
2. Airplane mode ON (Wi-Fi and cellular off).
3. Tap **Start**. Grant "While Using", then choose **Always** when prompted.
4. Walk at least 10 minutes; keep the screen off for at least 5 of them.
5. Force-kill the app (swipe away in the app switcher). Keep walking for 2 more minutes.
6. Relaunch the app and return to `/dev/gps-spike`.
   - Expected: status reads **Recording**; point count is greater than zero and continues to
     climb from the pre-kill value (not reset).
7. Tap **Finish**.
   - Expected: outbox items >= roughly (walk minutes / 1) (one `visit.track` segment per
     minute plus the final roll); points > 100; meters plausible for the walk.
8. Airplane mode OFF.

### Evidence to capture
- Screenshot of the spike screen after step 6 (Recording, point count) -> `docs/evidence/cp1-after-relaunch.png`
- Screenshot after step 7 (Idle, final points / meters / outbox) -> `docs/evidence/cp1-finished.png`
- Fill in the table below.

| Field | Value |
| --- | --- |
| Date | 2026-08-23, ~13:10–13:16 CDT |
| Device model | iPhone, UDID `00008140-001C71C021BB001C` (model/iOS to fill in) |
| iOS version | (fill in) |
| Build type (EAS dev / local Xcode) | EAS `preview` build `91abd85f-e06a-461c-8036-9296bb49dfff` |
| Points before force-kill | 37 (494 m, 4 outbox) |
| Points after relaunch | 40 (524 m, 4 outbox, status Recording) |
| Final points | 40 |
| Final meters | 524 |
| Outbox items at Finish | 5 |
| Result (PASS / FAIL) | PASS — short walk (~5 min) and Wi-Fi radio on; kill/relaunch recovery verified |

Screenshots were captured on the phone and shared in the working session; copy them to
`docs/evidence/cp1-before-kill.png`, `cp1-after-relaunch.png`, `cp1-finished.png`.

### If it fails
Fix before any further task (spec section 11). Common causes: `UIBackgroundModes` missing
`location` (verify with `bunx expo config --type introspect`), `src/lib/gps/task.ts` not
imported first in `app/_layout.tsx`, location permission not set to "Always".

## Checkpoint 2 — end-to-end tenancy on two devices (after Plan 1, before Plan 2)

**Status: PENDING.** Sign-up → create business → invite → accept → role routing is covered by
21 jest tests, 17 pgTAP assertions and a REST-level run of `invite-accept`, but no human has
driven it on a device. Deep links and auth redirects are exactly what passes in tests and
breaks on phones.

### Prerequisites
- Two devices: Device A (owner — sponsor's iPhone) and Device B (walker — Alexandra's iPhone
  or the iOS simulator). Register B with `bunx eas-cli device:create` (Website flow) if it is a
  phone, then build `bunx eas-cli build --profile preview --platform ios`. For the simulator
  use `bunx expo run:ios` with Metro.
- A reachable Supabase. Local stack works if both devices are on the mini's Tailscale/LAN and
  `EXPO_PUBLIC_SUPABASE_URL` points at the mini's address (not 127.0.0.1) **at build time**.
  **Done 2026-08-23:** hosted dev project = the repurposed "Dog Walker" Supabase project
  (ref `vrxoswukuiaerhwammlh`, us-west-2); old PawPath schema dropped, both migrations applied
  via the Supabase MCP (`apply_migration`), `invite-accept` deployed (verify_jwt on). URL +
  anon key live in `eas.json` `preview`/`production` env. Local `.env` still targets the
  Docker stack for tests.
  **Before the run:** in the Supabase dashboard → Authentication → Providers → Email, turn
  **Confirm email OFF** for this dev project (hosted default is ON; the app's sign-up expects an
  immediate session, as with the local stack).

### Procedure
1. Device A: open app → Sign up (email + password) → lands on "Create your business".
   Expected: time zone pre-filled from the device, not blank, not UTC.
2. Create "Paw & Whisker Pet Care" → owner tabs appear (Today · Schedule · Clients · Team ·
   Settings). Settings shows the business name and a Sign out.
3. Team → Invite → enter Device B's email (or phone) → share sheet → send the link to B
   (Messages/AirDrop). Note the token.
4. Device B (signed out, app installed): tap the link. Expected: opens the app at
   `/invite/<token>`, prompts sign-up, and after sign-up lands in **walker** tabs
   (Today · Schedule · Clients) — not the owner tabs.
5. Device A: Team now lists B as an active walker with display name.
6. Device B: Settings/sign out, relaunch → back to sign-in, not a blank screen.
7. Device B: sign in again → walker tabs restored (session persisted via SecureStore).
8. Device A: kill and relaunch → still signed in, still owner tabs.

### Evidence
Screenshots → `docs/evidence/cp2-owner-tabs.png`, `cp2-walker-tabs.png`, `cp2-team-list.png`.

| Field | Value |
| --- | --- |
| Date | 2026-08-23 |
| Device A / B | A: sponsor's iPhone (EAS preview `fb8619bc`) · B: iPhone 17 Pro simulator (local dev build, Xcode 26.3) |
| Build (EAS id or local) | A: `fb8619bc-0bb6-46af-a5ca-8ccf2b8b1f02` · B: `expo run:ios` |
| Supabase (local via Tailscale / hosted project ref) | hosted `vrxoswukuiaerhwammlh` |
| Steps passed | 1–2 on Device A (sign-up, business created, tz America/Chicago auto-detected, owner tabs) — 2026-08-23 build `afae2a77`; found iOS icon still Expo's (`ios.icon` template override) → fixed, rebuilt |
| Result (PASS / FAIL + notes) | Steps 1–5 PASS. 1–2: sign-up + business on Device A (tz America/Chicago auto). 3: invite created + share sheet. 4: deep link on B routed signed-out user to sign-up → "You're invited" → Accept → **walker tabs** (evidence `docs/evidence/cp2-walker-tabs.png`); DB shows both memberships active, token cleared. 5 PASS: after force-quit + relaunch on Device A, Team lists "Simulated · walker · active". 8 PASS: relaunch kept the owner signed in (SecureStore session). 6–7 PASS (after shared-SettingsScreen fix): walker signed out from new Settings tab → sign-in screen → signed back in → walker tabs restored. Overall: **PASS, all steps.** |

**Follow-up resolved 2026-08-23:** walker tab shell now has a Settings tab (shared `SettingsScreen`); sign-out/sign-in verified on the simulator.

## Checkpoint 3 — two-device scheduling + reveal denied before start (Plan 3)

**Status: PASS (2026-08-23 evening).** Scheduling flows are unit/pgTAP-verified; this proves them on real
devices and covers judging step 2 plus the first half of step 3.

### Procedure
1. Device A (owner, preview build `c76a4186` or later): Schedule → Add — pick client
   (Karla Klein), service (Walk), pets, tomorrow 09:00, walker = Simulated (or Alexandra
   once onboarded) → Create. Expect status "offered" and the walker's flags visible in
   the picker.
2. Device B (walker; simulator dev build works): Today shows the offer → Accept.
3. Device A: Today/Schedule shows the visit as accepted with the walker's name;
   needs-attention stays clear.
4. Device B: open the visit's client → 🔒 Access codes → Reveal → **expect DENIAL**
   ("only available while the visit is in progress"). Owner's audit log gains NO
   access.reveal row.
5. Bonus: Device B declines a second offered visit with a reason → Device A sees it in
   the needs-attention strip with the reason.

### Evidence
Screenshots → docs/evidence/cp3-*.png; fill the table.

| Field | Value |
| --- | --- |
| Date / devices / builds | 2026-08-23 ~21:15–21:35 CDT · A: sponsor's iPhone (EAS preview `c76a4186`) · B: iPhone 17 Pro simulator (local dev build vs hosted backend) |
| Steps passed | 1 (visit created 9:00 AM CDT, price $25.00 stamped; initially unassigned → appeared in needs-attention) · 2 (owner offered to Simulated from visit detail — audit `visit.offer` 21:18) · walker Today showed the offer card (evidence `docs/evidence/cp3-walker-offer.png`) → Accept → audit `visit.accept` 21:30, DB status `accepted` walker Simulated · 4 (reveal denial: `reveal_access` with the walker's JWT while `accepted` → "access codes are only available while the visit is in progress"; `access.reveal` audit rows = 0) |
| Result | PASS. Step 3 (owner sees acceptance on device A) confirmed via DB + refetch-on-focus fix; sponsor to eyeball on phone. Step 5 (decline round-trip on devices) not run — covered by pgTAP + unit matrix. Walker-side reveal BUTTON ships with Plan 4's execution screen; the denial above is the same RPC the button will call. |


## Checkpoint 4 — full field run (Plan 4)

**Simulator half: PASS (2026-08-24 evening, hosted backend).** Walker (iPhone 17 Pro sim,
dev build) accepted an offered walk on Today → visit detail (pet photo, reactivity warning,
locked codes row) → Start (location prompts; the "GPS not recording — visit still started"
fallback fired when Always was initially denied) → force-kill + relaunch → active screen
recovered via deep link, timer running from started_at → Pee + Poop events (per-pet ticker)
→ **Reveal codes SHOWN in the field** (door 2427 / alarm 72 / notes, "Access is logged in
the audit trail"; exactly 1 access.reveal audit row) → private owner note → Finish confirm.
DB after: visit completed, events arrived/started/pee/poop/finished all synced via the
outbox, report row + token, started notifications drained to skipped_no_provider by the live
cron, finished pair queued. **Report page rendered in a browser**: business-branded header,
Olivia · Walk, 6 min, full timeline — no address/codes/price/walker/private-note anywhere.
Evidence: docs/evidence/cp4-visit-detail.png, cp4-reveal-in-field.png.

**Bugs found and fixed in this run:** (1) an in_progress visit vanished from walker Today
(partition filtered to accepted only) — now included; (2) the local recovery marker was
written only after the permission gate, so a denied "Always" prompt + force-kill lost the
resume path — marker now written first.

**Device half: PASS (2026-08-24 ~21:37–21:42 CDT, sponsor's iPhone, build `5b0c652a`).**
Owner used the new "My visits" toggle (built mid-checkpoint after the sponsor found owners
had no path to Start their own visits — spec §9 gap) → started the walk → **real GPS route
recorded: 3 segments, 19 points, 284.7 m** computed server-side by ingest-track (the piece
the simulator could not prove) → 9 events synced incl. a **photo (storage object verified)**,
a note, and ate/drank from the More row → finish with private note → report token live →
owner report card (Share link / Text the client / Resend SMS / Revoke link) exercised:
report page opened, then revoked. SMS line correctly reads "not sent — SMS pending setup".
Airplane-mode/force-kill portion of this run not explicitly confirmed by the sponsor;
offline force-kill survival was separately proven in Checkpoint 1 and the sim relaunch
recovery in this checkpoint's sim half. **Checkpoint 4: PASS.**

**Polish note (sponsor, 2026-08-24):** the active-walk screen needs visual polish — queued
for the Round 1 mockup pass with Alexandra.


## Checkpoint 6 — invoice a real walk end-to-end (Plans 5+6; spec §7 last bullet)

**Status: PENDING.** All of Plan 6 is deployed to hosted (migrations 0003–0004 of
2026-08-25 on top of Plan 5's 0001–0002; `report-public` and `invoice-public` redeployed
with the combined report→invoice hand-off and the Venmo block) and the whole path —
auto-invoice on finish, payout statement lifecycle, resend, uninvoiced snapshot — was
SQL/HTTPS smoke-tested on hosted with full cleanup. This run proves it on the sponsor's
device with real completed walks. **This checkpoint runs on the new EAS BUILD** (Plan 6
release build — react-native-svg icons are a native module; an OTA alone cannot carry
them).

### Procedure
1. Device (owner, the Plan 6 preview BUILD): Settings → Billing settings → set the
   **Venmo handle** and **Auto-invoice = per visit**. Both save and read back.
2. Finish a real walk (walker flow start → finish). Expect the client gets **ONE email**
   (the visit report; the invoice rides the report page, not a second email). The report
   page shows the walk (map/timeline) **plus an "Invoice & payment" section** linking the
   invoice; the invoice page shows the line item at the booked price, a **tip chip** row,
   and a **"Pay with Venmo" button that opens the Venmo app prefilled** (handle, amount
   incl. selected tip, INV-XXXX note).
3. Owner: Billing → the auto-created invoice is already "sent" → **Mark paid is one tap**
   (full balance, Venmo, today). Public page re-open → paid stamp, balance $0.00.
4. Payouts: owner creates a payout statement for the **Simulated walker** over a period
   containing its completed visits → finalize. Sim walker (simulator, walker account):
   **Earnings shows the finalized statement** (items + total); everywhere else billing
   stays invisible — no Billing tab, no invoice/deposit/payment data on Today/visit
   screens.
5. Icons: tab bars and event/lock/billing buttons show the new SVG icon set (proof the
   native module shipped in this build).

### Evidence
Sponsor phone screenshots reviewed in-session 2026-08-26 (copies → docs/evidence/cp6-*.png
when convenient).

| Field | Value |
| --- | --- |
| Date / devices / builds | 2026-08-26 evening, sponsor iPhone (owner+walker), Plan 6 preview build |
| Step 1: billing settings | PASS — venmo_handle `Geff-Klein` + auto_invoice `per_visit` saved (DB-verified) |
| Step 2: real walk → auto-invoice | PASS with one finding — 6-min 0.20-mi walk (Olivia), report page shows route/timeline/photo + "Invoice & payment →"; INV-0004 auto-created "sent" at the $25 booked price; Venmo prefilled $35 ($25+$10 tip, INV-0004 note). FINDING: TWO emails queued at finish (`visit_finished` + `invoice_ready`) vs the spec's one — fixed same evening, migration `20260826000001_one_email_per_walk` (local+hosted, pgTAP flipped, 552 pass). Not re-walked; next real walk should produce one finish email. |
| Step 3: Mark paid | PASS — INV-0003 and INV-0004 one-tap paid; public page shows PAID/$0.00. Polish item logged: tip overpayment displays as "Paid −$5.00" (should read "Paid · incl. tip") |
| Step 4: payouts + walker visibility | PASS — sponsor finalized a statement for the Simulated walker (Aug 24–29, $25: Walk $0.00 + "Gaz bonus" adjustment $25 — per-visit payout amounts default $0 until a payout model exists, Alexandra's open question); sim walker's Earnings (Settings → Earnings) shows the statement with items + total, "Awaiting payment" (docs/evidence/cp6-walker-earnings.png); walker tab bar has NO Billing tab and no invoice data anywhere |
| Step 5: SVG icons in build | PASS — tab bar shows the new icon set in all phone screenshots |
| Result | **PASS** (note: sim run used the stale dev-client build via Metro with hosted env — tab icons showed placeholders there because that binary predates react-native-svg; the real icons are proven by the sponsor phone's Plan 6 build) |

## Checkpoint 7 — the web is live (Plan 7)

**When:** after both Vercel projects deploy and DNS moves off Squarespace parking.
**Purpose:** prove a client with NOTHING installed can use their email link on the real
domain, and that the public marketing surface exists for Google.

### Already verified from the desk (2026-08-26)
- DNS: stridetail.app and stridetail.com resolve to Vercel (216.150.1.1).
- `https://stridetail.app/invoice/<INV-0001 token>` renders the real invoice live
  (items, balance, tip chips, Pay-with-Venmo button) — browser screenshot taken.
- `/invoice/*` and `/report/*` serve `X-Robots-Tag: noindex`; robots.txt disallows both.
- stridetail.com landing, /privacy, /terms, /p/paw-and-whisker all 200 with brand content.

### Procedure (phone, app NOT installed — use Alexandra's or airplane-mode-reinstall trick)
1. Open the latest visit-report or invoice email → tap the link. Expect the branded page
   to load on stridetail.app in Safari — no store redirect, no parking page.
2. On the invoice page tap a tip chip → **Pay with Venmo** → Venmo app (or web) opens
   prefilled with handle, amount incl. tip, and the INV-XXXX note.
3. Load stridetail.com on the phone → landing renders fast, screenshots visible,
   privacy/terms reachable from the footer.
4. Paste `https://stridetail.com/p/paw-and-whisker` into Google's Rich Results test
   (search.google.com/test/rich-results) → LocalBusiness detected, no errors.

### Evidence
Sponsor phone screenshots reviewed in-session 2026-08-26 (save copies to
docs/evidence/cp7-*.png when convenient).

| Field | Value |
| --- | --- |
| Date / phone | 2026-08-26, sponsor iPhone, Safari via Messages link (no app context) |
| Step 1: link → live page | PASS — INV-0002 (PAID state: badge, $0.00 balance, Venmo hidden) and INV-0003 (unpaid: tip chips, "Pay $30.00 with Venmo", updated "Venmo preferred" instructions) both rendered on stridetail.app |
| Step 2: Venmo opens prefilled | PASS — Venmo app opened from Safari: recipient Geff Klein, $40 ($30 + $10 tip chip), note "INV-0003" all prefilled (sponsor screenshot) |
| Step 3: stridetail.com on phone | desk-verified 200s; phone load not separately captured |
| Step 4: Rich Results test | PASS — "Local businesses: 1 valid item" + Organization valid; non-critical issues = intentionally omitted optional fields (address/phone/prices withheld pending Alexandra) |
| Result | **PASS** |

## Checkpoint 8 — client portal end-to-end on a real phone (Plan 8)

**Status: PENDING.** Everything below the phone script is already proven on hosted:
Plan 8 migrations 0002–0005 applied via MCP, `send-email` v10 carries `client_invite`
+ the booking-request templates, advisors clean (no new findings), and the whole
invite → claim → client-scoped reads (price column denied 42501) → pets/access-code
self-service → booking request → approve loop passed a SQL role-impersonation smoke
with SMOKE- fixtures fully cleaned (DEVIATIONS.md, Plan 8 Task 8). Portal pages ship
noindex (vercel.json + robots.txt) with this deploy. This run proves the same loop
with real humans, a real inbox, and Safari — no app on the client's phone.

### Already verified from the desk (2026-08-26)
- `https://stridetail.app/portal-login` → 200 with the email/code sign-in content.
- Hosted smoke: all asserts passed; cleanup byte-identical to the pre-smoke baseline.

### Procedure (owner = sponsor's iPhone with the app; "Karla's phone" = Safari only, no app)
1. Owner (app): open Karla Klein's client screen → **Invite to portal**. Expect the
   invite email to land in Karla's inbox (from stridetail.app via Resend).
2. Karla's phone (Safari): open the invite email → tap the portal link →
   `stridetail.app/portal-login` → enter her email → **email OTP code** arrives →
   enter code → lands on the portal dashboard.
3. Dashboard shows **tonight's visit** and the recent **report card**; open the
   report → the walk **map** renders.
4. Invoices tab: **INV-0001..INV-0004 listed with correct states** (paid ones show
   PAID/$0.00; any open one shows balance + tip chips + Pay with Venmo).
5. Pets: edit a pet's **feeding note** → saves and reads back.
6. Access codes: **set a lockbox code** → saves (audited server-side); reveal shows
   it back.
7. Requests: **request a walk for tomorrow** (service, window, pet, note) → submitted,
   listed as pending. Owner gets the `booking_request_received` email.
8. Owner phone: **Requests strip appears on Today** → open → **Approve** (two taps).
   Karla gets the `booking_request_approved` email with the scheduled time.
9. Walker (sim or Alexandra): the approved visit appears as a **new visit offer**
   after the owner assigns/offers it (approve creates it unassigned at the requested
   time; offer from the visit screen as usual).

### Evidence
Sponsor phone screenshots → docs/evidence/cp8-*.png; fill the table.

| Field | Value |
| --- | --- |
| Date / phones / build | 2026-08-27, sponsor solo (Karla away) — enrolled as demo client **Marcus Delgado** (`gyndok+demo1@gmail.com`, a gmail plus-alias to the sponsor's own inbox); owner side on the sponsor's iPhone app, client side in the browser |
| Step 1: invite email lands | PASS — `client_invite` from reports@stridetail.app to inbox, correct portal link. (Detour: the sponsor's browser autocompleted to the OLD pawpath-pro.vercel.app frontend, still wired to the repurposed Supabase project — auth logs' referer exposed it; sponsor DELETED that Vercel project. Also: OTP codes initially landed in gmail junk — SPF/DKIM/DMARC all pass, pure new-sender reputation; marked not-spam.) |
| Step 2: OTP login | PASS — 8-digit code entered at stridetail.app/portal-login; `client_users` link created via 'invite' at 14:25 (DB-verified) |
| Step 3–4: dashboard, reports, invoices | PASS — month of Marcus's demo visits/report cards and 13 invoices with correct paid/unpaid states |
| Step 5: pet edits | PASS — plus pet PHOTOS uploaded to both dogs (client storage policy proven live) |
| Step 6: lockbox codes | PASS — "as Marcus I was able to make changes to the lock codes" |
| Step 7: walk request | PASS after a live fix — date/time fields were FROZEN on web (community datetimepicker has no web impl; fixed same session, DateField.web/TimeField.web HTML inputs, `94b7235`); second request Fri Aug 28 11–1 submitted with edited times |
| Step 8: approve from owner side | PASS — Requests card (client, service, window, pets, note, optional walker chips) → Approve. FINDING logged: the card shows the client's window but offers no start-time choice within it (visit pins to window start) — improvement queued |
| Step 9: walker offer | Covered by design (approve → unassigned/offered per picker); not separately exercised |
| Result (PASS / FAIL) | **PASS** — plus two portal improvements shipped from findings same-day: Settings tab (passwordless explainer + sign out; passwordless-by-code CONFIRMED as final design by sponsor) and web date/time inputs |
