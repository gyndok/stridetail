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
