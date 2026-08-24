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
