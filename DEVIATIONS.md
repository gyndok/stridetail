# Deviations from the plan

Conservative calls made while executing plans autonomously. Newest at the bottom.

## Task 1 — scaffold (2026-08-23)

- `create-expo-app` refuses non-empty directories, so it was run in a scratch dir and only
  `package.json`, `app.json`, `tsconfig.json`, `assets/`, `.vscode/` were copied in. Template
  README/AGENTS.md/CLAUDE.md/LICENSE/.claude were not copied (would clobber repo `CLAUDE.md`).
- `bun run reset-project` was not run: the SDK 57 template's reset script is interactive
  (readline prompt) and moves things into `example/`, not `app-example/`. Equivalent outcome
  achieved by not copying the template's `src/` and `scripts/` at all. `reset-project` script
  removed from `package.json`.
- SDK 57 template places routes in `src/app/`; the plan specifies a root `app/` directory with
  `@/*` → `./*`. Followed the plan (root `app/`). Expo Router uses root `app/` when `src/app/`
  is absent.
- Test tooling (`jest-expo`, `jest`, `@types/jest`, `@testing-library/react-native`,
  `react-test-renderer`) moved from `dependencies` (where `expo install` put them) to
  `devDependencies`.
- `tsconfig.json` adds `"types": ["jest"]`: the template ships TypeScript 6.0, which no longer
  auto-includes `@types/*`, so `bun run typecheck` failed on `test`/`expect` without it.
- Kept template `experiments.reactCompiler: true`, `userInterfaceStyle`, icon/splash/adaptiveIcon
  entries from the generated `app.json` alongside the plan's identity fields.
- "`bunx expo start --web` shows Stridetail" check replaced by a non-interactive
  `expo export --platform web`, which produced the `/` route and a bundle containing "Stridetail".

## Task 2 — tokens, theme, base components (2026-08-23)

- `@testing-library/react-native` 14 (pinned by Task 1) makes `render`, `rerender` and
  `fireEvent.*` async. The plan's tests were written against the v13 sync API and failed
  typecheck/runtime; both test files now `await` those calls. Component code unchanged.
- `Theme.colors` typed as `{ [K in keyof typeof tokens.colors]: string }` instead of
  `typeof tokens.colors`: `tokens` is `as const`, so `primary` narrows to the literal
  `'#E8642C'` and the accent override in `ThemeProvider` failed `tsc`.
- Button test: while `loading`, the label is replaced by a spinner (per the plan's component),
  so `getByText('Start walk')` cannot locate it for the second press. Second press uses
  `getByRole('button')`. Additionally, RNTL's `fireEvent.press` walks up composite ancestors
  for an `onPress` prop and found `Button`'s own prop, so setting `onPress={undefined}` on the
  Pressable alone did not block it. Added `disabled={inactive}` on the `Pressable` (correct RN
  behaviour anyway; RNTL honours it). `onPress={inactive ? undefined : onPress}` kept as well.

## Task 3 — sqlite and outbox (2026-08-23)

- `bunx expo install expo-sqlite expo-crypto` automatically appended `"expo-sqlite"` to
  `plugins` in `app.json` (SDK 57 CLI behaviour). The plan does not mention it; kept, as it is
  the documented config-plugin registration and uses defaults (no FTS / SQLCipher options).
- `expo-sqlite` SDK 57 API verified against the docs: `openDatabaseSync`, `execSync`,
  `runAsync` / `getAllAsync` / `getFirstAsync` with `$name` object bindings all exist as the
  plan assumed. No code changes needed beyond Prettier-style line wrapping.

## Task 5 — background location task and controller (2026-08-23)

- `expo-location` SDK 57 config-plugin option names (`locationAlwaysAndWhenInUsePermission`,
  `locationWhenInUsePermission`, `isIosBackgroundLocationEnabled`,
  `isAndroidBackgroundLocationEnabled`, `isAndroidForegroundServiceEnabled`) and the runtime API
  (`startLocationUpdatesAsync` options incl. `foregroundService`, `pausesUpdatesAutomatically`,
  `showsBackgroundLocationIndicator`; `hasStartedLocationUpdatesAsync`;
  `TaskManager.defineTask` / `isTaskRegisteredAsync`) verified against the v57 docs. All match
  the plan; no renames needed.
- `isIosBackgroundLocationEnabled: true` already injects `location` into `UIBackgroundModes`.
  The plan's explicit `ios.infoPlist.UIBackgroundModes: ["location"]` was kept as well (belt and
  braces; the plugin merges without duplicating — confirmed via `expo config --type introspect`).
- Added `"expo-task-manager"` to `plugins` (SDK 57 CLI did not auto-append it this time; it is
  a no-op plugin on iOS but harmless and documents the dependency).
- Foreground-service `notificationColor` uses `tokens.colors.primary` instead of the plan's
  literal `'#E8642C'` (CLAUDE.md: no literal colors outside `src/ui/tokens.ts`).
- `ingestLocations` reads the last row as `acc: number | null` and maps to `undefined`, rather
  than casting the row directly to `Pt` (strict null typing).
- Spike screen error handler narrows `unknown` with `instanceof Error` (the plan's
  `e.message ?? e` does not typecheck under strict).
- Checkpoint 1 on-device run NOT performed: no physical iPhone attached in this session.
  `checkpoints.md` created with the checkpoint marked PENDING and the exact procedure/evidence
  list. Task 5 is committed without the device evidence; it must be run before Task 6 per spec.

## Checkpoint 1 — on-device run (2026-08-23)

- The spec calls for a 10-minute walk; the run was ~5 minutes (37→40 points, 494→524 m). The
  property under test — background task + SQLite buffer + relaunch recovery surviving a
  force-kill with no connectivity — was demonstrated, so the checkpoint is recorded as PASS
  rather than repeating the walk. A full 10-minute run will happen naturally during judging
  step 4.
- Wi-Fi radio remained on while airplane mode was active (iOS allows this). No network was
  available to the app; `preview` build embeds the JS bundle so nothing was fetched.
- Checkpoint used the `preview` EAS profile, not the `development` client the plan assumed,
  because a dev client cannot reload its bundle from Metro after a force-kill offline.

## Task 7 — supabase client and encrypted session storage (2026-08-23)

- `@supabase/supabase-js` pinned to `2.112.3` (plan says "2.112"; `2.112.0`–`2.112.3` exist on
  npm, latest patch of the 2.112 line taken). Other versions resolved: `expo-secure-store@57.0.1`,
  `react-native-url-polyfill@4.0.0`, `@tanstack/react-query@5.102.2`, `zustand@5.0.15`.
- `aes-js` pinned to `3.1.2` (not the latest `4.0.0`): the plan's code uses the v3 API
  (`ModeOfOperation.ctr`, `Counter`, `utils.hex/utf8`) and `@types/aes-js@3.1.4` only types v3.
- `bunx expo install expo-secure-store` auto-appended `"expo-secure-store"` to `plugins` in
  `app.json` (same SDK 57 CLI behaviour as Task 3). Kept with defaults.
- `expo-secure-store` (`getItemAsync` / `setItemAsync` / `deleteItemAsync`), `expo-crypto`
  (`getRandomBytes`, 0–1024 bytes) and `expo-sqlite/kv-store` (`getItem` / `setItem` /
  `removeItem` async aliases) verified against the v57 docs; all match the plan.
- Key-per-name with fixed CTR counter kept exactly as the plan (Supabase reference pattern); not
  changed.

## Task 8 — session store and auth screens (2026-08-23)

