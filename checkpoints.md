# Checkpoints

Evidence for spec checkpoints. Screenshots go under `docs/evidence/`.

## Checkpoint 1 — background GPS survives airplane mode + force-kill (Plan 1, Task 5)

**Status: PENDING — requires physical iPhone dev build.** Code, tests, typecheck and lint are
done (commit `feat(gps): background location task, controller, spike screen`). No device was
connected in the session that implemented Task 5, so the on-device run has not been performed.

### Prerequisites
1. Apple Developer account signed in to EAS (`bunx eas-cli login`), or Xcode with a signing team.
2. If EAS is not configured: `bunx eas-cli init` then `bunx eas-cli build:configure`.
3. Build a development client (expo-dev-client is installed; Expo Go cannot run background
   location with custom Info.plist entries):
   - `bunx eas-cli build --profile development --platform ios`, or
   - `bunx expo run:ios --device` (local Xcode build).
4. Install on the iPhone, start Metro with `bun run start`, open the app.

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
| Date | |
| Device model | |
| iOS version | |
| Build type (EAS dev / local Xcode) | |
| Points before force-kill | |
| Points after relaunch | |
| Final points | |
| Final meters | |
| Outbox items at Finish | |
| Result (PASS / FAIL) | |

### If it fails
Fix before any further task (spec section 11). Common causes: `UIBackgroundModes` missing
`location` (verify with `bunx expo config --type introspect`), `src/lib/gps/task.ts` not
imported first in `app/_layout.tsx`, location permission not set to "Always".
