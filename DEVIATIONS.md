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