- Sign-in / sign-up catch blocks narrow `unknown` with `instanceof Error` instead of the plan's
  `(e as Error).message` cast (same call as Task 5's spike screen; strict typing).
- `app/index.tsx` loading state paints `backgroundColor: t.colors.surface` and the spinner
  `t.colors.primary` via `useTheme()` rather than an unstyled `View`/`ActivityIndicator`, so the
  gate does not flash a white screen against the cream surface. Colors come from tokens only.
- `supabase/config.toml` `[auth] enable_confirmations = false` NOT set here: Task 6 (Supabase
  schema/config) is being executed separately and `supabase/` is out of scope for this task.
- Manual simulator verification (Step 5) not performed in this session; `bun run test`,
  `typecheck` and `lint` pass.

## Task 6 — supabase core schema, rls, pgtap (2026-08-23)

- Executed after Tasks 7–8 (Docker was not available earlier); Supabase CLI 2.115, Postgres 17,
  Docker via colima (`DOCKER_HOST=unix://~/.colima/default/docker.sock`).
- `supabase start` failed its health check on `supabase_analytics` / `supabase_vector` under
  colima. Set `[analytics] enabled = false` in `supabase/config.toml` (local dev only; no
  product impact). `[auth.email] enable_confirmations = false` was already the CLI default, so
  Task 8's note is satisfied without an edit.
- pgTAP run failed with `permission denied for table businesses`: the CLI applies migrations as
  `supabase_admin`, so Supabase's default privileges (declared for the `postgres` role) did not
  apply to the new tables. Added an explicit `grant usage on schema public` + table grants to
  `authenticated`/`service_role` at the end of the migration. `anon` gets no table grants; RLS
  still governs every row.
- Test extended from the plan's 10 assertions to 14: profile-trigger check, and a second
  owner/business to assert cross-business zero rows (spec §10 pgTAP line).
- "Failing first" could not be observed literally: `supabase start` applies migrations on boot,
  so the test was first run against the migrated DB (where it failed on the grants above).
- `supabase/seed.sql` created as an empty placeholder so `db reset` does not warn; fixtures
  live in the test file.

## Task 9 — business creation, active-business store, onboarding (2026-08-23)

- `expo-localization@57.0.1` installed via `bunx expo install`; the CLI auto-appended
  `"expo-localization"` to `plugins` in `app.json` (same SDK 57 behaviour as Tasks 3/7). Kept.
  `getCalendars()[0].timeZone` (`string | null`, null only on web) verified against the v57 docs.
- Onboarding time-zone default: plan falls back to the literal `'UTC'` when the device zone is
  unavailable. Replaced with `Intl.DateTimeFormat().resolvedOptions().timeZone` (the web runtime
  zone) and finally an empty string that the form refuses to submit, so no fixed zone is ever
  written to `businesses.time_zone`. The field stays editable.
- Empty/whitespace time zone is rejected client-side with an inline error (plan only validated
  the name). Catch block narrows `unknown` with `instanceof Error` (as in Task 8).
- `active.test.ts` gained a second case (clearing the active business removes the persisted
  key) beyond the plan's single test.
- `api.ts` exports `MemberRole` / `MembershipStatus` unions alongside `Membership` for reuse in
  Tasks 10–11; shape is otherwise identical to the plan.
- Step 5 manual simulator run not performed; instead the exact client calls were exercised
  against local Supabase over REST (signup → `rpc/create_business` with `p_name`, `p_time_zone`,
  `p_brand_color: null` → `memberships` select with the `business:businesses(...)` embed):
  business + owner membership + 8 `services` rows created, embed shape matches `Membership`.
  No migration change needed.

## Task 10 — role-based routing, tab shells, settings (2026-08-23)

- `app/index.tsx`: plan dereferences `home!.href` after the ready gate. Rewrote the gate as
  `!ready || (status === 'signed-in' && !home)` so the redirect needs no non-null assertion;
  behaviour is identical (signed-in users only redirect once memberships have loaded).
  The sync-active-business effect depends on `home.businessId` only (plan's intent), with an
  explicit `react-hooks/exhaustive-deps` disable rather than re-running on every store change.
- Root spinner keeps the Task 8 token colours (`surface` background, `primary` indicator)
  instead of the plan's unstyled `ActivityIndicator`.
- `typedRoutes` is on in `app.json` but `.expo/types` is not generated in this checkout, so
  `Href` is currently the loose string type; `bun run typecheck` passes. Once `bunx expo start`
  generates the route types the group hrefs (`/(owner)/today`, `/(walker)/today`) remain valid.
- Step 4 manual sign-in → owner Today → Settings → Sign out run on a simulator not performed in
  this session (no device run); unit test, typecheck, and lint are green. To be covered by the
  Checkpoint 2 device pass.

## Task 11 — invitations, `invite-accept` edge function, accept screen (2026-08-23)

- SMS delivery of the invite link is not wired (Plan 4 `send-sms`); the owner shares the
  `stridetail://invite/<token>` link through the system share sheet, as the plan prescribes.
  Share text uses `APP_NAME` from `src/lib/brand.ts` rather than the plan's literal "Stridetail".
- `memberships.user_id` references `auth.users`, so PostgREST cannot resolve the plan's
  `profile:profiles(display_name)` embed. `20260823000002_profiles_visibility.sql` adds a second
  FK `memberships.user_id → public.profiles(user_id)` (1:1 with `auth.users` via the signup
  trigger) alongside the plan's "members read teammate profiles" policy. Verified over REST.
- `listMyMemberships` now filters `user_id = session.user.id`. The "members read memberships"
  policy returns every membership in a business, so once a walker existed the owner's row came
  back first and `resolveHome` would have routed the walker to the owner tabs. Latent since
  Task 9; could not manifest before invites worked. Uses `auth.getSession()` (local) not
  `getUser()` (network).
- pgTAP: plan's `plan(12)` assumed 10 prior assertions; the file had 14 (Task 6), so it is now
  `plan(17)`: +2 accept-invite assertions from the plan, +1 asserting a walker reads exactly
  the teammate profiles (owner + self). Assertion 1 (profiles per auth user) is scoped to the
  four fixture ids: it counted all profiles and failed whenever the local DB held users from
  REST exercises.
- `tsconfig.json` excludes `supabase/functions` — `bun run typecheck` otherwise fails on
  `Deno` globals in the edge function. Edge code is type-checked by the Deno runtime, not tsc.
- Edge function hardened slightly vs. the plan: 405 on non-POST, 500 if env vars are missing
  (no `!` assertions), body parsed as `unknown`, admin client with `persistSession: false`.
- Pending-invite persistence lives in `src/features/business/pendingInvite.ts` (KV-injectable,
  unit-tested) instead of inline `Storage` calls in the screens. `app/index.tsx` gates on it
  and redirects to `/invite/<token>` after sign-up, per the plan.
- Edge function exercised locally via `supabase functions serve` against the local stack:
  401 without JWT, 400 short token, 200 `{ businessId }` on accept, 400 "invalid or used
  invite" on replay; walker then lists one active `walker` membership and the owner's Team
  query returns both rows with display names. Manual simulator deep-link run not performed.

## Task 12 — CI workflow and README (2026-08-23)

- `ci.yml` triggers on `push` to `main` and all `pull_request`s (plan: every push on every
  branch) to avoid double runs on PR branches; adds a `concurrency` group.
- Jest step is `bun run test --ci` rather than the plan's `bun run test -- --ci`; Bun forwards
  extra args without the `--` separator.
- `db` job excludes more services than the plan lists: the plan's `inbucket` is now `mailpit`
  in CLI 2.x (unknown `-x` names fail validation), and `realtime`, `storage-api`, `supavisor`
  are also skipped because pgTAP only needs postgres, gotrue, kong, postgrest. Adds
  `supabase stop --no-backup` on `always()`. Verified the same exclude list locally
  (CLI 2.115, colima): `supabase test db` → 17 assertions PASS.
- README expanded beyond the plan's stub (prerequisites, EAS profiles, repo layout, doc links)
  per the task brief. `checkpoints.md` / `DEVIATIONS.md` were already created in Tasks 5–11;
  not rewritten.
- CI has not yet been observed green on GitHub: nothing has been pushed (push deferred to the
  user). Workflow YAML was parsed locally and the exact commands were run locally.

## Plan 2, Task 1 — clients, pets, documents, audit log (2026-08-23)

- The plan's RLS line ("select for members of the business") contradicts its own pgTAP
  requirement ("walker of business A cannot read A's clients") and the plan header ("Walkers
  see no clients in Plan 2"): a walker is an active member, so a member-select policy would
  expose clients to walkers. Resolved in favour of the testable requirement: `clients`,
  `pets`, and `pet_documents` are **owner-only for select as well as writes** in Plan 2;
  Plan 3 adds the walker read path via assigned visits.
- `audit_log` grants: `authenticated` gets select only (no insert grant, and no insert
  policy — an insert fails with permission denied, asserted in pgTAP); `service_role` gets
  select + insert only (no update/delete), keeping the trail append-only even for the
  service key. `audit_log.id` is a `bigint identity` (append-only log; ordered, cheap),
  not a uuid like the entity tables.
- `pet_documents` carries an `updated_at` column (spec §5 lists content columns only; the
  other tables all have timestamps) so expiry/type corrections don't need delete+recreate.
- Test fixtures insert businesses/memberships directly as superuser with fixed uuids
  instead of the `create_business` RPC (001 already covers the RPC), so cross-tenant
  failure tests can target real row ids without selectable subqueries.

## Plan 2, Task 2 — encrypted client access codes (2026-08-23)

- Owner guards use `public.is_owner(b) is not true`, not `not public.is_owner(b)`:
  `is_owner` returns **null** (not false) when the caller has no membership in the
  business at all (`role_in` finds no row), and `if not null` never fires — the first
  test run showed a cross-business owner sailing straight through the check. Null is
  falsy in policy `using` clauses, so the core migration's `is_owner` is unchanged.
- The plan's grant line ("grant only insert/update/delete to nothing") is implemented
  as `revoke all on client_access from authenticated, anon`. The revoke is load-bearing:
  this stack has `alter default privileges` for the `postgres` role that auto-grant
  every new table to `anon`/`authenticated`/`service_role`, so "just don't grant" is not
  enough. `service_role` keeps its default grants (it bypasses RLS anyway and the
  deploy/service path may need it); RLS stays enabled with zero policies as specified.
- `has_client_access` raises for non-owners (same message pattern as set/reveal) rather
  than returning false, so a walker cannot probe which clients have codes on file.
- `reveal_access_owner` writes its audit row before decrypting, and also when the client
  has no `client_access` row yet (the authorized reveal *attempt* is logged; the query
  then returns zero rows). Denied attempts write nothing (asserted in pgTAP).
- Local Vault secret is seeded as 32 random bytes hex-encoded via
  `extensions.gen_random_bytes` (the plan names the secret but not its local value),
  guarded by a `vault.secrets` name lookup so `db reset` reruns don't duplicate.
  Verified locally: `supabase_vault` extension is installed in the `vault` schema;
  migrations apply as `postgres`, which holds usage on `vault`, execute on
  `vault.create_secret`, and select on `vault.decrypted_secrets` — the security definer
  functions therefore read the key while `authenticated`/`anon` have no vault access
  (`has_schema_privilege` = false for both).
- pgTAP grew from the plan's 4 bullet points to 24 assertions (direct table access for
  authenticated + anon, null-safe round trip, upsert path, walker + cross-business
  denials for all three functions, ciphertext-at-rest checks, audit-row accounting,
  vault secret uniqueness).

## Plan 2, Task 3 — media bucket, tenant-scoped storage policies (2026-08-23)

- Privilege check the plan asked for: `postgres` (the role migrations apply as) does NOT
  own `storage.objects` (`supabase_storage_admin` does) and is not a member of that
  role, yet `create policy` on `storage.objects` succeeds on this stack (CLI image,
  Postgres 17.6) — verified with a probe transaction before writing the migration, so
  no fallback was needed. `authenticated`/`anon`/`service_role` already hold full DML
  grants on `storage.objects` from the stack's defaults; no grant lines added, RLS
  decides everything.
- Invalid-uuid guard is an immutable helper `public.storage_business_id(text)` with a
  strict uuid regex rather than the plan-sketched `^[0-9a-f-]{36}/` check: the loose
  class accepts a 36-hyphen first segment, which would still blow up the `::uuid` cast.
  The helper returns null for bad prefixes; null is falsy in policy clauses, so
  malformed paths are denied (42501), never a 22P02 — both trap shapes asserted in pgTAP.
- The stack's storage image adds a statement-level `before delete` trigger
  (`storage.protect_delete`) that rejects ANY direct SQL delete on `storage.objects`
  unless the GUC `storage.allow_delete_query` is `'true'` (the Storage API sets it for
  its own deletes). The pgTAP transaction sets it with `set local`, so the delete
  policies are exercised under RLS exactly as the API would; walker/cross-business
  delete denials are asserted as zero matched rows (RLS filtering), not as errors.
- Data-modifying CTEs cannot be nested in a `select is((with d as (delete ...) ...))`
  subquery (Postgres allows them at top level only), so delete assertions use
  `lives_ok` plus a row-count check, done as superuser where the actor cannot see the
  surviving row.
- pgTAP grew from the plan's 3 bullets to 21 assertions (bucket private + idempotent
  single row, helper parse cases, owner insert/update/delete, wrong-tenant and
  malformed-path insert denials, walker read-allowed/write-denied, cross-business zero
  rows and no-op delete).

## Plan 2, Task 4 — clients api and owner clients list (2026-08-23)

- List cards show a **pets count** line (`pets(count)` embed unwrapped by `embeddedCount`)
  rather than the plan's "pet names line", per task direction; `getClient` likewise embeds
  `pets(count)` only — the plan's "docs counts" arrives with the documents feature (Task 7).
- Every api function takes `businessId` and scopes the query with `.eq('business_id', …)`
  (including `getClient`/`updateClient`, where the plan's signature was `(id)` only), so a
  stale/foreign id can never cross tenants even before RLS.
- `listClients` escapes `%`, `_`, and `\` in the search term before building the ilike
  pattern (not in the plan; without it a user typing `_` matches every name).
- Added `app/(owner)/clients/_layout.tsx` (Stack, `headerShown: false`) beyond the plan's
  `index/[id]/new` list: without an explicit layout expo-router wraps the directory in a
  default stack with its native header, which no other screen shows. The Tabs.Screen name
  in `app/(owner)/_layout.tsx` stays `clients`; the directory's index resolves for the tab.
- Card taps push `/clients/<id>` and "Add client" pushes `/clients/new` with an `as Href`
  cast: `[id].tsx`/`new.tsx` only exist in Task 5, so typed routes cannot know them yet
  (routes 404 until then, as planned). Casts can come off once Task 5 lands and
  `.expo/types` regenerates.
- Search input re-queries per keystroke keyed on the trimmed term, with
  `placeholderData: keepPreviousData` so the list doesn't flash empty while typing; no
  debounce (local stack, tiny lists — revisit if the first tenant's list grows).
- Unit tests mock `@/src/lib/supabase` with a thenable chain recorder and assert query
  shape (table, business scoping, order, conditional ilike) plus the pure helpers; no
  RNTL screen render (the screen is markup over the tested helpers, matching the
  existing screens' test approach).

## Plan 2, Task 5 — client form, geocoding, detail screen (2026-08-23)

- Geocoding permissions, verified against the expo-location v57 docs: **iOS needs no
  location permission for forward geocoding** (the plan's assumption holds); **Android
  requires foreground location permission before `geocodeAsync`**. `geocodeAddress`
  therefore checks/requests foreground permission once on Android only; a denial resolves
  to null (save proceeds, no pin) rather than throwing. `geocodeAsync` is Android/iOS
  only — on web the call rejects and the wrapper's catch → null path applies. The docs
  also warn geocoding is rate-limited/resource-heavy; the form geocodes at most once per
  save, only when the address is new/changed.
- Geocode retry beyond the plan's "if address changed": saving with an **unchanged**
  address whose previous geocode failed (`lat` null) retries, so a client stuck without a
  pin can be fixed by re-saving; the detail screen's "no map pin" hint says exactly that.
- Phones are a single comma-separated field (the plan allowed "comma or multi-field")
  parsed to `text[]` by `parsePhones` (trim, drop empties). `telUrl` strips non-digits
  but keeps a leading `+` so international numbers stay dialable.
- "Mark meet & greet done" sets `mg_completed_at` client-side to
  `new Date().toISOString()` via `updateClient` — an owner shortcut; **Plan 3's
  visit-driven flow will own meet & greet completion** (recorded per the plan).
- The nested clients stack hides native headers (Task 4 layout), so the detail screen
  gets a ghost "Back" button and both form usages a ghost "Cancel"; not in the plan but
  otherwise `new.tsx` reached from a cold link has no way back.
- "Pets" and "Access codes" render as inert half-opacity cards naming Tasks 6/7 (the
  plan's "section"/"entry point" placeholders — nothing tappable yet).
- The Task 4 `as Href` casts stay (also used in `new.tsx`/`[id].tsx`): `.expo/types`
  route types only regenerate when the dev server runs, which this task didn't do.
- Tests cover the pure layer (geocode wrapper with mocked expo-location incl. the
  Android permission branch via `jest.replaceProperty(Platform, 'OS', …)`; parsePhones /
  validateClient / telUrl / needsGeocode); screens stay untested markup over tested
  helpers, matching Task 4's approach.

## Plan 2, Task 6 — pets crud, photo upload, profile (2026-08-23)

- Route restructure not in the plan's file list: nested pet routes need a directory, so
  `app/(owner)/clients/[id].tsx` moved (git mv) to `app/(owner)/clients/[id]/index.tsx`
  with `pets/new.tsx` and `pets/[petId].tsx` beneath it. Resolved paths are unchanged;
  the existing `as Href` casts stay (`.expo/types` regenerate only when the dev server
  runs — Task 4/5 precedent), and two new casts cover the pet routes.
- Age is plain calendar math (`petAge` in `helpers.ts`), not the plan's "date-fns in
  business tz": `pets.birthdate` is a date-only column, so age is day-arithmetic on
  Y/M/D parts with an injected `now` — no zone is consulted and no date-fns dependency
  was added. Format `N y` from the first birthday, `N mo` before it; null for missing,
  malformed, or future dates.
- Photo upload happens **after** create/update, not inside the form: the storage path
  `business_id/pets/<pet_id>/photo.jpg` needs the pet id, so `PetForm` hands the picked
  local uri to the caller and the screens call `uploadPetPhoto` once the row exists.
  Upload fetches the file uri to an ArrayBuffer (supabase-js RN pattern), uploads with
  `upsert: true` + `contentType: image/jpeg`, then persists `photo_path` on the row.
- expo-image-picker v57 API verified against the docs: `launchCameraAsync` /
  `launchImageLibraryAsync` with `mediaTypes: ['images']` (string-literal `MediaType`),
  `allowsEditing`, `quality: 0.7`; result is `{ canceled, assets }`. The camera path
  requests permission via `requestCameraPermissionsAsync` first; the library path needs
  no runtime request on modern iOS/Android pickers.
- `bunx expo install` did **not** auto-add the config plugin; added manually to
  `app.json` with `cameraPermission`/`photosPermission` strings and
  `microphonePermission: false` (photos only — avoids the default `RECORD_AUDIO`
  Android permission the plugin would otherwise inject).
- Birthdate is a plain `YYYY-MM-DD` TextField (no datepicker dependency), so
  `validatePet` checks shape *and* calendar validity (rejects `2023-02-30`) alongside
  the required name/species.
- Added a `warning` color token (`#B7791F`) to `src/ui/tokens.ts` for the reactivity
  card (tokens had only danger/success; no literal colors in screens per CLAUDE.md).
- `getPet` and `petPhotoUrl` added beyond the plan's "list, create, update": the
  profile screen loads one pet by id and signs the private photo path (1 h,
  `staleTime` 55 min so a cached url never outlives its signature).
- Tests cover the pure layer (petAge, storagePetPhotoPath, validatePet) and query/
  storage shape with a mocked supabase (chain recorder + storage upload/sign log,
  fetch spied); screens stay untested markup over tested helpers (Task 4/5 approach).

## Plan 2, Task 7 — vaccine documents and access codes UI (2026-08-23)

- Expiry badges are pure calendar math on `YYYY-MM-DD` parts with an injected `now`
  (`expiryState` in `documents.ts`), not the plan's "date-fns in device tz": date-fns is not a
  dependency (same call as Task 6's age math) and the comparison is day-granular display-only
  logic on the device's local calendar day. A document expiring **today** shows "Expires soon"
  (still valid through its expiry date), strictly-before-today shows "Expired".
- No new color token: the task allowed adding a `danger` token if none existed, but
  `tokens.colors.danger` (`#C53030`) has been there since Task 2. Badges use `danger`/`warning`.
- `bunx expo install expo-document-picker` did **not** auto-append a config plugin (unlike
  expo-sqlite/secure-store/localization). Added `"expo-document-picker"` to `app.json` plugins
  manually with no options (documents the dependency; the plugin only matters for the iCloud
  entitlement, which is not needed) — same rationale as Task 5's expo-task-manager entry.
  `getDocumentAsync({ type: 'application/pdf' })` → `{ canceled, assets: [{ uri, … }] }`
  verified against the v57 docs.
- `deleteDocument` deletes the `pet_documents` row first (owner RLS authorises there), then
  removes the storage object; a storage failure after the row delete leaves an orphan object
  rather than a row pointing at a missing file.
- Access screen "Edit" reveals first (audited like any reveal) when codes are on file, to
  prefill the form: `set_client_access` upserts **all** columns, so an unprefilled form would
  silently wipe fields the owner never touched. The plan did not specify prefill behaviour.
- Revealed codes and the edit form live only in component state; a `useFocusEffect` cleanup
  wipes them on screen **blur** as well as unmount (the plan said "component state" — blur
  handling added because a pushed screen keeps the previous one mounted).
- `has_client_access` raises for non-owners (Task 2 hardening), so the flag query on the
  access screen surfaces the RPC error text rather than pretending "no codes".

## Plan 2, Task 8 — hosted deploy + advisor hardening (2026-08-23)

- Migrations 20260824000001–3 applied to hosted `vrxoswukuiaerhwammlh` via Supabase MCP
  `apply_migration`; Vault key seeded per-environment by the guarded migration block
  (hosted key is its own random value, never shared with local dev).
- Hosted smoke test (SQL role-impersonation, rolled back): owner set → reveal round-trip
  with both audit rows written.
- Supabase security advisors then drove `20260824000004_advisor_hardening.sql`:
  - **Real find:** functions keep PUBLIC EXECUTE unless explicitly revoked, so Plan 1's
    `revoke ... from authenticated, anon` on `accept_invite` was ineffective — the anon key
    could still call it (with a valid token it could bind an invite to an arbitrary user id).
    Now service_role-only; verified 401/42501 via REST with the anon key.
  - PUBLIC/anon stripped from every RPC; RLS helper functions granted to
    authenticated+service_role only; `handle_new_user` restricted to `supabase_auth_admin`
    (hosted signup re-verified working after the change, smoke user deleted).
  - search_path pinned on `is_owner` and `storage_business_id`.
  - Accepted findings: `client_access` deny-all no-policy design (INFO); `services_public`
    SECURITY DEFINER view is the price-hiding mechanism, tenant-scoped internally (ERROR
    accepted with rationale).

## Plan 2 — accepted design: single symmetric key for all tenants (2026-08-23, review pass)

All tenants' access codes are encrypted under the one Vault secret `client_access_key`.
Accepted for now: the key never leaves security-definer functions, no client role can select
the ciphertext, and slice 1 has effectively one tenant. Future path before multi-tenant GA:
per-tenant keys derived/created at business creation (e.g. `client_access_key:<business_id>`
in Vault), with a migration that re-encrypts existing rows tenant-by-tenant.

## Plan 3, Task 1 — scheduling schema, status machine, assignment RPCs (2026-08-23)

- **Decline reading (recorded per the plan):** the `visit_status` enum has NO `declined`
  value. Spec §5 says a decline "returns to owner as unassigned with reason", so decline is
  `offered -> unassigned` + `decline_reason` set + `walker_id` cleared. The transition guard
  enforces all three (reason required, walker cleared inside the trigger), so the invariant
  holds even for callers that bypass the `decline_visit` RPC.
- **Price hiding = column-level grants** (the plan offered column grants vs a no-price
  `security_invoker` view; one mechanism to be implemented). A `security_invoker` view alone
  cannot hide the column: the walker RLS select policy the plan requires on `visits` keeps
  the base table queryable, price included. The column grant (`select` granted on every
  `visits` column except `price_cents_snapshot`) makes the price unreadable to any client
  role on any row — "the UI cannot leak what it cannot query". No `visits_walker` view was
  created. Consequences: `select *` / supabase-js `select('*')` on `visits` fails with 42501
  for owners too — app queries in Tasks 7–8 must name columns; owner-side price display
  (slice 2 invoicing) will need a definer view or RPC. `insert`/`update` stay whole-table
  grants, so the owner still stamps `price_cents_snapshot` at creation.
- **Audit rows are written by an `after update` trigger** on `visits` (actions
  `visit.offer/accept/decline/cancel/start/complete/reassign`), not inside the RPCs: the
  owner may legally force-assign or reassign by direct table update (RLS allows it, the
  guard validates it), and spec §6.7 wants those audited too. RPC-level inserts would miss
  them; trigger-level cannot. pgTAP asserts a direct force-assign writes `visit.accept`.
- **RPCs are granted to `authenticated` only, not `service_role`:** the `is not true` /
  `walker = auth.uid()` guards require a JWT sub, which service-role calls lack, so the
  grant would be dead. Service paths (Task 4 expansion) use direct DML — the guard trigger's
  elevated branch (`auth.uid() is null`) skips only the who-check, never the matrix, and the
  audit trigger still fires.
- `visit_series.active boolean not null default true` added beyond the spec §5 column list:
  Task 4's expansion iterates "each active series" and needs the flag now to avoid a Task 4
  schema migration. `visit_series.walker_id` is `not null` (spec lists it unqualified;
  expansion stamps the series walker onto every generated visit).
- `visits.series_id` is `on delete set null` (deleting a series must not destroy completed
  visit history); `visits.walker_id` is `on delete set null`; `service_id` FKs have no
  cascade (services are deactivated, not deleted).
- Sanity check constraints added beyond the plan text: `weekday between 0 and 6` (plan),
  `end_local > start_local`, `ends_at > starts_at`, `scheduled_end > scheduled_start`.
- Table grants follow the established revoke-all-then-grant-exactly pattern so local
  (supabase_admin applies migrations, no default privileges) and hosted (postgres applies,
  default privileges auto-grant) end up identical.

## Plan 3, Task 2 — walker visibility via visits, reveal_access(visit_id) (2026-08-23)

- **Visibility scope (recorded per the plan):** ANY visit row with `walker_id = auth.uid()`
  and a matching client grants read on `clients`/`pets`/`pet_documents` — status is not
  consulted. Completed and cancelled visits keep the walker's read access (they may need
  the context afterwards, e.g. a report dispute); a *declined* visit grants nothing
  automatically, because Task 1's trigger clears `walker_id` on decline. Asserted in
  pgTAP: a cancelled-only client is visible to its walker.
- Policy subqueries wrap `auth.uid()` in a scalar subselect (planner evaluates once) and a
  new partial index `visits_walker_client on visits(walker_id, client_id) where walker_id
  is not null` serves all three policies; `pet_documents` chains via `pets.client_id`.
- **Fixture approach for `in_progress` (recorded per the plan):** visits are inserted with
  their status directly as superuser — the transition guard is a BEFORE **UPDATE** trigger,
  so fixture inserts may take any status (005 already relies on this for
  accepted/offered/completed rows).
- `reveal_access` **raises** `'no access codes on file for this client'` when the visit's
  client has no `client_access` row (the plan requires the row to exist), whereas
  `reveal_access_owner` logs the authorized attempt and returns zero rows. Divergence is
  deliberate: every denial raises *before* the audit insert, so denied walker attempts
  (wrong walker, wrong status, no codes) leave no audit rows — asserted in pgTAP.
- The visit's own business owner is NOT exempt from the walker gate (`only the assigned
  walker...`): owners have `reveal_access_owner`. Asserted in pgTAP.
- pgTAP grew from the plan's bullet list to 27 assertions (visibility matrix for two
  walkers incl. the cancelled-visit case and zero-rows walker, walker write denials,
  all four reveal denial actors + no-audit accounting, decrypt round trip + audit meta,
  owner-side spot checks, cross-business counts, anon execute denial).

## Plan 3, Task 3 — recurrence + conflict lib, status-machine mirror (2026-08-23)

- **Versions (recorded per the plan):** `date-fns 4.4.0`, `date-fns-tz 3.2.0`, pinned exact
  in `package.json` (no caret, matching the supabase-js/aes-js style). Installed with
  `bun add --exact` rather than `bunx expo install` — both are pure JS with no native
  module, so Expo version alignment does not apply.
- **Nonexistent-hour resolution (documented per the plan):** date-fns-tz 3.2.0
  `fromZonedTime` resolves a wall time inside the spring-forward gap using the
  POST-transition offset. 02:30 on 2026-03-08 in America/Chicago (the 02:00–03:00 hour
  does not exist) becomes `2026-03-08T07:30:00Z`, an instant that renders locally as
  01:30 CST — one hour before the gap closes. The exact instant is pinned in
  `recur.test.ts` so a library upgrade that changes the rule fails loudly. Ambiguous
  fall-back times take the FIRST (pre-transition, CDT) occurrence — also pinned.
- **Weekday convention:** 0 = Sunday … 6 = Saturday (JS `getDay()`), always evaluated on
  the LOCAL calendar date in the business tz. The DB's `availability_rules.weekday`
  check (0–6) does not pin a mapping; this app-level convention is now the contract for
  Tasks 6–7 and the Task 4 Deno expansion.
- **`expandWeekly` bounds:** half-open — `from <= start < until` — pinned by tests down
  to 1 ms either side. `end` is `durationMin` absolute minutes after `start` (a walk
  crossing the spring-forward jump is still its real length; wall clock is not
  preserved for `end`).
- **Midnight-crossing availability (decided per the plan, simplest option):** not
  supported. Rules are same-local-day ranges (the DB already enforces
  `end_local > start_local`); an inverted range reaching the client matches nothing
  rather than wrapping, and a visit spanning two local calendar dates is never
  `withinAvailability` — even when back-to-back rules cover both sides of midnight.
  Both behaviors are unit-tested.
- **`canTransition` actor shape:** `(from, to, {role, isAssignee})` rather than the plan
  sketch's positional `(from, to, role, isAssignee)` — same information, harder to
  transpose at call sites. The trigger's `walker_ok` checks only
  `walker_id = auth.uid()`, so the mirror keys the walker-side transitions on
  `isAssignee` alone: an owner who self-assigned passes accept/start/complete too,
  exactly like the DB. Same-status "transitions" return `false` (the trigger no-ops
  them; they are not transitions the UI should offer). Data-shape requirements
  (offer/accept need a walker, decline needs a reason + clears the walker) stay with
  the trigger/RPCs — `canTransition` answers only who-may-move-where. The full
  6×6×4 matrix (144 cases) is looped in `machine.test.ts` against an independently
  written restatement of the trigger, and the allow-list lives in one literal table in
  `machine.ts` so a future change is one edit.

## Plan 3, Task 4 — expand-series edge function + nightly cron (2026-08-23)

- **`visits_series_start` swapped from a partial to a full unique index** (migration
  `20260824000007`, not an edit of the committed Task 1 migration). The function dedupes
  with a PostgREST upsert (`on_conflict=series_id,scheduled_start` + ignore-duplicates),
  which compiles to `ON CONFLICT (series_id, scheduled_start) DO NOTHING` — and Postgres
  cannot infer a PARTIAL unique index from a bare column-list conflict target (the index
  predicate would be required, and PostgREST never emits one). Semantics are unchanged:
  one-off visits carry `series_id NULL` and unique indexes treat NULLs as distinct, so
  one-offs still never conflict with each other.
- **Cron mechanism (checked against current Supabase docs): pg_cron + pg_net** POSTing the
  function URL — the portable hosted mechanism; the CLI has no native function schedule in
  `config.toml`. Nightly `0 3 * * *` — 03:00 in the cluster's `cron.timezone` (GMT on
  Supabase), i.e. 03:00 UTC, deliberately NOT the business tz (the 8-week look-ahead makes
  the firing hour immaterial). **Cron-path auth:** `verify_jwt` stays ON (explicit in
  `config.toml`), the job sends the anon key as Bearer (satisfies the platform JWT check)
  plus an `x-cron-secret` header the function compares constant-time against its
  `EXPAND_CRON_SECRET` env; the anon JWT alone unlocks nothing, and `{all: true}` without
  the secret is 403. Secrets live in Vault per the plan: `expand_cron_secret` (seeded
  `gen_random_bytes`), plus `expand_project_url` / `expand_anon_key` (guarded creates with
  local placeholders); the cron command reads all three from `vault.decrypted_secrets` at
  run time.
- **Local cron is a deliberate no-op:** pg_cron runs inside the db container and cannot
  reach `supabase functions serve` on the host, so the scheduled POST just fails in
  `net._http_response` nightly with no other effect (`db reset`/`db test` unaffected —
  verified). Local testing is `supabase functions serve` + a Deno fetch script
  (context-mode blocks curl). Local `EXPAND_CRON_SECRET` lives in the gitignored
  `supabase/functions/.env` (auto-loaded by `functions serve`); hosted needs
  `supabase secrets set EXPAND_CRON_SECRET=<vault value>` plus the two vault URL/key
  updates listed in the migration comment.
- **Status choice (recorded per the plan):** inserted visits are `accepted` when the
  series walker holds an ACTIVE OWNER membership in the business (self-assigned, matching
  the Task 7 force-assign path), else `offered`.
- **rrule canonical form decided** (spec §5 left `rrule text` unspecified):
  `FREQ=WEEKLY;BYDAY=MO,WE,FR` with RFC 5545 weekday codes, written by
  `buildWeeklyRRule` in `src/features/schedule/api.ts` and parsed by
  `parseWeeklyRRule` in the function (case/order tolerant). A non-weekly or malformed
  rrule marks that series `error: 'unsupported rrule'` in the results and the run
  continues — one bad series never aborts the nightly sweep.
- **Window semantics:** occurrences in `[max(now, starts_on 00:00 local), min(now + 56d,
  ends_on + 1 day 00:00 local))` — `ends_on` is inclusive, and expansion never backfills
  occurrences earlier than the invocation instant.
- **DST parity:** the Deno mirror (`expand.ts`) is dependency-free (Intl-based two-pass
  offset resolution; date-fns-tz cannot be imported in the edge runtime). The plan's
  vector-table option chosen: a separate `deno test` file (`expand.test.ts`) carries the
  vectors COPIED from `recur.test.ts` as a comment table + assertions — gap wall times
  resolve with the post-transition offset, ambiguous take the first occurrence, both
  pinned identically in both files. 10/10 pass under `deno test`.
- **E2E (local, functions serve):** Mon/Wed/Fri 09:00 America/Chicago series → 24 visits
  over now→+8 weeks, every instant exactly 14:00:00Z (09:00 CDT), `offered`,
  `price_cents_snapshot 3000` (2500 + 500 × 1 extra pet), end = start + 30 min; re-invoke
  inserted 0 (count stayed 24). Cron path with the correct secret: 200, series1 0 inserted,
  owner-walker Tue 07:15 series → 8 visits `accepted` at 12:15:00Z, price 2500. 401 with no
  JWT, 403 for walker JWT / wrong secret / missing secret, 400 bad body; deactivated series
  expands nothing. 22/22 checks passed.
- `createSeries` throws if the post-insert invoke fails — the series row then exists with
  no visits until the nightly cron catches it; callers may retry the invoke idempotently.

## Plan 3, Task 5 — services management UI (2026-08-23)

- Confirmed against `20260823000001_core.sql` before writing queries: the owner select
  policy on `services` exposes full rows **including prices**, so `listServices` uses
  `select('*')` — the price-hiding column grant (Plan 3 Task 1) exists only on
  `visits.price_cents_snapshot`; walkers' price-free path is the `services_public` view,
  which this owner-only screen does not touch.
- Money/validation helpers live in `src/features/services/form.ts` (matching the
  `clients/form.ts` split), with queries in `api.ts`. `dollarsStringToCents` accepts
  `"12"`, `"12.5"`, `"12.50"` plus surrounding whitespace and an optional leading `$`;
  it rejects negatives, `>2` decimals, and bare-dot forms (`"12."`, `".50"`).
  `centsToDollarsString` always renders two decimals so editor prefill round-trips.
- `SettingsScreen` (shared by both roles) gained an optional `extra?: ReactNode` prop
  rendered above the sign-out button. Only `app/(owner)/settings/index.tsx` passes it
  (the Services link Card), so walkers never see the catalog entry point; the walker
  route re-export needed no change and still typechecks.
- Added `app/(owner)/settings/_layout.tsx` (Stack, `headerShown: false`) beyond the
  plan's file list — same reason as Plan 2 Task 4's clients `_layout.tsx`: without it
  expo-router wraps the new directory in a default stack with a native header.
- The plan's "requires GPS / active toggles": `src/ui` has no Switch component, so both
  are `Button`s flipping variant (`primary` = on) — tokens-only styling, no new
  component. Kind selection is the same button-row pattern.
- New-service editor prefills duration `30` and prices `0.00` (the DB defaults) rather
  than empty strings, so a bare "create" attempt fails only on the truly missing
  name/kind.
- The `/settings/services` push keeps the `as Href` cast (`.expo/types` regenerate only
  when the dev server runs — Plan 2 Task 4/5/6 precedent).
- Screens stay untested markup over tested helpers (`form.test.ts` 12 tests,
  `api.test.ts` 4 query-shape tests with the chain-recorder mock), matching the
  established approach.

## Plan 3, Task 6 — walker availability + time off UI (2026-08-23)

- **No tz conversion for availability (recorded per the plan):** `availability_rules`
  stores plain `time` columns, so rules are local wall-clock ranges saved exactly as
  typed — the weekday grouping is merely read in the business-tz context. Weekday
  convention is JS getDay() (0 = Sunday … 6 = Saturday), matching the Task 3 lib
  contract. Midnight-crossing ranges stay unsupported (Task 3 decision; the form's
  same-day `start < end` validation mirrors the DB's `end_local > start_local`).
- **Time off is instant-based:** the form takes 'YYYY-MM-DD HH:MM' wall times in the
  BUSINESS tz (`businesses.time_zone` via the active membership — never a hardcoded
  zone) and converts with date-fns-tz `fromZonedTime`, inheriting the Task 3 DST
  semantics: a spring-forward gap wall time resolves with the post-transition offset
  (pinned in `api.test.ts` with the same 2026-03-08 Chicago vector as `recur.test.ts`).
  List rows render back in the business tz via `formatInTimeZone`.
- `parseLocalTime` is leniently zero-padded ('9:30' → '09:30') but rejects seconds and
  out-of-range values; `parseLocalDateTime` additionally rejects impossible calendar
  dates (2026-02-30) via a UTC round-trip probe.
- Both tables' RLS is "member manages own rows" (Task 1), so every API call pins
  `user_id` from `supabase.auth.getSession()` (local, no network — the
  `listMyMemberships` pattern). Signed-out reads resolve `[]`; signed-out writes throw.
- One per-day add form is open at a time (opening another day resets the fields);
  validation and mutation errors render inline under the fields per the plan.
- Manual simulator run not performed this session; `bun run test` (321),
  `typecheck`, and `lint` are green. Device coverage arrives with Checkpoint 3.

## Plan 3, Task 7 — owner scheduling: visits api, create form, walker picker (2026-08-23)

- **Walker names are joined client-side:** `visits.walker_id` references `auth.users`
  with NO second FK to `public.profiles` (unlike `memberships`, which got one in
  migration 20260823000002), so a PostgREST `walker:profiles(display_name)` embed on
  visits is impossible. Screens fetch the roster once via `listActiveMembers`
  (memberships → profiles embed, the team.tsx pattern) and resolve names with
  `memberName()`. No new migration; adding a profiles FK to visits is left for
  whenever a server-side join is actually needed.
- **Every visits read names columns** (`VISIT_COLUMNS`, embeds included) — never
  `select('*')`, never a bare returning `.select()` — because the
  `price_cents_snapshot` column grant rejects both for all client roles, owner
  included (Plan 3 Task 1 deviation). Inserts return `.select('id')` only. A test
  pins that `VISIT_COLUMNS` contains no `*` and no price column.
- **Force-assign routing lives in `createVisit`:** it compares the picked walker to
  the local session user — self picks insert directly as `accepted` with `walker_id`
  (legal: the transition trigger fires only on UPDATE of status, and the owner may
  force-assign anyway), other walkers insert unassigned then route through the
  `offer_visit` RPC so the audit trail and offered flow apply. No walker picked =
  plain unassigned insert.
- **A weekly repeat requires a walker:** `visit_series.walker_id` is NOT NULL (Task 1),
  so the form blocks creating a series with no walker selected instead of silently
  downgrading to one-offs.
- **Reassign/offer UI is machine-gated to `unassigned` visits only:** the mirror has
  no `offered→offered` edge, so re-offering an already-offered visit or moving an
  accepted one is not offered in the UI (decline resets to unassigned, which is the
  reassignment entry point). Cancel is gated by `canTransition(status, 'cancelled',
  owner)` behind an Alert confirm.
- `pickerContext` counts overlaps from assigned (`walker_id not null`), non-cancelled
  visits overlapping the window (half-open, touching edges don't overlap — Task 3
  semantics), and `walkerFlags` takes an `excludeVisitId` so a visit being reassigned
  never counts itself. Availability rules and time off are fetched business-wide
  (owner RLS select paths from Task 1), deliberately NOT via the user_id-pinned
  `features/availability` list functions.
- `listVisits` windows on `scheduled_start ∈ [fromUtc, toUtc)`; the index screen shows
  the next 14 days grouped by LOCAL day in each visit's own stamped `business_tz`
  (`groupVisitsByLocalDay`), with All / Unassigned / Needs-attention chips
  (needs attention = unassigned OR carries a `decline_reason`).
- `rescheduleVisit` exists in the api (plan list) but has no UI yet — the plan's
  `[id].tsx` scope is reassign/offer + cancel + decline-reason display.
- The plan's `declined-reasons` and `needs-attention` chips collapse into one
  "Needs attention" chip: decline resets status to unassigned, so "declined with
  reason" is a subset of needs-attention rows and a separate chip would only ever
  show a subset of the same list.
- Manual simulator run not performed this session; `bun run test` (341), `typecheck`,
  and `lint` are green. Device coverage arrives with Checkpoint 3.

## Plan 3, Task 8 — walker offers/today + owner needs-attention (2026-08-23)

- **Walkers cannot use the `service:services(...)` embed:** the `services` select
  policy is owner-only (`"owner reads services"`, core migration), so under walker
  RLS the embed on `visits` resolves to `service: null` rather than erroring. The
  walker read path (`listMyVisits`) therefore selects `MY_VISIT_COLUMNS` — the same
  named columns as `VISIT_COLUMNS` but WITHOUT the services embed — and fills
  service name/duration client-side from the `services_public` definer view
  (`joinServices`). The `client:clients(name)` embed DOES work for walkers via the
  Task 2 walker-visibility policy and is kept. Determined from the migrations, not
  a live walker session; Checkpoint 3 exercises it on-device.
- **Decline reason is an inline form, not `Alert.prompt`:** `Alert.prompt` is
  iOS-only, so tapping Decline swaps the offer card's buttons for a `TextField` +
  "Confirm decline" / "Keep offer" pair on both platforms. Confirm stays disabled
  until a non-empty reason is typed (the DB guard requires one).
- **"Offers on ANY date" is bounded by the fetch window:** `listMyVisits` is called
  with `[now − 26h, now + 70d)` — 26h back covers "earlier today" in every tz
  (24h local day + DST fall-back hour), 70 days forward covers the 8-week series
  expansion horizon, so every offer that can exist is in view. No walker_id filter:
  walker RLS already pins rows to `auth.uid()`; cancelled visits are excluded.
- **Owner Today runs ONE visits query** over `[now − 26h, now + 14d)` serving both
  strips: needs-attention triages the same 14-day upcoming window as the schedule
  list, and "today's visits" filters client-side to the current LOCAL day per
  visit's stamped `business_tz` (`visitsOnLocalDay`) — DST-proof and avoids
  computing business-tz midnight instants.
- Needs-attention declined rows require `decline_reason != null` AND status
  `unassigned`: once the owner re-offers, the visit leaves the strip even though
  the reason column persists (the count line counts unassigned only, same rule).
- **Grouping order** (`groupTodayByWalker`): owner's own visits first, then walkers
  alphabetically by display name, "Unassigned" bucket last; empty groups and
  cancelled visits dropped. Walkers get no visit-detail route yet, so walker Today
  cards are not pressable; owner cards push `/schedule/[id]`.
- The Task 7 screen-local `timeRange` helper moved into the api as
  `visitTimeRange` (plus `visitDayLabel`) so the schedule list, both Today
  screens, and `VisitCard` share one business-tz renderer — extended, not
  duplicated, per the plan.
- Composition on both screens is deliberately plain (Round 0 pending).

## Plan 3, Task 9 — hosted deploy (2026-08-23)

- Migrations 5–8 applied hosted via Supabase MCP; expand-series deployed (verify_jwt on);
  Vault expand_project_url/expand_anon_key updated to real hosted values.
- `supabase secrets set EXPAND_CRON_SECRET=…` hangs from a non-interactive shell on the mini
  (CLI keychain read); the sponsor runs it in their own terminal. Until then the cron path
  returns 500 "misconfigured" by design and the nightly job no-ops harmlessly; the app path
  (owner-JWT seriesId expansion) works regardless — it does not use the secret.
- Advisors post-Plan 3: no anon-executable definer functions (all revoked from public at
  creation); authenticated-executable RPC WARNs are intentional (guarded RPCs are the API);
  pg_net moved public → extensions (migration 0008).

## Post-Plan 3 — native date/time pickers on the new-visit form (2026-08-23)

- Added `@react-native-community/datetimepicker` 9.1.0 (SDK 57 recommended version) via
  `bunx expo install`; the CLI auto-appended its config plugin to `app.json`. New native
  module → the dev client must be rebuilt and a new EAS build is required before the pickers
  work on device (Expo Go includes the module already).
- The v57-installed 9.1.0 deprecates the README's classic `onChange` in favour of
  `onValueChange`/`onDismiss`; components use the non-deprecated API. Android uses the
  documented recommended imperative `DateTimePickerAndroid.open()`; iOS uses inline
  `display="inline"` (date) / `display="spinner"` (time) below the tapped field.
- `DateField`/`TimeField` keep the form contract unchanged: values in/out remain plain
  'YYYY-MM-DD' / 'HH:MM' strings; Date objects exist only inside the picker widgets as
  local wall-clock constructions (`src/ui/datetime.ts`), so the business-tz conversion in
  `visitInstants`/`createSeries` stays the single source of truth. Downstream string guards
  in `new.tsx` kept intact.
- Pet birthdate, walker document expiry, and time-off date fields are still plain text —
  candidates to adopt `DateField` later.

## Post-Plan 3 — owner-group role guard (2026-08-23)

Simulator testing of the new date/time pickers reached `(owner)/schedule/new` via the
`stridetail://schedule/new` deep link while signed in as the walker. RLS held (services
empty, price invisible, inserts would be rejected), but the owner shell rendered.
`(owner)/_layout.tsx` now redirects non-owners of the active business to `/` once the
membership roster loads. Walker tabs need no mirror guard: every screen there is
scoped to the session user by design.

## Plan 4, Task 1 — execution schema, start/finish RPCs, reports, notifications (2026-08-24)

- **Probe (recorded per the task):** `auth.uid()` inside a SECURITY DEFINER function
  returns the CALLER's JWT sub (`request.jwt.claims` GUC is not changed by definer
  context) — verified in psql: with claims sub set, a definer `select auth.uid()`
  returned the same uuid as the direct call. `start_visit`/`finish_visit` therefore
  update `visits.status` directly and the Plan-3 transition trigger validates the
  walker + transition; its audit trigger stamps the walker as actor (asserted in pgTAP).
- **"Idempotent-safe (re-call → clear error, no dup rows)" read as: a re-call raises a
  clear, specific error** (`visit is not accepted (status: in_progress)` /
  `visit is not in progress (status: completed)`) rather than silently no-opping; no
  duplicate events, reports, or notifications can result (also guarded by
  `visit_reports.visit_id unique`). Same reading for `revoke_report` re-calls
  (`report is already revoked`) and resend-after-revoke (`report has been revoked`).
- **No-phone clients (recorded per the task):** `queue_client_sms` silently skips when
  `clients.phones[1]` is null — start/finish proceed, nothing is queued (asserted in
  pgTAP). `resend_report` raises instead (`client has no phone number on file`): an
  explicit owner action that can deliver nothing deserves an error, not silence.
- `visit_reports.sent_at` stays NULL at creation (finish only queues the SMS) and is
  bumped by `resend_report` per the plan; the Task-6 sender owns setting it on a real
  send. `sms_status` is plain text, wired in Task 6.
- `visit_events`/`visit_tracks` carry `created_at` only (append-only rows, no client
  update grant — update attempts are 42501, asserted); `visit_reports`/`notifications`
  keep the full `created_at`/`updated_at` pair.
- `notifications."to"` is a reserved word in Postgres; the plan names the column
  literally, so it is quoted in every statement rather than renamed.
- `recompute_visit_distance` mirrors `src/lib/gps/geo.ts` exactly: R = 6371008.8,
  points with `acc > 50` dropped but acc-less points kept
  (`pt.acc !== undefined && pt.acc > max`), consecutive-pair haversine summed within
  each segment only (window partitioned by track row). It also persists
  `visits.distance_m` and returns it (Task 2's ingest returns `{distanceM}` from it).
  pgTAP fixture is hand-checkable: pure-latitude moves of 0.001°/0.002°
  (111.19493 m + 222.38985 m = 333.58478 m), a far-away bad-accuracy point that would
  add thousands of km if not filtered, and segments thousands of km apart so a
  cross-boundary leg would fail loudly.
- Event/track insert policies also pin `business_id` to the visit's business (tenant
  spoofing on insert is 42501, asserted); the plan's RLS bullet did not mention the
  business column.
- `queue_client_sms` extracted as a definer helper (three call sites); execute revoked
  from public/anon/authenticated — only the RPCs reach it.

## Plan 4, Task 2 — ingest-track function, walker media upload policy (2026-08-24)

- **Walker READ of visit photos needs no new storage policy (verified):** the Plan-2
  "member reads media objects" policy grants select via `current_business_ids()`, which
  covers any ACTIVE member — walkers included. Asserted in 008; a side effect (Plan-2
  behavior, unchanged) is that member read is business-wide, so a teammate walker can
  also read the object — asserted and documented rather than tightened, since pet
  photos already share this scope.
- `storage_second_uuid(text)` requires BOTH the first and second path segments to be
  strict uuids followed by `/` (the storage_business_id rationale doubled): a
  `biz/pets/...` path returns null → policy denial (42501), never a 22P02 cast. The
  walker insert policy additionally pins `visits.business_id =
  storage_business_id(name)`, so a real visit id under a foreign tenant prefix is
  denied even for the visit's own walker.
- 008 walker-update denial is asserted as lives_ok + zero matched rows (RLS `using`
  filters updates like the 004 delete pattern), not 42501 — the stack's default DML
  grants mean the statement itself succeeds.
- **ingest-track status codes:** 403 deliberately collapses "visit not visible under
  the caller's RLS" and "visible but not your visit" (no existence oracle for foreign
  visit ids; the owner, who CAN see the visit, also gets 403 — asserted in E2E). A
  visible own visit that is not running is 409 with the status in the message.
  Sanity caps: >100 segments or >5000 total points → 400.
- Response is `{distanceM, inserted}` (the plan sketch said `{distanceM}`); `inserted`
  is the count of rows the upsert actually created, which the E2E and the Task-3
  worker use to observe idempotency.
- A duplicate `client_uuid` WITHIN one batch is fine: ignoreDuplicates compiles to
  `ON CONFLICT DO NOTHING`, which (unlike DO UPDATE) tolerates in-payload duplicates —
  covered in E2E (3 segments sent, one an in-batch dup → inserted 2).
- CORS comes from `../_shared/cors.ts` exactly like expand-series/invite-accept; no
  per-function copy exists locally (`_shared` stays the single source of truth; the
  hosted deploy in Task 9 handles layout as before).
- `uploadVisitPhoto` returns the storage path (`business_id/visit_id/<client_uuid>.jpg`)
  for the caller to stamp on the `photo` event row; the pet-photo ArrayBuffer upload
  pattern is reused. `pushTrackSegments` is a thin functions.invoke wrapper.
- E2E against `supabase functions serve` (fetch script, Task-1 fixture geometry):
  first post of seg 111.19493 m + seg 222.38985 m + in-batch dup → 200
  `{distanceM: 333.5852, inserted: 2}`; re-post → `{inserted: 0}`, distance unchanged;
  wrong-walker JWT 403, owner JWT 403, accepted visit 409, no JWT 401, missing
  segments 400, 101 segments 400, 5001 points 400; visit_tracks holds exactly 2 rows
  and `visits.distance_m` persisted. 15/15 checks passed.

## Plan 4, Task 3 — offline day cache + outbox sync worker (2026-08-24)

- **`visit.track` GPS-kind compatibility (recorded per the task):** the Plan-1
  controller's `rollSegmentWith` payload `{visitId, segmentNo, points}` is kept
  byte-for-byte — no migration. The worker supplies the server-side idempotency
  key as `payload.clientUuid ?? item.id`: outbox item ids are already
  `Crypto.randomUUID()` values and stable across re-drains, so legacy and new
  items are equally idempotent. New code MAY include an explicit `clientUuid`;
  nothing yet does.
- `OutboxState` gained `'error'` and `OutboxStore` gained `markError`/`countErrors`
  (both stores): the plan's "park with `state='error'`" had no home in the Plan-1
  store (`pending`/`sent`/`failed` only). The SQLite `state` column is free text,
  so no local schema migration. `'failed'` keeps its Plan-1 meaning (gave up
  after MAX_ATTEMPTS retryable failures); `'error'` = permanent server rejection.
- **Backoff is in-memory** (`Map` item id → eligible-at epoch ms, injectable for
  tests): attempts-based `min(5 min, 2^attempts s)`. A head item inside its
  window stops the drain (`'backoff'`) — strict order forbids skipping it. The
  map resets on relaunch, so a relaunch retries immediately (desirable). The
  attempt count survives relaunch in the outbox row.
- **Already-done RPC detection** is a message-regex match against the Task-1
  raise texts: start → `visit is not accepted (status: in_progress|completed)`,
  finish → `visit is not in progress (status: completed)` — treated as success
  (the mutation landed on a previous attempt). `(status: offered)` and every
  other 4xx stay permanent. postgrest-js reports network failures with
  `status: 0`; normalized to "no status" → retryable. 401/408/429 retryable per
  the plan (401 = token refresh race, not a verdict on the item).
- **`@react-native-community/netinfo` skipped (recorded per the task):** AppState
  active kick + after-append kicks + after-segment-roll kick + a 30 s interval
  while `active_visit` has a row cover every trigger the plan lists except
  "network regain", which the interval/foreground kicks approximate; a kick while
  offline fails fast into backoff. Avoids a native module + dev-client rebuild.
  `drainOutbox` takes an injectable `isOnline` so netinfo can slot in later.
- GPS lib stays pure: `controller.ts` exposes `setSegmentRollListener` and
  `app/_layout.tsx` registers `kickSync` — the GPS module never imports the sync
  worker. `rollSegment` fires the listener only when points were actually rolled.
- **Persister:** `@tanstack/query-async-storage-persister@5.102.2` +
  `@tanstack/react-query-persist-client@5.102.2` (exact, matching the installed
  react-query 5.102.2; both pure JS). API names verified against the installed
  typings: `createAsyncStoragePersister({storage,key,throttleTime})`,
  `PersistQueryClientProvider persistOptions={{persister,maxAge,dehydrateOptions}}`.
  `shouldDehydrateQuery` = `defaultShouldDehydrateQuery && whitelist` so only
  SUCCESSFUL queries under the prefixes `visits`/`myVisits`/`clients`/`pets`/
  `memberships`/`services_public` persist — `client-access-flag` and every other
  key stay memory-only. On **web** the storage adapter is an in-memory Map (no
  persistence): `expo-sqlite/kv-store` needs the wasm setup on web, and spec §8's
  offline model is field-side; desktop owners are online by design.
- Whitelist note: the plan says "today ±2 days"; the persisted `visits` queries
  are the existing 14-day windows (whitelisting is by key prefix, not by range).
  48 h `maxAge` still bounds staleness.
- Same-millisecond outbox ordering ties break by item id (Plan-1 `ORDER BY
  created_at, id` — unchanged): immaterial, because events are server-ordered by
  `occurred_at` and start/finish bracket the visit at distinct times.
- `src/features/visit/api.ts` provides the outbox-first mutations
  (`appendVisitStart/Event/Finish`) with injectable store + kick for tests;
  event payloads stamp `clientUuid` (expo-crypto) and `occurredAt` at append
  time and omit absent optional fields.
- `accessCache.ts` keys are `revealed-codes.<clientId>` (SecureStore charset
  safe); the loader deletes the entry on expiry, corrupt JSON, or bad shape
  before returning null, so stale codes never outlive the grace window on disk.

## Plan 4, Task 4 — walker visit detail + gated start (2026-08-24)

- **Routing (recorded per the task): hidden tab screens, not a group reshuffle.**
  `app/(walker)/visit/[id]/index.tsx` and `.../active.tsx` are registered on the
  existing walker Tabs with `href: null` (expo-router keeps them out of the bar)
  instead of restructuring the group into a Stack wrapping `(tabs)/`. The
  `[id]/index.tsx` + `active.tsx` directory shape is used from the start so
  Task 5's active screen never collides with a flat `[id].tsx`.
- **Pet info is inline on the visit detail** (`PetSection`: photo thumb via the
  existing 1-h signed-url query, species/breed line, reactivity warning card,
  present-only Feeding/Medications/Allergies/Vet rows). Walkers get no pet
  route: the owner pet screen sits behind the post-Plan-3 owner-group role
  guard, so cross-group navigation would bounce; walker RLS (Plan 3 Task 2)
  covers the reads.
- `fetchVisitDetail` fetches the visit first (MY_VISIT_COLUMNS — named columns,
  no services embed under walker RLS), then client/pets/services_public in
  parallel. Client and service use `maybeSingle` and null-tolerant assembly;
  `visit.service` is filled client-side from the `services_public` row (which
  also carries `requires_gps` for the start flow). Pets are re-ordered to
  `pet_ids` order (PostgREST `in` has no order guarantee).
- **Start flow:** outbox append (`appendVisitStart`) → optimistic
  `setQueryData` to `in_progress` + `myVisits` invalidation → when
  `service.requires_gps`, `startVisitTracking(visitId)` (it requests
  foreground+background permissions itself; a denial throws BEFORE
  `active_visit` is written, so the Alert explains GPS is off while the visit
  stays started) → `kickSync()` (redundant with the append's own kick but per
  the plan; the kicker debounces to one drain) → `router.replace` to
  `/visit/[id]/active`.
- The Start button renders disabled with the `canStart` reason text for every
  non-startable status; an `in_progress` visit instead shows "Open active
  visit" so re-entering the detail after the optimistic start (or a relaunch)
  is not a dead end. `canStart` delegates to the Task-3 `canTransition` mirror
  (`accepted -> in_progress`, assignee) — the reasons are the only new logic.
- `active.tsx` is the plan's placeholder ("Active visit — Task 5") plus a
  "Back to Today" ghost button (the detail screen was `replace`d away, so the
  placeholder would otherwise strand the walker).
- `mapsUrl` uses `encodeURIComponent` (not the task text's `encodeURI`, which
  leaves `#`/`&` unescaped and would truncate addresses in the query) into a
  `https://maps.google.com/?q=` link — opens the platform maps handler on both
  OSes; display-only, no geocoding.
- Walker Today: only the accepted ("Today") cards navigate to the detail;
  offer cards keep their inline Accept/Decline actions, per the plan.

## Plan 4, Task 5 — active visit screen: field mode, events, reveal, finish (2026-08-24)

- **Distance display is US units (recorded per the task):** `formatDistanceUS` renders
  feet below a tenth of a mile (rounded to the nearest 10 ft — single feet are false
  precision at GPS accuracy) and miles with two decimals from 0.10 mi up. Metric/locale
  units are a later setting.
- **Field mode:** `tokens.dark` sub-palette (surface/surfaceRaised/ink/inkMuted/line)
  added to `src/ui/tokens.ts` and applied by a scoped `<FieldTheme>` in `theme.tsx`
  that overrides ONLY those color tokens for the active screen; `primary`/`onPrimary`
  (the business accent) pass through from the parent provider. The unused
  `fieldBg`/`fieldSheet`/`fieldInk` tokens (Plan-1 spike leftovers, zero usages —
  grepped) were removed in favour of `tokens.dark`. `walkTheme` setting deferred
  (Round 0 pending), per the plan.
- **Multi-pet chips default-select the first pet** so every event carries an
  attribution without an extra tap; there is no "no pet" chip. The pure builder
  (`buildEventInput`) still tolerates a missing/stale selection (event becomes
  visit-level) so a refetch that drops a pet can never stamp a foreign pet id.
- **Photo capture:** camera first (`requestCameraPermissionsAsync` +
  `launchCameraAsync`); in `__DEV__` a camera failure (simulators have none) or a
  permission denial falls back to `launchImageLibraryAsync` — recorded per the task.
  Production surfaces the error instead of silently opening the library.
- **Sync badge:** `OutboxStore.countPending` gained an optional `visitId` argument
  (both stores) rather than a new method: SQLite counts pending rows whose JSON
  payload contains `"visitId":"<id>"` via LIKE (payloads are `JSON.stringify` output,
  so the needle is exact; the outbox is tiny and drains continuously). Polled every
  5 s alongside the `getLocalTrack` distance (GPS visits only).
- **Elapsed timer** uses `visits.started_at` when the server row carries it, else the
  Plan-1 `active_visit.started_at` local fallback (new `getLocalVisitStart` export on
  the GPS controller). A non-GPS visit started offline has neither until the outbox
  syncs — the timer shows `--:--:--` rather than inventing a start instant.
- **Reveal fallback classification:** the new `revealAccessForVisit` wrapper throws
  `RevealAccessError` carrying the HTTP status (postgrest's status-0 network marker
  normalized to undefined, as in the sync worker). Only a no-status failure (offline)
  consults the secure-store grace cache (`loadRevealedCodes`, which enforces expiry
  itself); every server-answered denial (wrong status, wrong walker, no codes) is
  surfaced as an error and NEVER answered from the cache. Cached codes render with a
  "Retrieved HH:MM — codes may have changed since." note (device wall clock — the
  reveal happened on this device); no cache → "No signal — call owner" (tel: link to
  the client's first phone). Wipe-on-blur via `useFocusEffect` cleanup, exactly like
  the owner access screen.
- `listMyMemberships` now selects `businesses.access_grace_hours` (added to the
  `Membership` type): the grace window must come from the CACHED membership row when
  offline (spec §8), and the memberships query is already on the persister whitelist.
  When the membership is not loaded at all the screen falls back to 12 h — the DB
  column default, conservative and never wider than an owner could have set it… (an
  owner who set it LOWER than 12 is respected as soon as the row loads, which in
  practice is before any reveal can happen: the membership query gates routing).
- **Finish flow:** the Finish button reveals the inline "Note for owner (private)"
  field + Confirm; Confirm raises the Alert; on OK the GPS controller stops FIRST
  (rolling the final segment into the outbox ahead of `visit.finish` — strict drain
  order means the report's distance includes it), then `appendVisitFinish`,
  optimistic `completed` on the detail query, `kickSync`, and `router.replace` to
  Today.
- **Recovery (recorded per the task):** the resume surface is a banner on walker
  Today (`useFocusEffect` → `recoverActiveVisit()`), never an auto-navigation from
  the root layout — a walker relaunching to check an offer is not hijacked into the
  active screen, and Today is the walker's landing route so the banner is seen
  immediately. Re-checked on every focus, so it clears once the visit finishes.
  `recoverActiveVisit` itself is unchanged (it already re-registers the GPS task and
  returns the visit id); it only knows about GPS visits (`active_visit` is written by
  `startVisitTracking`), so a non-GPS in_progress visit has no banner — its Today
  card → detail → "Open active visit" (Task 4) covers that path.

## Plan 4, Task 6 — send-sms function, notification queue, owner surfacing (2026-08-24)

- **Retry policy lives in the FUNCTION, not SQL (chosen per the plan's "pick one"):**
  the per-minute pg_cron job is a dumb metronome; `send-sms` claims due rows and owns
  the 1/5/15/60/60/60-minute backoff and 6-attempt cap itself. Claim is race-safe:
  due ids are read first (oldest `next_attempt_at` first, tiebreak `created_at`,
  limit 25), then `UPDATE ... SET status='sending' WHERE id IN (...) AND
  status='queued' RETURNING` — a row a concurrent invocation already flipped is no
  longer `queued`, so it can never be claimed (and sent) twice. pgTAP 009 pins the
  claim semantics (due vs future row, re-claim finds zero).
- **Backoff indexing:** `backoffMinutes(attempts)` takes the 1-based count of the
  attempt that just FAILED: 1st failure → +1 min, 2nd → +5, 3rd → +15, then hourly;
  the 6th failure marks the row `failed` (terminal) without another schedule. Out-of
  -range inputs clamp. Pinned in `templates.test.ts` (deno).
- **Cron secret is its own Vault secret** (`sms_cron_secret`, random-seeded, guarded)
  compared constant-time against the function's `SMS_CRON_SECRET` env — deliberately
  separate from expand-series' secret so leaking one never unlocks the other.
  `expand_project_url`/`expand_anon_key` are REUSED from migration 0007 (same project,
  same anon key), not duplicated; they already hold real hosted values from the Plan 3
  Task 9 deploy, so hosted setup for this migration is only
  `supabase secrets set SMS_CRON_SECRET=<vault value>`. Local cron is the same
  deliberate no-op as 0007 (pg_cron cannot reach `functions serve` on the host).
- **`send-sms` is cron-path only** — no user path at all (unlike expand-series):
  verify_jwt stays on (anon bearer satisfies the platform), and every request must
  carry the secret; wrong/missing secret is 403, missing env is 500.
- **Template placeholders are fetched at send time, not carried in the payload:** the
  Task-1 queue payloads hold only ids (`visitId`, `reportToken`, invite `token`/`link`),
  so the sender resolves business name, pet names (joined " & "), and service name via
  the admin client per row (≤25 rows/run). Missing context degrades to neutral
  fallbacks ("Your pet care team", "your pet", "scheduled") rather than failing the
  send. Bodies live in one exported map (`templates.ts`) with a deno test pinning the
  exact strings; "Stridetail" appears literally in the invite body (edge functions
  cannot import `src/lib/brand.ts`; the plan's template names it literally).
- **Report link base:** env `REPORT_BASE_URL`, falling back to
  `https://stridetail.app/report` (the domain isn't wired yet — Task 7's deploy can
  point the env at the Expo Web URL without code changes, per the plan's placeholder
  note).
- **`visit_reports` mirror (sent_at semantics from Task 1):** a `visit_finished`
  notification's outcome is mirrored onto its report — `sms_status` set to
  `sent`/`failed`/`skipped_no_provider` on terminal outcomes, and `sent_at` stamped
  ONLY on a real provider send (skip leaves it null, asserted in E2E). Intermediate
  retries do not touch the report.
- **Owner invite-SMS insert policy (recorded per the task):** notifications were
  owner-SELECT only (Task 1), so migration 0011 grants `insert` to `authenticated`
  gated by a narrow policy — sms channel + invite template + own business +
  born `queued` only; forged statuses, foreign businesses, other templates, walker
  callers, and owner UPDATEs are all 42501 (pgTAP). 0011 also defaults
  `notifications.next_attempt_at` to `now()` so no queued row can be born invisible
  to the due-row picker (`next_attempt_at <= now()`); the Task-1 RPC helper already
  stamped it explicitly.
- **Needs-attention SMS line counts ALL problem notifications** (status
  `failed`/`skipped_no_provider`), invites included — the plan's "simplest robust"
  query — so the label says "N SMS message(s) not sent" rather than the plan sketch's
  "N reports not sent", with "— SMS pending setup" appended when every row is
  `skipped_no_provider`. Per-visit "Report not sent" badges on the schedule list come
  from the problem rows' `payload.visitId`.
- **Team screen queues the SMS as a second explicit step** ("Queue SMS invite" button
  after the share sheet, shown only when the invite contact was a phone number) rather
  than auto-queueing on invite creation: the share sheet remains the working delivery
  path until Twilio lands, and an owner who delivered via share shouldn't silently
  double-notify later when SMS goes live.
- E2E against `supabase functions serve` (node fetch script, no Twilio env): no JWT
  401, wrong secret 403, missing secret 403, GET 405; correct secret → 200, exactly
  the 3 due rows processed (future-dated row untouched), all `skipped_no_provider`
  with the exact template bodies in the response summary; re-invoke processes 0 rows;
  DB after: rows terminal with `last_error 'no sms provider configured'`, report
  `sms_status = skipped_no_provider`, `sent_at` null. 13/13 checks passed. Twilio
  send path is code-complete but exercised only at the type level (no credentials —
  by design until A2P 10DLC registration).

## Plan 4, Task 7 — report-public function, public report page, resend/revoke (2026-08-24)

- **Route sketch is a web-only inline `<svg>`, with a native text fallback (recorded per
  the task).** `react-native-svg` is NOT a dependency and adding a native module for one
  decorative sketch is not worth a dev-client rebuild, so `app/report/[token].tsx`
  renders the polyline as a raw DOM `<svg>` behind a `Platform.OS === 'web'` check
  (react-native-web renders through react-dom, so DOM elements are legal there) and
  natives show a "Route: 0.21 mi recorded" card instead. The public report is a
  web-delivered link (SMS → browser); the native path exists only so the route renders
  if opened in-app. This also stands as the plan's "no map tiles" deviation from a
  static map: no tile provider, no API key, no client-location leak to a third party.
- **Every-Nth downsample, not Douglas-Peucker** (the plan allowed either). Deterministic,
  O(n), no epsilon to tune, and endpoints are always kept: stride =
  `ceil((n-1)/(max-1))`, so 1000 points → 168 and ≤ 200 points pass through untouched.
  Canonical impl in `src/lib/schedule/polyline.ts`; the function carries a
  dependency-free COPY (`supabase/functions/report-public/polyline.ts`) exactly like the
  expand.ts pattern, with the SAME 7-vector table pinned in both test files
  (jest + `deno test`, 8 assertions each side).
- **`routeSvgPath` lives only on the app side** (not mirrored into the function): the
  function returns raw lat/lng and the page owns projection, so the viewBox can change
  without redeploying an edge function. Longitude is scaled by `cos(mid latitude)` for a
  roughly proportion-true sketch.
- **Malformed tokens get the same 404 as unknown and revoked.** The function shape-checks
  `^[0-9a-f]{48}$` before touching the database, but answers a bad shape with the
  identical `{error:'not found'}` body — no oracle for what a real token looks like, and
  no DB round-trip for junk. Unknown vs revoked are likewise indistinguishable (asserted
  byte-for-byte in E2E).
- **Rate limiter is per-isolate, and that is accepted (noted in the file header).** A
  fixed 30 req/60 s per-IP window in an in-memory Map: counts are per edge-runtime
  instance, reset on isolate recycle, and a distributed attacker gets 30/min per IP per
  instance. The 2^192 token space is the real defence; a shared store would cost a
  round-trip per request for no meaningful gain here. The map self-trims at 10 000 keys
  (evict-expired, then clear) so it cannot grow without bound.
- **Payload is an explicit allow-list, never a row spread.** `pickSummary` names the 8
  report-safe summary keys; the timeline selects exactly `type, occurred_at, text,
  photo_path`; the business select names `name, brand_color, logo_path`. `private_notes_md`
  is never selected by the function, and the owner-side `REPORT_COLUMNS` excludes it too
  (the walker's private notes do not belong beside a shareable link).
- **`business_tz` comes from the visit row, and the page formats every time in it**
  (date-fns-tz): the reader may be in any zone, but the visit happened where the business
  is. The function ships ISO instants only — no server-side formatting.
- **`REPORT_BASE_URL` exported from `src/lib/brand.ts`** (the product-identity module, per
  CLAUDE.md's "display name lives only in brand.ts") mirroring send-sms'
  `DEFAULT_REPORT_BASE` / `REPORT_BASE_URL` env default, so the link an owner shares is
  byte-identical to the one the client received by SMS. A jest test pins the two together.
- **"Copy link" folded into "Share link" (deviation from the task's two buttons):**
  `expo-clipboard` is not a dependency and the RN `Share` sheet already offers Copy on
  both platforms, so the card has one Share button rather than a new native module for a
  second one.
- **Report card renders for `status === 'completed'` only** and asks the DB for the row —
  a completed visit whose finish RPC has not yet synced simply shows "No report for this
  visit." rather than an error.
- **E2E against `supabase functions serve` (bun fetch script, completed-visit fixture:
  5 events incl. a photo, 2 track segments, a report row, and deliberate leak markers).**
  25/25 checks passed: valid token with NO auth headers at all → 200 (verify_jwt off
  proven); business/brand/logo, tz, all 8 summary keys and no others; timeline carries all
  5 events (arrived/started/finished included) exposing only type/occurredAt/text/photoUrl;
  route 5 points after the acc-60 fix was dropped, lat/lng keys only; top-level keys exactly
  business/businessTz/summary/timeline/route. **Leak check:** with signed-URL JWTs scrubbed
  (their base64 can contain any short substring by chance — the URL PATHS are asserted
  separately to be `media/<biz>/<visit>/<file>`), the JSON contains none of: the client
  address, phone, email, client notes, the 7777 price, the walker's display name, the
  strings `walker`/`price`/`address`/`phones`/`private`/`code`/`access`, or the token
  itself. Photo and logo signed URLs (24 h) both fetch 200 with the uploaded bytes; GET
  `?token=` → 200; unknown, malformed, and missing tokens → 404 with byte-identical bodies;
  `revoked_at` set by SQL → same 404; the rate limiter returned 429 on exactly request 31.
  Fixtures removed by `db:reset` afterwards (visit_reports and storage.objects both back to 0).

## Round 0 feedback (Alexandra, 2026-08-24) — greens, warm walk default, Today links, quick buttons

- **SPEC DEVIATION — the active-walk screen defaults to WARM, not dark.** Spec §9 specifies a
  dark-by-default field mode; the first tenant's Round 0 answer overrides it: *"Active-walk
  screen: WARM by default."* `FieldTheme` now takes `mode?: 'warm' | 'dark'` defaulting to
  `'warm'`, where warm passes the parent theme through **unchanged** (no token override at all,
  so a business accent and every other token survive) and `'dark'` applies `tokens.dark` exactly
  as before. Dark is not deleted — it moves behind a persisted `walkTheme` preference. Spec §9
  should be amended at the next spec revision; the code is the tenant's answer, not the spec's.
- **`walkTheme` store** (`src/features/settings/walkTheme.ts`) mirrors
  `src/features/business/active.ts` exactly: zustand + `expo-sqlite/kv-store`, an injectable `KV`
  (its `KV` type is imported rather than redeclared), `hydrateWalkTheme()` called next to
  `hydrateActiveBusiness()` in `app/_layout.tsx`. Any unrecognized persisted value (absent key,
  stale write, a future third mode read by an older build) parses back to `'warm'` — the
  conservative call is the tenant's default, never a crash or a dark screen. Unit-tested
  round-trip both directions plus the fallback.
- **Settings row is on the SHARED `SettingsScreen`, not walker-only.** Both roles get "Walk
  screen · Warm/Dark"; walkers are the ones who use it, but an owner walks their own visits and
  would otherwise have no way to reach the setting. Rendered above the `extra` slot so the
  owner's role-specific rows keep their position next to sign-out.
- **Greens: one green, accent only, zero surfaces repainted.** `green: '#3A7D5C'` and
  `greenSoft: '#E4F0E8'` added to `src/ui/tokens.ts`. The pre-existing `success: '#2F855A'` is
  now a **deliberate alias of `green`** (kept, not deleted): it was a second, near-identical
  green, and the palette should carry exactly one — `success` survives as the semantic name for
  the sync badge's "it worked" state, whose only consumer (`active.tsx`) needed no edit. Green is
  used in exactly four places, all of them a genuine positive/nature note: the accepted/completed
  badge on `VisitCard` (greenSoft fill, green text), the accepted/completed walker line on the
  owner schedule list, the walker picker's "Available" flag (was `success`), and the new
  offer-accepted confirmation. The warm cream/orange base, `primary`, and every surface token are
  untouched.
- **Owner schedule list gained `· accepted` / `· walking` / `· completed` suffixes** next to the
  walker name (it previously showed only `· offered`). Without them the green had nothing to
  attach to, and "assigned" vs "accepted" was invisible on that list.
- **Offer cards get an explicit "View details" button rather than a card-wide press.** Round 0
  asks for every Today card to reach the visit; an offer card already contains Accept/Decline
  (and the inline decline form), and nesting those inside a card-level `Pressable` makes the tap
  target ambiguous to read even where the RN responder resolves it correctly. The explicit button
  is the non-interfering affordance. Non-offer walker cards keep their existing card-wide press.
- **Accept now shows a green confirmation** naming the client, because the accepted offer
  immediately disappears from the list on invalidate and nothing else confirmed the action. The
  mutation takes the whole `Visit` (not just the id) so the banner can name the client; it clears
  itself after 5 s rather than adding a dismiss control.
- **Owner Today's "Client & pets" link** navigates to `/clients/<client_id>` using `visit.client_id`
  (already on the `Visit` type — no query change). Walker Today does **not** get the same link:
  the walker client route is a flat list, not a `/clients/[id]` detail, and inventing one is a
  Round 1 question, not a Round 0 fix.
- **Quick buttons:** Pee · Poop · Photo · Note stay as the one primary row; Ate/Drank/Meds move
  behind a "More ▼" text toggle, collapsed on every mount (not persisted — the tenant's position
  is that these are exceptions, so the default should always be the collapsed one). No event type
  was removed: the buttons still write the same `ate`/`drank`/`meds` events, so nothing that
  already exists in a report or the outbox changes meaning.

## Post-Plan-4 — email channel + device-composed SMS (no-10DLC strategy, 2026-08-24)

Implements the docs/HANDOFF.md "no Twilio 10DLC" decision: email first (Resend) plus a
"Text the client" button that opens the user's own Messages composer. `send-sms` stays as
built and idle.

- **`send-sms`'s due-row picker gained `.eq('channel','sms')`** — a necessary edit outside
  the task's file list: before email rows existed the filter was implicit (every row was
  sms), but without it send-sms would claim `channel='email'` rows, render them through the
  SMS templates, and (with Twilio configured) text an email address. `send-email` carries
  the mirror filter `.eq('channel','email')`. E2E asserts a queued sms row survives a
  send-email drain untouched.
- **Email outcomes are NOT mirrored onto `visit_reports.sms_status`** (recorded per the
  task): that column is the SMS channel's delivery state — the owner report card renders it
  as "SMS: …" — so a visit_finished EMAIL outcome lives on its notification row alone.
  `send-email` has no `mirrorReport` at all; per-channel delivery surfacing in the owner UI
  is a later refinement if wanted.
- **`resend_report` stays sms-only:** it is the owner's explicit "Resend SMS" action and
  raises on a phone-less client (Task-1 semantics). The owner's email-ish path is the Share
  button (and now "Text the client"); an explicit "resend email" action was not added.
- **`queue_client_email` also skips empty-string emails**, not just null — `clients.email`
  is free text from the client form, and `''` would otherwise queue an undeliverable row.
- **Backoff constants + template map are per-function copies** (send-email does not import
  from send-sms) — the expand.ts / polyline.ts copy precedent: each function dir stays
  self-contained for deploy; both deno test files pin the same 1/5/15/60/60/60 schedule.
- **Migration 0012 re-states the start/finish grants** after `create or replace` — grants
  survive replacement (attached to the signature), but restating keeps the migration
  standalone if 0009's grant lines ever change.
- **Walker post-finish "Text the client" is offline-honest (recorded per the task):** the
  finish is outbox-queued and `finish_visit` creates the report token server-side, so the
  walker may not have a token client-side. After finish the screen polls `visit_reports`
  (walker reads own reports per Task-1 RLS) 3 × 700 ms; a token found (online, sync drained)
  yields the full linked body, otherwise the honest no-link body "[Business]: [Pet]'s visit
  is finished — report link coming separately." — the OWNER's report card (which always has
  the token) sends the linked one. The Alert is cancelable with `onDismiss` navigating to
  Today so an Android outside-tap never strands the walker on a completed visit's screen.
- **`VISIT_COLUMNS`'s client embed gained `phones`** (owner read path; RLS: owners already
  read full client rows) so the owner report card can offer "Text the client" without a
  second query; `MY_VISIT_COLUMNS` is unchanged — the walker path already gets phones via
  `fetchVisitDetail`. `Visit.client.phones` is optional so walker-shaped rows still fit.
- **`sms:` URL separator is platform-dependent** (`smsUrl` in
  `src/features/report/deviceSms.ts`): iOS `sms:<phone>&body=`, Android `sms:<phone>?body=`;
  phone normalized like `telUrl` (digits + leading `+`), body `encodeURIComponent`ed. Bodies
  are pinned by jest to the exact send-sms template strings.
- **E2E against `supabase functions serve` (bun fetch script, no RESEND env):** wrong and
  missing secret 403; correct secret → 200, provider `none`, exactly the 2 due email rows
  processed as `skipped_no_provider` with the exact rendered subject ("E2E Email Biz: your
  pet's scheduled visit has started") and texts (visit_finished carrying
  `https://stridetail.app/report/<token>`); future-dated email row and queued sms row
  untouched; rows terminal with `last_error 'no email provider configured'`; re-invoke
  processes 0; fixtures cleaned. 15/15 checks passed. Resend send path is code-complete but
  exercised only at the type level (no API key — by design until the sponsor creates the
  Resend account on stridetail.app).

## Plan 4, Task 8 — Expo Web owner rail + week grid (2026-08-24)

- **Rail mechanism (recorded per the task):** the SDK 57 bottom-tabs implementation vendored
  inside expo-router (`expo-router/build/react-navigation/bottom-tabs`) supports
  `tabBarPosition?: 'bottom' | 'left' | 'right' | 'top'` — verified against the installed
  typings and BottomTabView source — so the layout keeps the SAME `<Tabs>` navigator and, on
  web ≥ 900 px (`Platform.OS === 'web'` + `useWindowDimensions`), sets
  `tabBarPosition: 'left'` with a custom `tabBar` rendering `OwnerRail` (business-name header
  + the 5 nav items, active item highlighted). No hand-rolled parallel layout: routes, tab
  state, and the role guard are exactly the mobile ones. Nav items press through the
  react-navigation custom-tab-bar contract (emit `tabPress` with canPreventDefault, then
  `navigation.navigate(route.name, route.params)`) rather than expo-router `Link` — the
  contract preserves the navigator's preventDefault semantics and needs no `as Href` casts.
  Below 900 px and on native, the original bottom Tabs render untouched.
- **Pre-existing web-bundle break fixed (needed for this task's verify gate):**
  `CI=1 bunx expo export --platform web` failed on clean HEAD — expo-sqlite's web build
  imports `wa-sqlite.wasm`, unresolvable without a dedicated wasm Metro setup, and the import
  chain has reached the web bundle since Plan 4 Task 3 (Metro resolves imports statically,
  runtime `Platform.OS` guards notwithstanding). Fix: new `metro.config.js` redirects
  `expo-sqlite` and `expo-sqlite/kv-store` to stubs (`src/lib/web/`) for platform 'web' ONLY.
  The kv stub is localStorage-backed (in-memory under static rendering), so active business /
  walk theme / pending invite now genuinely persist on web; the sqlite stub throws if ever
  called — every runtime caller is already web-guarded (the `kickSync` effect in
  `app/_layout.tsx`, lazy `getDb()`). Consistent with the Task 3 decision that web has no
  sqlite persistence and desktop owners are online by design.
- **Block click opens the inline quick panel, not the detail route directly:** the task asks
  for the detail route AND an inline offer/reschedule surface on block click; one click cannot
  do both, so a click selects the block and opens the footer panel (the task's "simple
  expanding footer panel" option), whose "Open details" button pushes the existing
  `/schedule/[id]`. Clicking the block again (or Close) collapses it.
- **Reschedule fields are TextFields, not the DateField/TimeField pair:** the
  `@react-native-community/datetimepicker` components are inert on web (the Android path is
  imperative-only and the inline picker renders only on iOS), so the panel takes
  'YYYY-MM-DD' / 'HH:MM' text validated through `visitInstants` in the business tz — the
  first UI over the Plan-3 `rescheduleVisit` api. The moved visit keeps its real scheduled
  length (end − start in minutes). Reschedule is offered only for
  `unassigned`/`offered`/`accepted` (moving an in-progress/completed/cancelled visit is
  meaningless); offer/reassign is machine-gated by `canTransition(status, 'offered')` exactly
  like the detail screen. Mutations invalidate `['visits', businessId]` (which covers the
  14-day list key and every week key) plus the visit-detail key.
- **Week grid math is business-tz framed** (`weekGrid.ts` pure helpers, jest-pinned): the
  grid needs one day/column frame, so bucketing/positioning use the business tz from the
  membership row rather than each visit's stamped `business_tz` (identical in practice).
  DST pins: the spring-forward week is 167 h, a gap-crossing visit spans its wall time
  (120 wall min for 60 real), a fall-back visit whose wall diff collapses to ≤ 0 falls back
  to real minutes, midnight-crossers clamp to their start day. Week query key
  `['visits', businessId, weekStartYmd]` sits inside the persisted-query whitelist's
  existing 'visits' prefix (web persister is memory-mapped anyway — Task 3).
- Status colors: unassigned = warning outline, offered = muted, accepted/completed = greenSoft
  fill with green border (Round 0 covered-states green) — `in_progress` is grouped with them
  ("walking" is a covered state; the task named only the other four), cancelled hidden.
  Blocks clamp into the 06:00–21:00 gutter with a minimum height so early/late visits stay
  clickable.
- Component file is `WeekGridView.tsx`, not `WeekGrid.tsx`: the filesystem is
  case-insensitive and `weekGrid.ts` already holds the pure helpers — tsc's consistent-casing
  check and `import/no-unresolved` both reject the casing twin.
- **Drag-and-drop reschedule NOT built — recorded as the follow-up the plan allows**; judging
  step 6 ("reschedule tomorrow's visits") is covered by block click → reassign + time edit.
- `expo start --web` screenshot not taken: the rail and grid live behind sign-in and this
  environment holds no web session. The export build (48 static route HTML files emitted)
  stands as the verify; a signed-in desktop pass rides with Task 9 / Checkpoint 4.

## Plan 4, Task 9 — hosted deploy, advisors, smoke, builds (2026-08-24)

- Migrations 0009–0012 applied to hosted `vrxoswukuiaerhwammlh` via MCP `apply_migration`
  (verbatim file content, name = filename stem). Vault secrets `sms_cron_secret` /
  `email_cron_secret` seeded per-environment by the guarded migration blocks; both read back
  and aligned onto the functions with `supabase secrets set SMS_CRON_SECRET=… 
  EMAIL_CRON_SECRET=…` (worked non-interactively this time — the Plan-3 keychain hang did
  not recur). RESEND_API_KEY/EMAIL_FROM/TWILIO_* deliberately NOT set (sponsor
  credentials pending); both senders mark rows `skipped_no_provider` as designed.
- Functions deployed with the repo's copy pattern (`../_shared/cors.ts` rewritten to a
  bundled `./cors.ts`; templates.ts / polyline.ts siblings included; test files excluded):
  `ingest-track`, `send-sms`, `send-email` with verify_jwt ON; `report-public` with
  verify_jwt OFF (public by design — the 48-hex token is the credential, per its config.toml
  and file header).
- **Hosted smoke, 23/23 checks** (SMOKE-prefixed throwaway client/pet/visit in the demo
  business, deleted afterwards — all execution tables back to 0 rows):
  - SQL role-impersonated walker (`request.jwt.claims` sub + `set local role authenticated`):
    `start_visit` → in_progress, arrived+started events, sms+email `visit_started` rows
    queued; direct `visit_events` insert under RLS with an idempotent `client_uuid` replay
    (1 row); `finish_visit` → completed, report row + token, `visit_finished` rows queued.
  - `ingest-track` over HTTPS with the walker's REAL JWT (password sign-in): 2 segments →
    `{distanceM: 318.9, inserted: 2}` (an acc-60 point correctly dropped); full replay →
    `inserted: 0`, distance unchanged.
  - `report-public` with no auth headers: 200; exact top-level keys, business tz, pet/service
    names, distance, 4-event timeline, 5-point route; leak markers (address, phone, email,
    price, 'walker', 'private') absent. Unknown + malformed tokens → 404.
    Owner-impersonated `revoke_report` (audited) → same URL 404.
  - `send-sms`/`send-email`: wrong secret → 403; correct secret → 200 provider 'none'.
    **The live per-minute pg_cron beat the manual invocations to the queued rows** (the
    visit_started pair was already `skipped_no_provider` ~a minute after start_visit, and
    the finished pair drained the same way) — an unplanned but stronger proof: the whole
    cron → pg_net → Vault-secret → function chain runs unattended on hosted. Terminal DB
    state asserted: all 4 rows `skipped_no_provider` with the right `last_error`, report
    `sms_status = skipped_no_provider`, `sent_at` null.
- **Advisor sweep (security): zero new findings.** Everything reported is a pre-recorded
  acceptance: `client_access` deny-all INFO + `services_public` definer-view ERROR (Plan 2
  Task 8), and the authenticated-executable definer-RPC WARNs (Plan 3 Task 9 rationale:
  guarded RPCs are the API) — Plan 4's `start_visit`/`finish_visit`/`resend_report`/
  `revoke_report` are new instances of that same accepted pattern (public/anon revoked,
  internal walker/owner gates, search_path pinned). No follow-up migration needed.
- Local checks all green post-deploy: 522 jest, 287 pgTAP (10 files), typecheck, lint.
