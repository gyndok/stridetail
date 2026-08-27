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

## Today/navigation redesign, part A — unified visit screen + next-action resolver (2026-08-25)

- **Mount-point merge (recorded per the task):** BOTH visit routes —
  `app/(walker)/visit/[id]/index.tsx` and `app/(owner)/schedule/[id].tsx` — are now
  three-line wrappers re-exporting `src/features/visit/VisitScreen.tsx`. Both route paths
  keep working; the screen decides its blocks from the session, not the group: the
  execution block renders when `visit.walker_id === session userId` (isAssignee), the
  management block when the active-business membership role is `owner`, and an
  owner-assignee sees both. `PetSection` (walker detail) and `ReportSection` (owner
  detail) moved into VisitScreen intact, not rewritten.
- **Unified query key is `['visitDetail', id]`** (the walker detail's key — the start/
  finish optimistic updates in `active.tsx` and the outbox mutations already write it).
  The owner-side `['visit', businessId, id]` key is gone; `WeekGridView`'s quick-panel
  invalidation was retargeted to `['visitDetail', visit.id]` so grid reschedules still
  refresh the open detail screen. Neither key is on the persister whitelist — unchanged.
- **`fetchVisitDetail` verified to work under BOTH roles' RLS by reading the policies:**
  the visits read names columns (MY_VISIT_COLUMNS — price column grant holds for owners
  too), `clients`/`pets` resolve via the owner policies or the Plan-3 Task-2 walker
  visit-visibility policies, and the service comes from the `services_public` definer
  view (any member). Owner-only queries (`listActiveMembers`, `pickerContext` — both
  behind owner select policies on availability_rules/time_off) are gated with
  `enabled: isOwnerRole`, so a walker session never issues them. The report card's
  `clientPhone` now prefers the detail's full client row (walker path) and falls back to
  the owner embed's `phones`.
- **Cross-group active navigation:** the active screen exists only in the walker group,
  so Start/Resume navigate to the absolute group-qualified href
  `/(walker)/visit/[id]/active` from BOTH mount points (from the walker group this IS the
  current group's route; from the owner group it is the prescribed cross-group hop). The
  walker group has no role guard, so it renders fine for an owner; nothing depends on the
  walker-view banner (deleted in part B).
- **`nextVisitAction` (src/features/visit/nextAction.ts) follows the sponsor machine
  literally; `isToday` currently never changes the outcome.** The approved machine
  (offered+assignee→accept, accepted+assignee→start, in_progress+assignee→resume,
  unassigned+ownerRole→offer, completed→report ownerRole-only, cancelled→none) conditions
  nothing on the day, but the signature carries `isToday` per the design so the part-B
  card call sites compile and a future today-gate is a one-line edit here. Pinned in the
  48-case matrix test (test written failing-first). Real transitions (accept/start/offer)
  are double-checked against `canTransition` so the resolver can never drift ahead of the
  DB trigger; resume/report are navigation, no machine edge consulted.
- The unified screen gained a ghost Back button for the owner mount too (the old owner
  detail had no back affordance beyond the swipe gesture); owner_notes/decline-reason
  render once in the shared header rather than per-block. The "Walker: <name>" line is
  owner-only (it needs the roster query). Screens stay untested markup over tested
  helpers (established approach); the resolver carries the unit matrix.
- Both `today.tsx` files compile untouched (they import from `schedule/api`, not from the
  route files). Checks: 530 jest (45 suites), typecheck, lint all green.

## Today/navigation redesign, part B — up-next hero + single-mode navigation (2026-08-25)

- **DELETED: the walker-view banner** (`app/(walker)/_layout.tsx` restored to the plain
  Tabs version — no memberships lookup, no `SafeAreaInsetsContext` override, no banner
  Pressable). The redesign removes the mode concept entirely: an owner's own field work
  now lives on their OWN Today (hero + rest-of-day) and the unified visit screen, so
  there is no second mode to label. Contractors never saw the banner, so nothing changes
  for them. The banner shipped in exactly one build (recorded in PRD-CHECKLIST).
- **DELETED: the owner Today "My visits" toggle** (the button that pushed
  `/(walker)/today`). Same reason: the owner no longer visits the walker group at all —
  their next visit is the hero on their own Today, its execution path (Start → active
  screen) rides the part-A cross-group href. `resolveHome` still routes contractors to
  `/(walker)/today`; that group remains the contractor shell, untouched.
- **DELETED: the owner Today by-walker Team grouping** ("Today's visits" sections per
  walker). The business-wide picture lives in Schedule (list + web week grid);
  `groupTodayByWalker` stays exported and unit-tested in `schedule/api.ts` (no screen
  consumer right now) rather than being churned out and back if a business-wide Today
  strip returns. Owner Today no longer issues the `scheduleMembers` query at all.
- **"Soonest future accepted" read as "not already over"** (`pickUpNext`): accepted and
  offered candidates qualify while `scheduled_end > now` — a visit that should have
  started ten minutes ago is still the thing to do next, but one whose whole window
  passed unstarted is stale and never the hero. `in_progress` is exempt (it is running,
  however late) and always wins; ties break by soonest `scheduled_start`. Same
  "not over" rule keeps `restOfDay` to genuinely remaining visits. Pinned in
  `today.test.ts` (tests written failing-first).
- **Walker hero excludes `offered`** — the offers strip (kept, above the hero) already
  renders every offer with Accept/Decline, and the design names the walker hero as
  "next accepted/in_progress". The owner hero DOES take an offered visit (an owner can
  be offered a visit by... themselves force-assigning is direct-accept, but a declined
  re-offer round-trip can land one) with Accept big + Decline as the small secondary
  (inline reason form — Alert.prompt is iOS-only, the Task 8 precedent).
- **Hero Start fetches `requires_gps` per-visit from `services_public`**
  (`serviceRequiresGps`, prefetched via useQuery the moment the action resolves to
  'start'). When the flag is unknowable at press time (offline, nothing cached) Start
  assumes GPS: recording an unneeded route beats silently losing a required one. The
  start flow otherwise mirrors the unified visit screen's `onStart` exactly — outbox
  `appendVisitStart` first, optimistic `['visitDetail', id]` status, list invalidations,
  GPS-permission failure alerts but never blocks the start, `kickSync`, then the part-A
  cross-group active href. Navigation is `router.push` (not the visit screen's
  `replace`) so back returns to Today.
- **`InlineNextAction` (rest-of-day cards) renders only accept/start/resume** — the
  single actionable kinds for one's own upcoming visits. offer/report/none render
  nothing on a card; those flows live on the visit screen. Each card gets its own
  mutation runner (error text renders inside that card).
- **Owner rest-of-day cards keep the Round 0 "Client & pets" ghost button** — the design
  prescribes "VisitCards with their inline next action" and Round 0 asked for the
  client/pet profile one tap from Today; removing it would regress accepted tenant
  feedback. The walker cards keep their card-wide press to the visit screen (no client
  route exists in that group — Round 0 note).
- Walker Today's recovery banner ("A visit is still in progress", from
  `recoverActiveVisit`) is kept alongside the hero: the hero needs the server row in
  the query window, the banner works from the local `active_visit` marker even when the
  fetch fails — "remove nothing else" per the design. When both render they offer the
  same Resume.
- Hero pet names come from the existing `listPetNames` (schedule/report.ts) under a new
  `['visitPetNames', visitId]` key; empty pet list skips the query.
- VisitCard's new optional `action` prop renders between the walker line and `children`;
  every existing call site passes nothing and is pixel-identical.
- "Up next" with no qualifying visit renders a one-line muted empty state (the design
  says the hero card is for the next visit; a silent gap read as a bug in testing).
- Checks: 539 jest (45 suites — 9 new helper tests), typecheck, lint all green. Device
  pass rides the next checkpoint; OTA pending (PRD-CHECKLIST polish note).

## SMS surfacing retired — email-only queueing and delivery status (2026-08-25)

Sponsor request: the owner Today carried a permanent "8 SMS messages not sent — SMS
pending setup" needs-attention card. SMS (Twilio) was dropped for slice 1
(docs/HANDOFF.md); email (Resend) is live. Migration `20260824000013_sms_dormant.sql`
retires the sms channel's user-facing noise while keeping the whole sms pipeline
deployed-but-dormant for a possible toll-free future.

- **start_visit/finish_visit queue EMAIL only** (0012 bodies minus the
  `queue_client_sms` calls). `queue_client_sms` itself stays in place as the
  toll-free re-enable hook; existing sms notification rows are kept as history.
- **resend_report now re-queues the visit_finished EMAIL** (0012 had left it
  sms-only). Precondition flips from "client has no phone number on file" to
  "client has no email on file"; audit action stays `report.resend`.
- **`send-sms-every-minute` pg_cron job unscheduled** — it POSTed the function
  sixty times an hour to drain zero rows. Function, templates, and
  `sms_cron_secret` stay deployed; the re-schedule one-liner is commented at the
  bottom of 0013 (full body in 0011). NOTE: 0013 must also be pushed to HOSTED
  for the cron stop + RPC change to take effect there.
- **listProblemNotifications excludes channel='sms' AND
  status='skipped_no_provider'** (server-side `.or()`): a dormant-channel skip is
  the expected state of history rows, not a problem. A real FAILED sms — if the
  channel ever returns — still surfaces, as do all email problems.
- **`smsIssueLabel` → `notificationIssueLabel`**, channel-aware: all-email rows
  read "N emails not delivered", any other mix falls back to
  "N notifications not delivered". The "pending setup" wording is gone from the
  strip (with the exclusion rule it would only ever describe email-provider
  misconfiguration, which the report card line still names).
- **Report card delivery line now reads the EMAIL notification row**, not
  `visit_reports.sms_status`: new `getReportEmailStatus` fetches the latest
  channel='email' visit_finished row for the visit (owner-select RLS). Sent time
  is the notification's sender-stamped `updated_at` (send-email deliberately does
  not mirror onto visit_reports — recorded in the email-channel entry). Null row
  renders "Email: not sent — client has no email on file". "Resend SMS" →
  "Resend email" (same RPC); "Text the client" (device-composed sms:) and
  Share/Revoke unchanged. `REPORT_COLUMNS` drops `sms_status` (column itself
  stays in the schema, dormant).
- pgTAP: 007 fixtures gain a client email; start/finish/resend assertions flip to
  email rows plus two new "queues NO sms row" checks (plan 74 → 76). 010's matrix
  now asserts no sms row even with a phone on file; finish queues exactly one
  (email) row. 009 unchanged beyond comments — its queue rows were already seeded
  directly, and the claim/RLS mechanics stay live for the invite path and the
  toll-free future.
- Checks: 542 jest (45 suites), typecheck, lint, 289 pgTAP (10 db suites) all green;
  `cron.job` on the reset local stack shows only `expand-series-nightly` +
  `send-email-every-minute`.

## Plan 5, Task 1 — billing schema (2026-08-25)

- **`invoice_items.kind` is `text` with a check constraint** (`visit`/`manual`/
  `deposit_credit`), not a fifth enum: the task's enum list (invoice_status,
  deposit_status, payment_method, payout_status) is read as exhaustive and the
  spec §3 table names the values inline.
- **Sanity constraints added beyond the spec's column list** (Plan 3 Task 1
  precedent): `unique (business_id, number)` on invoices (the Task-2 for-update
  allocator makes duplicates impossible; the index makes that a hard invariant),
  `payout_percent between 0 and 100` (spec gives only `numeric(5,2) default 0`;
  the pgTAP brief asks for bounds sanity), `amount_cents > 0` on deposits and
  payments (invoice_items/payout_items stay signed — manual discounts and payout
  adjustments are negative lines by design), and
  `period_end >= period_start` on payout_statements.
- **Spec `?` convention read as nullable; unmarked columns are `not null`** —
  so `issued_on` is `not null` (no default: Task-2 `create_invoice` stamps it,
  and a `current_date` default would encode the server zone against the
  no-hardcoded-tz rule), while `due_on`/`method`/`received_on`/`visit_id` are
  nullable.
- **FK delete behavior chosen where the spec is silent:** client/business
  deletion cascades (matches visits); `invoice_items.visit_id` and
  `payout_items.visit_id` are `on delete set null` (deleting a visit must not
  destroy a billing line — the description survives, and the unique slot frees);
  `deposits.applied_invoice_id` is `on delete set null`;
  `payout_statements.walker_id` has no action (plain FK, `visit_series.walker_id`
  precedent).
- **The transition guard runs its who-check before the matrix**, so a non-owner
  attempting ANY status change (legal-shaped or not) gets
  `only the business owner can change invoice status`, and only owners/elevated
  callers ever see `illegal invoice status transition: % -> %`. Elevated
  (`auth.uid()` null) skips the who-check only — the matrix always applies
  (asserted in the pgTAP matrix with a null actor).
- **`businesses.payment_instructions_md` / `invoice_next_number` are readable by
  walkers** via the pre-existing whole-table businesses grant + member select
  policy. Accepted: the instructions text is shown on the PUBLIC invoice page by
  design, and the counter is not pricing; column-restricting businesses would
  break every `businesses(...)` embed for no secrecy gain.
- pgTAP grew from the plan's four bullet lines to 60 assertions: enum labels,
  defaults + bounds, owner CRUD under RLS, invoice-once/payout-once unique
  probes, kind/amount/period check probes, the walker/other-walker/cross-owner/
  anon isolation matrix (incl. finalized-own visible, draft-own and others'
  invisible, zero-row write attempts verified as no-ops), the full 12-pair × 4-actor
  invoice transition matrix (005-style temp-function loop), and aggregated
  grant assertions for authenticated/anon/service_role plus the trigger
  function's execute revoke.

## Plan 5, Task 2 — billing RPCs (2026-08-25)

- **Date-range reading (recorded per the task):** `create_invoice(p_from, p_to)`
  filters on the visit's LOCAL calendar date —
  `(scheduled_start at time zone business_tz)::date` — not a bare
  `scheduled_start::date`, which would encode the server zone (UTC on hosted)
  against the no-hardcoded-tz rule. Pinned in pgTAP with a 2026-08-21 03:00 UTC
  visit (Aug 20, 22:00 in America/Chicago) that a [Aug 20, Aug 20] range must
  catch. Bounds are one-sided when only one date is given. `issued_on` is
  likewise stamped as today in the business tz.
- **Empty drafts allowed (recorded per the task):** zero eligible visits still
  creates an empty draft invoice — the owner adds manual lines (covers
  deposit-only or ad-hoc bills); no deposit ever applies against a zero
  subtotal.
- **Deposit auto-apply (plan's whole-deposit rule, recorded):** held deposits
  are taken oldest first (`received_on asc nulls last, created_at, id`,
  row-locked), WHOLE deposits only, and the loop **stops at the first deposit
  that no longer fits** the remaining subtotal — skipping ahead to a newer,
  smaller deposit would violate oldest-first. Each application writes a
  `deposit.apply` audit row; releases on void write `deposit.release`
  (spec §2.7 "deposit transitions" audited).
- **Numbering-lock test approach (recorded per the task):** a true concurrent
  probe is impractical — dblink connections could not see the test
  transaction's uncommitted fixtures. Instead pgTAP asserts (a) two sequential
  creates take consecutive numbers with the counter advancing, and (b) the
  function body contains the `for update` lock via `pg_get_functiondef`
  (pgTAP has no `like()` function — asserted as `ok(... like ...)`).
- **`remove_invoice_item` is manual-only** (task direction): visit lines and
  deposit credits leave via `void_invoice`. Line edits are allowed while
  draft OR sent; a paid invoice's lines are frozen.
- **`send_invoice` prechecks `status = 'draft'` explicitly:** a sent→sent
  update does not change status, so the Task-1 transition trigger would no-op
  and a re-send would silently rotate the live public token. The precheck
  raises `invoice is not a draft (status: sent)` instead.
- **`record_payment` on a paid invoice is allowed** (extra payments recorded
  as history) and the audit meta carries `overpaid: true` whenever
  payments exceed the items total; the sent→paid flip writes its own
  `invoice.paid` audit row (spec §2.7 names "paid" as an audited event).
  A payment needs an explicit received date (clear raise, not a 23502).
- **`void_invoice` also revokes the public link** (`revoked_at` stamped when
  a `public_token` exists): a voided invoice must not stay payable on the
  public page. Payments rows stay attached (history); the RPC prechecks
  draft|sent so a paid invoice gets `invoice cannot be voided (status: paid)`
  rather than the trigger's transition message.
- **`record_deposit` lands in `held`** (recorded per the task): v1 records
  deposits already received; the `requested` state is reserved for a future
  request-first UI. `forfeit_deposit`/`refund_deposit` are held-only.
- **Grants: `authenticated` only, not `service_role`** (Plan 3 Task 1
  precedent — the `is not true` guards need a JWT sub). `invoice_totals` is a
  definer read helper (stable, owner-guarded) for the app's derived totals.
- pgTAP (012) runs as superuser with `request.jwt.claims` driving the actor
  (011-matrix pattern — definer RPCs bypass RLS, so the is_owner guards are
  what is under test); grants get `has_function_privilege` assertions plus a
  live anon 42501 probe. 90 assertions: range/local-date picking,
  descriptions, numbering, whole-deposit auto-apply, totals with negative
  manual lines, send token + `invoice_ready` queue payload + no-email skip,
  partial/completing/over payment, void releasing visit + deposit with
  re-invoice pickup, held-only deposit exits, 10 RPCs × walker/cross-owner
  guard matrix, and an aggregated per-action audit count with money-amount
  meta spot checks.

## Plan 5, Task 3 — billing api, owner tab, invoice list (2026-08-25)

- **`statusChip(invoice, totals, now)` — not the sketched `(invoice, balance)`:**
  "partially paid" needs 0 < payments < total, which a lone balance number
  cannot distinguish from no payment; `now` is injected for the overdue check
  (testable, no clock reads in pure code). Precedence pinned in tests:
  paid (green) > void (muted) > overdue (danger) > partially paid (warning) >
  stored status (neutral).
- **Balance is never floored (recorded per the task):** a negative balance is
  a real credit from over-payment and renders as `-$X.XX`; the summary strip's
  unpaid total sums TRUE balances, so an over-paid sent invoice reduces it.
- **`isOverdue` uses the DEVICE-local calendar day** (Plan 2 Task 7 document-
  expiry precedent): day-granular display-only logic on `due_on` (a date
  column with no zone). Due today is not overdue; paid/void never are; a
  draft past its due date IS (needs attention, not silence).
- **"Unpaid" = status `sent` only**, in both the summary strip and the filter
  chip: drafts are not billed yet and have their own chip/filter, matching
  the plan's All / Unpaid / Draft split.
- `listHeldDeposits` orders `received_on asc nulls last, created_at` — the
  same order `create_invoice` consumes deposits, so the ledger reads as the
  queue. `groupHeldDeposits` groups per client (name-sorted) for Task 4's
  deposits screen.
- No `invoice_totals` RPC wrapper: the plan computes list totals client-side
  from the `items`/`payments` amount embeds; the definer helper stays in the
  DB for whenever a server-side figure is actually needed.
- The billing screen reuses `Chip` from `src/features/schedule/Chip` (generic
  pill, already used by two schedule screens) rather than duplicating it.
- Tab registration: `<Tabs.Screen name="billing" />` added between Team and
  Settings. **Web rail confirmed by reading `app/(owner)/_layout.tsx` +
  `OwnerRail`:** the desktop `tabBar` maps `state.routes` into rail items
  labeled from `options.title`, so the sixth tab appears on the rail with no
  OwnerRail change.
- `/billing/new`, `/billing/[id]`, `/billing/deposits` pushes use `as Href`
  casts — the routes land in Task 4 (Plan 2 Task 4 precedent; 404 until then).

## Plan 5, Task 4 — invoice creation, detail, payments, deposit ledger (2026-08-25)

- **Create-flow simplification (recorded per the task): no per-visit
  checkboxes.** `create_invoice` takes a date RANGE, which cannot express an
  arbitrary unchecked subset, so the eligible visits render read-only and a
  From/To `DateField` pair filters the preview live and feeds the RPC. The
  pair defaults BLANK (= no limit, i.e. spanning all uninvoiced) rather than
  prefilled min/max — blank and min/max select the same set, and blank keeps
  "everything" visibly the default. Preview and draft therefore always agree.
- **Preview amounts are re-computed, not read:** `visits.price_cents_snapshot`
  has no client select grant (Plan 3 Task 1 column rule — the owner included),
  so `eligibleVisitLine` re-derives the amount via the same
  `priceSnapshotCents(service, pet_count)` math that stamped the snapshot,
  from the owner-readable `services` embed. If a service price changed since
  booking the estimate can drift; the RPC always writes the stored snapshot,
  and the totals card says "estimated" for this reason.
- **Service names/prices come from `services`, not `services_public`
  (recorded per the task):** this is an owner-only screen and the owner select
  policy exposes full service rows including prices (Plan 3 Task 5 precedent);
  `services_public` exists for walkers.
- **`listUninvoicedVisits` mirrors the RPC's NOT EXISTS client-side:**
  PostgREST cannot express the anti-join in one query, so it fetches the
  business's invoiced visit ids (`invoice_items` where `visit_id is not null`)
  alongside the completed client visits and filters in code. Both reads are
  owner-RLS'd and business-scoped.
- **`newInvoice.ts` mirrors `create_invoice` and is pinned to it in tests:**
  `visitLocalDate`/`filterByLocalDateRange` reuse the `formatInTimeZone(...,
  business_tz, 'yyyy-MM-dd')` pattern from schedule/api (the RPC's
  `(scheduled_start at time zone business_tz)::date`); `eligibleVisitLine`
  mirrors the `'Dy, Mon FMDD'` description via `'EEE, MMM d'`; and
  `depositPreview` implements stop-at-first-misfit with the pgTAP
  2500/2000-vs-3000 vector pinned (2500 applies, 2000 no longer fits, loop
  stops even though a later deposit would fit). `eligibleVisitLine` takes the
  embedded visit row instead of the plan's `(visit, serviceName)` pair — the
  embed already carries the name and the prices.
- `parseSignedDollars` wraps `dollarsStringToCents` with an optional leading
  minus for manual lines (the services helper rightly rejects negatives for
  price fields); `manualLineError` mirrors `add_invoice_item`'s prechecks
  (blank description, unparseable, zero) so failures surface before the RPC.
- **No "Resend email" on a sent invoice (recorded per the task):**
  `send_invoice` is drafts-only (a re-send would otherwise rotate the live
  token — Task 2 rule) and no invoice-resend RPC exists. V1 re-notifies via
  Share link + the device-SMS "Text the client" button; a proper resend (queue
  another `invoice_ready` email without touching the token) is Plan 6 polish.
- **No standalone Revoke on invoices (recorded per the task):** `void_invoice`
  already stamps `revoked_at` and kills the public page; unlike reports there
  is no revoke-but-keep-payable use case worth a v1 RPC.
- `invoiceSmsBody` added to `deviceSms.ts` WITHOUT a send-sms template
  counterpart: the sms channel is dormant and invoices notify by email only,
  so the body is defined app-side; keep its wording aligned with the
  `invoice_ready` email template when Task 5 writes it.
- `INVOICE_BASE_URL` added to `src/lib/brand.ts` and `invoiceLink()` to
  `newInvoice.ts`, mirroring the `REPORT_BASE_URL`/`reportLink` pair; the
  `invoice-public` function that serves it lands in Task 5.
- `INVOICE_DETAIL_COLUMNS`' client embed gains `phones` so the detail screen
  can compose the device SMS (report-card parity).
- After **Send**, the mutation re-reads the invoice before offering the share
  sheet: the token is minted server-side and a cache invalidation alone would
  race the Alert.
- `listAllDeposits` added for the ledger's All toggle, in the SAME queue order
  as `listHeldDeposits` so toggling never reshuffles rows within a client
  group; `depositStatusChip`/`methodLabel`/`PAYMENT_METHODS` live in
  `money.ts` with the other pure label helpers. Forfeited renders `warning`
  (money the client lost — worth noticing), refunded/requested `muted`.
- The Task 3 invoice list's inline status pill was extracted to
  `src/features/billing/StatusBadge.tsx` (with `toneColor`) — three screens
  now render it; the list screen was refactored to use it, no visual change.
- VisitScreen's "Add to an invoice →" row shows for owner + completed +
  `isVisitInvoiced === false` (a business-scoped `invoice_items` probe that
  only fires for owner sessions) and pushes `/billing/new?client=<id>`;
  new.tsx reads the `client` param to preselect the picker.
- Screens stay untested markup over the tested pure/api layer (house
  approach): `newInvoice.test.ts` (24), api/money/deviceSms additions ride
  the existing suites.

## Plan 5, Task 5 — invoice-public function, public page, invoice_ready email (2026-08-25)

- **invoice-public mirrors report-public mechanism-for-mechanism:** same 48-hex
  token regex, same in-memory per-IP fixed-window rate limiter (30/min, per
  isolate — the accepted trade-off is restated in the file header), same
  byte-identical `{error:'not found'}` for unknown, malformed, missing,
  revoked, AND voided tokens. The void check (`status not in sent|paid`) is
  belt and braces beyond `revoked_at`: `void_invoice` stamps `revoked_at`
  whenever a token exists (Task 2), but a voided invoice must never render as
  payable even if that invariant ever slipped.
- **Payload allow-list (spec §4):** top level exactly `business{name,
  brandColor, logoUrl(signed 24 h)}, businessTz, clientFirstName, invoice{
  numberLabel, issuedOn, dueOn, status, paidAt}, items[{description,
  amountCents, kind}], paymentsTotalCents, balanceCents,
  paymentInstructionsMd`. `clientFirstName` is `clients.name` split on
  whitespace, FIRST token only, server-side — the full name never leaves the
  function. `businessTz` comes from `businesses.time_zone` (invoices carry no
  tz snapshot; reports read the visit's). Items total is derived on the page
  (`invoiceViewModel`); the function ships payments total + true balance.
- **`invoice_ready` template:** subject `BUSINESS — invoice INV-0042` (the
  task's dash style; other templates use `BUSINESS: ...` — recorded), text
  first sentence byte-aligned with `invoiceSmsBody` ("Text the client"
  parity), plus a `Total due: $X.` sentence and the link. Missing number/
  total/url degrade honestly (no `INV-????`, no lying `$0.00` — the
  visit_finished precedent). `centsToDollars`/`invoiceNumberLabel` are local
  copies in templates.ts (expand.ts/polyline.ts copy pattern). buildContext
  gains an `invoice_ready` branch reading invoice number + items sum via
  admin and building the link from `INVOICE_BASE_URL` env with the
  `https://stridetail.app/invoice` default (mirrors `src/lib/brand.ts`;
  pinned by a jest test). No other send-email behavior touched; redeploy is
  Task 6.
- **The public page has NO Platform split** (deviation-by-omission from the
  report page's web-only `<svg>`): every invoice section is plain RN markup,
  so native and web render identically — the report's native fallback exists
  only for its DOM svg sketch, which invoices don't have.
- **`invoiceViewModel(payload)` is the page's pure layer**
  (`src/features/billing/publicInvoice.ts`, jest 7 cases): title/dates/paid
  stamp/items/totals as render-ready strings, money via the shared
  `formatCents`, date columns via `formatIsoDate` (calendar-only), and
  `paidAt` — an instant — via `formatInTimeZone` in the BUSINESS tz (pinned
  with a 03:00 UTC = previous-day-Chicago vector). Payments row hides at 0;
  an over-paid balance renders negative, never floored. The screen stays
  untested markup over the tested helpers (house approach).
- **E2E (local `supabase functions serve`, bun fetch scripts, fixtures
  cleaned): 41/41 + 6/6 checks.** invoice-public: valid token with no auth
  headers → 200 (verify_jwt off proven); GET/POST parity; exact key sets at
  every level; first-name-only; logo signed URL fetches the uploaded bytes
  (host rewritten from the edge runtime's internal `http://kong:8000` — local
  serve quirk); leak-check with the signed URL scrubbed finds none of: client
  last name, address, phone digits, email, `walker`/`phone`/`address`/
  `private`/`notes`/`access`/`code` markers, or the token itself (price/amount
  strings are the page's CONTENT here, so price markers are deliberately not
  in the grep list — recorded per the task); paid invoice carries paidAt and
  zero balance; unknown/malformed/missing/voided/revoked → five byte-identical
  404s; rate limiter 429s on exactly request 31. send-email drain:
  invoice_ready row → skipped_no_provider (no Resend env) with the exact
  subject and text incl. total due and `stridetail.app/invoice/<token>` link.
- Migrations untouched; `db:reset`/`db:test` not rerun (nothing schema-side
  changed). Checks: 626 jest (49 suites), 37 deno, typecheck, lint all green.

## Plan 5, Task 6 — hosted deploy, checklist, OTA, Checkpoint 6 script (2026-08-25)

- Migrations 20260825000001–2 applied to hosted `vrxoswukuiaerhwammlh` via MCP
  `apply_migration` (verbatim file content, name = filename stem — Plan 4 Task 9
  pattern). Functions deployed with the repo's copy pattern (`../_shared/cors.ts`
  rewritten to a bundled `./cors.ts`, test files excluded): `invoice-public` NEW with
  verify_jwt OFF (public by design — the 48-hex token is the credential, per its
  config.toml and file header), `send-email` REDEPLOYED (version 6) with verify_jwt ON,
  now carrying the `invoice_ready` template. `INVOICE_BASE_URL` secret deliberately NOT
  set: the in-code `https://stridetail.app/invoice` fallback is the correct hosted value.
- **Hosted smoke (SQL role-impersonated owner + unauthenticated HTTPS, SMOKE-prefixed
  fixtures, deleted afterwards): all checks passed** —
  - `record_deposit` 2500 → held; `create_invoice` → INV-0001 draft with `visit` item
    4500 (fixture completed visit, snapshot 4500) + `deposit_credit` −2500, deposit
    flipped applied; `send_invoice` → sent, 48-char token, `invoice_ready` email row
    queued with matching `{invoiceId, invoiceToken}` payload.
  - `invoice-public` over HTTPS with no auth headers: 16/16 (200, EXACT key sets at all
    levels, `clientFirstName` "SMOKE" only — no full-name leak, INV-0001, business tz,
    both items, balance 2000). `record_payment` Venmo 2000 → **paid**, `paid_at` set,
    `invoice_totals` 2000/2000/0, `invoice.paid` audit row; re-fetch → paidAt present,
    balance 0. Second (empty) invoice sent then `void_invoice` → status void,
    revoked_at stamped, token → byte-exact `{"error":"not found"}` 404.
  - Audit accounting on hosted: invoice.create ×2, invoice.send ×2, invoice.paid ×1,
    invoice.void ×1 (plus deposit.record/apply and payment.record).
- **Smoke `invoice_ready` notification rows were deleted INSIDE the creating
  transaction** (after asserting channel/template/payload): Resend is LIVE on hosted
  with a per-minute cron, so a committed queued row would have been really delivered
  to the throwaway `smoke-billing@example.com` within a minute. The queue mechanics
  themselves were proven in the Plan 4 smoke and locally in Task 5's E2E drain.
- Cleanup verified back to exact pre-smoke counts (invoices/items/deposits/payments
  0/0/0/0, clients 1, visits 8, notifications 6) and `invoice_next_number` reset to 1 —
  beyond row counts — so the sponsor's first real invoice is INV-0001, not INV-0003.
- **Advisor sweep (security): zero new findings.** Everything reported is a
  pre-recorded acceptance: `client_access` deny-all INFO + `services_public`
  definer-view ERROR (Plan 2 Task 8), and the authenticated-executable definer-RPC
  WARNs — the ten Plan-5 billing RPCs are new instances of that same accepted pattern
  (guarded RPCs are the API; public/anon revoked, `is not true` owner gates,
  search_path pinned). No follow-up migration needed.
- Local checks all green post-deploy: 626 jest (49 suites), 439 pgTAP (12 files),
  typecheck, lint.
- Checkpoint 6 script appended to `checkpoints.md` as PENDING: the walker half asserts
  billing **blindness only** — payout-statement visibility (spec §7's "walker sees
  their finalized payout statement") needs Plan 6's finalize RPC/UI, so it moves to
  Plan 6's checkpoint run, per the plan's "Plan 6 picks up payouts UI + Checkpoint 6
  device run".

## Icon system v1 — 18 theme-wired svg icons (2026-08-25)

- **NATIVE MODULE — DO NOT OTA THIS ALONE:** `react-native-svg@15.15.4` (via
  `bunx expo install`) is a native module. Installed dev clients / preview builds do
  NOT contain it: publishing an OTA update with this commit before the next dev-client
  rebuild + EAS build would crash every icon render on the missing native module.
  This work merges now, but the next update ships only WITH (or after) a new build.
  Web export is unaffected (`CI=1 bunx expo export --platform web` passes and emits
  `dist/dev/icons.html`; react-native-svg resolves its `.web` entry — no metro stub
  needed).
- The source docs' path data was treated as reference only (per the icon brief): every
  path was redrawn by hand in a 24×24 viewBox, strokeWidth 1.75, round caps/joins,
  no baked backgrounds; the gear polygon was generated (8 teeth, r 9.4/7.1). Colors
  come from `src/ui/tokens.ts` via `useTheme()` — the docs' `constants/colors.ts`
  near-miss values (`#E96532` etc.) were rejected as specified.
- `IconProps.color`/`accent` are typed `ColorValue`, not `string`: react-navigation's
  `tabBarIcon` hands its tint as `ColorValue`, and react-native-svg accepts it
  directly. An explicitly passed `color` always wins over the theme default.
- Paw motif restraint: the brief allows the paw only on location pin / camera /
  completed check. Of those, only the camera exists in this set — PhotoIcon carries an
  accent paw shutter dot (legible from ~24px). CheckCircleIcon stays a plain check: a
  paw inside a 16px circle is illegible, so it was left off (allowed, not required).
  PoopIcon is the set's single filled silhouette (a stroked swirl reads as ice cream).
- `react-native-svg` ships NO jest mock entry (`react-native-svg/jest-mock` does not
  exist in 15.15.4 — checked the package contents), so `jest.setup.ts` stubs
  Svg/Path/Circle/Rect as pass-through `View`s (standard community fallback); the
  icon smoke test asserts stroke/fill props straight off the JSON tree, including
  that an explicit `color` prop suppresses the theme ink entirely.
- `Button` gained an optional `icon?: (color) => ReactNode` render-prop (receives the
  variant foreground so icons always match the label); the active-visit `EventButton`
  was rebuilt as its own secondary-styled Pressable with the icon ABOVE the label
  (plain `Button` cannot stack). All text labels kept — icons augment, never replace.
- 🔒 emoji swapped for `LockIcon` in the three briefed homes (active-visit reveal
  button, owner client-detail access row, VisitScreen gated-codes row). The FOURTH
  usage — `app/(owner)/clients/[id]/access.tsx`'s `<Screen title="🔒 Access codes">` —
  keeps its emoji: `Screen.title` is a plain string prop and was not in the brief's
  list; widening Screen's API for one heading was not worth it.
- Owner desktop web rail (`OwnerRail`) stays label-only: it is a custom `tabBar` that
  never receives `tabBarIcon`, and the brief scoped icons to the mobile tab bars.

## Plan 6, Task 1 — auto-invoice on finish + payout RPCs (2026-08-25)

- **The auto-flow does not call `create_invoice`/`send_invoice` (recorded per the
  task):** their `is_owner` guards — and the invoice transition trigger's
  who-check — would reject the calling WALKER, and this path is
  system-on-behalf-of-business inside the definer `finish_visit`. The assembly
  is inlined in a private helper `autoflow_invoice_for_visit` (revoked from
  authenticated/anon/public; invoker-rights, always executed under
  finish_visit's definer context so `auth.uid()` still reads the walker for the
  audit actor). `create_invoice`'s number-allocation for-update lock,
  local-date `issued_on`, `'Dy, Mon FMDD'` description, and whole-deposit
  oldest-first auto-apply are duplicated deliberately — a shared refactor was
  not clean (create_invoice sweeps a range; this builds exactly one visit).
- **per_visit builds the single-visit invoice directly** (recorded per the
  task): `create_invoice(client, from, to)` with the visit's local date as both
  bounds could pull OTHER uninvoiced same-day visits. Pinned in pgTAP with a
  completed un-invoiced same-local-day visit that must stay un-invoiced.
- **The per_visit invoice is INSERTED as `sent`** (token + `sent_at` stamped at
  insert): the transition trigger fires on UPDATE of status only, so no trigger
  bypass is needed and a draft->sent update (which the trigger's who-check
  would reject for the walker) never happens.
- **Failure never breaks the finish:** the whole auto-block (both modes) is a
  plpgsql sub-block whose exception handler writes audit
  `invoice.autocreate_failed` (entity `visit`, meta `{mode, error: sqlerrm}`);
  the subtransaction rollback also reverts the number allocation and any queued
  email — asserted in pgTAP by pre-invoicing the visit on a draft (unique-index
  trip) and checking counter + notification counts are untouched.
- **Audit actions mirror the owner flow** (`invoice.create`, `invoice.send`,
  `invoice.item_add`, `deposit.apply`) with meta `"auto": true`; the actor is
  the finishing walker's `auth.uid()`.
- **per_sitting applies NO deposits** (plan silent; conservative): deposits
  auto-apply at owner-driven `create_invoice` time — appending to a growing
  draft is not the moment to consume them. The append targets the client's
  NEWEST draft (created_at desc), which may be an owner-created draft — that IS
  the client's open sitting bill; a finish with no draft creates an empty one
  (number allocated) and appends. Never sent from this path.
- **`create_payout_statement(p_walker, p_from, p_to)` derives the business**
  from the walker's active membership in a business the CALLER owns (the plan's
  three-arg signature has no business param); if the walker is active in more
  than one such business the RPC raises rather than guessing. Zero eligible
  visits still draft an empty statement (invoice precedent).
- **Payout item amounts:** `round(price_cents_snapshot × payout_percent / 100)`
  — numeric round, half away from zero; pinned vectors 3333 × 32.5% =
  1083.225 → 1083 and 2500 × 32.5% = 812.50 → 813. Range filtering uses the
  visit's LOCAL calendar date (`at time zone business_tz`, create_invoice rule)
  with a UTC-crossing trap pinned.
- **`total_cents` is maintained on every item change AND recomputed at
  finalize** (belt and braces — the frozen walker-visible figure must match
  the items).
- **Payout status transitions are enforced in the RPCs, no trigger** (recorded
  per the task): draft → finalized → paid; `add_payout_item` and
  `void_payout_statement` are draft-only; walkers have no write path at all
  (0001 RLS) and owners go through the RPCs.
- **`void_payout_statement` deletes the items AND the statement row:**
  `payout_status` has no `void` label to park it under, and deleting the items
  releases each visit's payout-once slot — pgTAP shows the released visit
  landing on the next statement.
- **007_execution fixture opts out with `auto_invoice = 'manual'`:** the new
  default (`per_visit`) made finish_visit queue an `invoice_ready` email in the
  execution suite, breaking its notification-count assertion. 007 tests
  execution, not billing — the fixture opts out and the auto-flow has its own
  suite (013). 010_email needed nothing: its assertions are template/visitId
  scoped, which the invoice row (invoiceId payload) cannot match.
- pgTAP 013: 86 assertions — schema default/check/venmo_handle, walker-driven
  per_visit end-to-end (single-visit rule, sent+token, deposit whole-rule,
  both emails, local issued_on, numbering, auto-flagged audit), forced failure
  path, per_sitting accumulation across two finishes on ONE draft, manual
  no-op, payout create/rounding/exclusions, signed adjustments, visit-once +
  void release, status machine, walker-visibility flip under
  `set local role authenticated` (own finalized + items visible, draft and
  others' invisible, write no-op), walker/cross-owner/anon guards, grants
  (helper not client-callable), payout audit accounting.

## Plan 6, Task 2 — payouts UI + billing settings (2026-08-25)

- **Billing settings landed on the Billing tab** (`BillingSettingsCard` at the
  bottom of `app/(owner)/billing/index.tsx`), not global settings — closest to
  use, recorded per the plan. Reads use a dedicated named-column query
  `getBusinessBilling(businessId)` (`auto_invoice, venmo_handle,
  payment_instructions_md`) in `src/features/billing/settings.ts`; the
  memberships business embed (useMemberships) does NOT carry these columns, so
  saving invalidates only `['businessBilling', businessId]` — nothing else
  reads them yet (Task 3 reads them server-side via invoice-public).
- **Settings save is a direct `businesses` UPDATE, no RPC:** the core
  migration's `"owner updates business"` RLS policy (for update using/with
  check `is_owner(id)`) was verified and covers it; no amounts move here.
  `normalizeVenmoHandle` strips leading `@`s (and whitespace) at save time —
  the Task 3 deep link needs the bare handle; blank normalizes to null, which
  hides the public Venmo button.
- **Statement detail is inline** (deposits-screen precedent): one route
  `app/(owner)/billing/payouts.tsx`, list <-> detail via local state — no
  `[statementId].tsx` (the plan allowed either). Void returns to the list
  (the row no longer exists — Task 1's void deletes).
- **Walker names join client-side via `memberName`** (visits precedent:
  `walker_id` references auth.users with no profiles FK, so a
  `walker:profiles(...)` embed on payout_statements is impossible).
  `listActiveMembers` gained `payout_percent` in its named columns (whole-table
  memberships grant covers it); `ScheduleMember.payout_percent` is optional so
  pre-Plan-6 test fixtures need no churn. The new-statement form shows the
  picked walker's percent as a note.
- **"Earnings" row shows for everyone** on the shared SettingsScreen, both
  role groups, navigating to `/(walker)/earnings` (hidden tab screen,
  `href: null`, visit-detail precedent; the walker group has no owner-style
  role guard, so cross-group navigation works). Owners land on their OWN
  finalized statements — an owner walks their own visits too — or an empty
  list; team drafts stay invisible because `listMyPayoutStatements` filters
  `walker_id = session user` and `status <> draft` client-side on top of RLS.
- **`listMyPayoutStatements(businessId)` takes the active business** (house
  business-scoping rule) even though the walker RLS path alone would already
  fence rows; items ride the same query as an embed (read-only inline expand).
- **Signed adjustment amounts** parse via a new `signedDollarsToCents` (leading
  `-` wrapped around the strict positive `dollarsStringToCents`, which itself
  rejects negatives); zero parses but the screen (and the RPC) reject it.
- Jest: `payouts.test.ts` (20 tests) query shapes/RPC args/chip/periodLabel/
  signed parsing; `settings.test.ts` (8 tests) modes list, query/update
  shapes, venmo normalization — 28 new tests, suite at 695.

## Plan 6, Task 3 — combined report+invoice page + Venmo pay link + tips (2026-08-25)

- **Venmo link research (recorded per the task):** Venmo has NO official
  deep-link documentation; both forms are long-standing community-documented
  behaviour (Beals' app-teardown post, O'Leary's web-app write-up, current
  how-to guides): mobile scheme
  `venmo://paycharge?txn=pay&recipients=<handle>&amount=<x.yy>&note=<text>` and
  web `https://venmo.com/<handle>?txn=pay&amount=<x.yy>&note=<url-encoded>`
  (amount = plain dollars, decimal allowed, no `$`; note URL-escaped; `txn`
  also takes `charge`). On mobile with the app installed the HTTPS venmo.com
  link is intercepted by the app (universal link) and prefills the payment;
  without the app it lands on the recipient's profile page. The `venmo://`
  scheme hard-errors in any browser without the app, so the page uses the
  HTTPS form as the ONLY link (recorded per the task's "prefer https as
  primary") — no scheme-first attempt, no user-agent sniffing.
  `account.venmo.com/u/<handle>` is a profile URL with no documented
  txn/amount/note support, so `venmo.com/<handle>` is used.
- **The link builder is app-side only — NO Deno copy** (the task's "decide"
  clause): invoice-public ships primitives (`venmo {handle, amountCents,
  note}`) and never constructs a URL — the page must rebuild the link per tip
  selection anyway, so the builder lives once in `src/lib/venmo.ts` (pure,
  jest: withTip/centsToAmountParam/venmoLink incl. the 4500+500 → "50.00"
  vector, note encoding, leading-@ strip).
- **invoice-public's venmo block additionally requires `balanceCents > 0`**
  (beyond the task's "handle set AND status='sent'"): a sent invoice fully
  covered by recorded payments (balance ≤ 0) must not offer a
  "Pay $0.00"/negative button. Asserted in E2E only via the normal unpaid
  case; the gate is conservative belt-and-braces.
- **report-public's invoice lookup** is one PostgREST query from the invoices
  side (`invoice_items!inner(visit_id)` filter, status in sent|paid,
  `revoked_at is null`, token not null, limit 1 + maybeSingle — the
  invoice-once unique slot means at most one live row). Payload gains
  `invoice: {token} | null` — TOKEN ONLY; the plan sketch's "total due /
  PAID" on the report card was dropped per the task brief ("fetches nothing
  extra"): amounts stay behind invoice-public, and the report's leak posture
  is unchanged.
- **The report card links with expo-router `Link` + `asChild`:** on web it
  renders a RELATIVE `<a href="/invoice/<token>">` (same origin as the report
  page — no host baked in); on native it is an in-app push to the same
  `/invoice/[token]` route, which exists in this app — a real navigation, so
  no "native fallback text" was needed (recorded per the task).
- **Tip UI:** preset chips No tip / +$5 / +$10 / Custom (schedule `Chip`
  reuse); custom is a dollars TextField parsed by the existing strict
  `dollarsStringToCents` (invalid non-empty input shows an inline error and
  disables the pay button; tip treated as 0 until valid). The math line
  renders only when a tip is selected ("$45.00 + $5.00 tip = $50.00" via
  `formatCents`); the button reads "Pay $X with Venmo" and opens the built
  link with `Linking.openURL`.
- **The "Paying by Zelle or another way? See instructions below." note
  renders only when `paymentInstructionsMd` exists** — otherwise it would
  point at a section that isn't there. Paid invoices keep the existing PAID
  stamp; the whole Venmo card is absent (server-gated AND page-gated).
- **send-email templates untouched (recorded per the task):** the
  visit_finished email already links the report page, which now IS the
  combined page — no wording change needed.
- **E2E (local `supabase functions serve`, bun fetch + psql script,
  db reset after): 21/21 checks.** per_visit walker finish (SQL-impersonated
  claims, 013 pattern) → report payload carries exactly `invoice: {token}`
  matching the auto-sent invoice; manual-business report → `invoice: null`;
  leak-greps still clean on BOTH payloads (client last name, address, phone
  digits, emails, notes markers, price/walker/address/phones/private/code/
  access strings, own-token absence); invoice A venmo block exact
  (handle/4500/INV-0001) while sent, `venmo: null` once paid in full (PAID +
  balance 0) and for the no-handle business; report still carries the token
  for a PAID invoice; voided invoice → 404 byte-identical to unknown and
  malformed; report B's invoice reverts to null after the void; revoked
  report → 404 byte-identical to unknown. Rate limiters untouched.
- Checks: 704 jest (53 suites, +9 venmo), typecheck, lint, deno polyline 8/8
  (copy untouched) all green; migrations untouched (no db:reset/db:test
  churn beyond the E2E cleanup reset).

## Plan 6, Task 4 — resend email, true preview amounts, missed visits (2026-08-25)

- **`resend_invoice_email` RAISES for a client with no email** (`client has no
  email on file`, the `resend_report` wording) instead of inheriting
  `queue_client_email`'s silent skip: send_invoice's skip covers the automatic
  path, but an explicit resend button that silently does nothing would read as
  delivered. Draft/void reject via the status check (`invoice is not sent
  (status: %)`, record_payment wording); a revoked link raises before any
  queueing; a `public_token is null` belt-and-braces raise covers direct-write
  slips (a sent invoice always has one via the RPCs). The queued payload is
  byte-shaped like send_invoice's (`{invoiceId, invoiceToken}`) with the
  EXISTING token — nothing can rotate a live link, closing the Plan 5 Task 4
  no-resend deviation. Audit `invoice.resend_email` carries the number.
- **`uninvoiced_visit_amounts` mirrors create_invoice's eligibility verbatim**
  (completed + NOT EXISTS in invoice_items, ordered by scheduled_start) and
  returns the STORED `price_cents_snapshot` — pinned in pgTAP with snapshots
  (1234/700) that no math on the current service price (2500) can produce, so
  a recompute regression fails loudly. Owner-guarded stable definer like
  invoice_totals; grants revoke public/anon, grant authenticated.
- **The new-invoice preview now shows true amounts:** `UNINVOICED_VISIT_COLUMNS`'
  services embed slims to `service:services(name)` (descriptions only — the
  price columns left with the recompute path), `eligibleVisitLine(v,
  amountCents)` passes the RPC snapshot through, and `depositPreview` consumes
  the true subtotal. The "Estimated total" row is plain "Total" and the
  estimate caveat is gone; a line whose amount has not arrived yet renders "…"
  rather than a lying $0.00. `priceSnapshotCents` keeps its one remaining
  consumer (schedule/new.tsx stamping the snapshot at creation).
- **Resend button** renders for sent|paid with a live link (`shareable`
  already excludes revoked/void) behind a confirm Alert that says the link
  stays the same; server errors (e.g. no email on file) surface in the
  screen's error line.
- **`missedVisits` compares UTC instants only** (`scheduled_end` < now − 1 h):
  both sides are instants, so the per-visit `business_tz` is irrelevant to the
  cutoff (recorded per the task). accepted|offered only — in_progress is
  running however late, completed/cancelled are terminal, and unassigned
  already has its own needs-attention line. The owner Today line
  ("N visit(s) missed — review in Schedule", danger tone, pushes /schedule)
  is bounded by the Today query's 26 h lookback: a visit missed further back
  ages out of the strip, matching the notification strip's history-not-
  action-items precedent.
- Checks: 710 jest (53 suites), 552 pgTAP (14 files, +27 in 014), typecheck,
  lint all green.

## Plan 6, Task 5 — hosted deploy + release (2026-08-25)

- Migrations 20260825000003–4 applied to hosted `vrxoswukuiaerhwammlh` via MCP
  `apply_migration` (verbatim file content, name = filename stem). Functions
  redeployed with the repo's copy pattern (`../_shared/cors.ts` rewritten to a
  bundled `./cors.ts`, `polyline.ts` sibling included for report-public, test
  files excluded): `report-public` v6 and `invoice-public` v2, both with
  verify_jwt OFF (public by design — the 48-hex token is the credential, per
  their config.toml and file headers).
- **Hosted smoke, all asserts passed** (SQL role-impersonated walker+owner +
  unauthenticated HTTPS, SMOKE-prefixed fixtures in the demo business, fully
  cleaned afterwards). The REAL business row's `auto_invoice`/`venmo_handle`
  and the walker's `payout_percent` were captured BEFORE the smoke and
  restored + asserted after (venmo `smoketest` and 32.5% were temporary):
  - Walker-impersonated `finish_visit` on a SMOKE in_progress visit under
    `per_visit`: visit completed, report token minted, **INV-0002 inserted as
    'sent'** with its own token, exactly one `visit` item at the 4500
    snapshot, `visit_finished` + `invoice_ready` emails queued (payload
    tokens verified), audit `invoice.create`/`invoice.send` with
    `{"auto": true}` and the walker as actor, counter advanced 2 → 3. The
    queued smoke email rows were deleted INSIDE the creating transaction
    (Resend is LIVE on hosted with a per-minute cron).
  - Unauthenticated HTTPS, **20/20 checks**: report-public 200 with EXACT
    top-level key set and `invoice: {token}` carrying the invoice token (and
    nothing else of the invoice); no price/full-name leak in the report body.
    invoice-public 200 with exact key set, INV-0002, first name "SMOKE" only,
    balance 4500, and the **venmo block** `{handle: smoketest, amountCents:
    4500, note: INV-0002}`; unknown token → byte-exact `{"error":"not
    found"}` 404.
  - Payout lifecycle at a temporary 32.5%: `create_payout_statement` over the
    SMOKE-only period picked both completed visits (1463 = round(4500×32.5%)
    and 1083 = round(3333×32.5%) — the migration's own rounding examples),
    `add_payout_item` +500 → total 3046, `finalize_payout`, then a
    **walker-impersonated read saw the finalized statement** (RLS status <>
    'draft'), `mark_payout_paid` → paid with `paid_at`. All five audit
    actions verified with the owner as actor.
  - `resend_invoice_email` queued a second `invoice_ready` with the SAME
    token (deleted in-transaction, same Resend rule);
    `uninvoiced_visit_amounts` returned exactly the un-invoiced SMOKE visit
    at its true 3333 snapshot.
  - Cleanup asserted counts byte-identical to the pre-smoke snapshot
    (clients 1, visits 8, invoices 1, items 2, deposits 0, payments 1,
    notifications 7, payout tables 0/0, reports 2, events 14, tracks 3,
    pets 1, audit 34 — smoke audit rows deleted by entity id) and the
    business row restored (`auto_invoice` per_visit, `venmo_handle` null,
    `invoice_next_number` 2) — the sponsor's next real invoice stays
    INV-0002.
- **Advisor sweep (security): zero new findings.** The INFO (`client_access`
  deny-all) and ERROR (`services_public` definer view) are the standing
  recorded acceptances; every WARN is the accepted "guarded RPCs are the API"
  pattern — Plan 6's seven new RPCs (payout five + `resend_invoice_email` +
  `uninvoiced_visit_amounts`) are new instances of it (owner/walker `is not
  true` gates, public/anon revoked, search_path pinned).
  `autoflow_invoice_for_visit` does NOT appear in the executable list —
  its revoke-from-everyone grant held. No follow-up migration.
- Local checks all green post-deploy: 710 jest (53 suites), 552 pgTAP
  (14 files), db:reset, typecheck, lint.
- **Release is an EAS BUILD, not an OTA** — deviation from the plan doc's
  "OTA" step, on the sponsor's explicit order and the icon-system entry
  above: this release carries `react-native-svg` (native module), so an OTA
  would crash every installed client on the missing native module. No
  `eas update` was published; a preview iOS build was queued instead.

## Plan 7, Tasks 2–3 — marketing site + Paw & Whisker page (2026-08-26)

- **Email capture is a `mailto:` CTA, not a form** (recorded per the plan's
  "decide, record"): the landing's "Get early access" buttons open
  `mailto:hello@stridetail.app?subject=Early%20access`. A `waitlist` table +
  edge function is Plan 8-adjacent; the mailto needs no backend, no spam
  protection, and no privacy surface before the policy is finalized.
- **Screenshots: 2 of the 5 evidence shots used**, copied to
  `marketing/assets/` (`walker-offer.png` ← cp3-walker-offer, hero product
  shot; `reveal-in-field.png` ← cp4-reveal-in-field, offline-GPS feature
  block — timer, SYNCED badge, demo door code). **cp4-visit-detail.png was
  excluded deliberately: it shows a real street address and phone number**
  (test client data) and must not go on a public site.
  plan3-datetime-pickers.png (glitched status bar, sponsor's name) and
  cp2-walker-tabs.png (empty state) were not marketing-quality.
- **Feature blocks without a suitable screenshot use small hand-built CSS
  "illustration cards"** (gated-reveal, one-link, billing), each explicitly
  captioned "Illustration of …" so nothing reads as a fabricated screenshot;
  no fake data, testimonials, or metrics anywhere.
- **Privacy/terms drafts stay indexable** (recorded per the task): both carry
  a visible "DRAFT — under review" banner but NO robots noindex — they are
  real (if draft) policies and App Store review will want them resolvable.
  Sitemap lists all four pages.
- **Paw & Whisker page carries no prices at all** — not even the
  "+$5 per additional pet" line — pending Alexandra's sign-off; the services
  grid says "Rates are shared at your meet & greet". No phone number is
  published: the `tel:` CTA exists only as an HTML comment until she
  approves one. **Draft marking is threefold** (recorded per the task): an
  HTML comment block at the top of the file, a small muted "Draft page —
  pending owner approval." line under the hero, and the DRAFT flag on the
  checklist row.
- Trust bullets use only verified claims (GPS-tracked walks, timestamped
  report after every visit, encrypted/audited door-code handling,
  owner-operated Houston-based). No background-check claim — never verified.
- LocalBusiness JSON-LD: name, email, areaServed Houston TX, and
  `makesOffer` with the 8 real catalog services, no prices, no street
  address (her service area is public; her home address is not).
- Palette is `src/ui/tokens.ts` verbatim in plain CSS custom properties;
  one Google display face (Fredoka) over a system-font body stack; single
  stylesheet `marketing/styles.css`, no framework, no build step.
  `marketing/vercel.json` is `cleanUrls` (+ `trailingSlash: false`) only —
  no headers needed; marketing SHOULD index (only the .app tokened pages
  get X-Robots-Tag noindex, Task 1's config).
- Verification: HTML nesting, JSON-LD, vercel.json, and sitemap.xml
  machine-validated; pages eyeballed at 375px and 1280px via a throwaway
  local `http.server` (not committed). App checks untouched and re-proven
  green: 710 jest, typecheck, lint.

## 2026-08-26 — Checkpoint 6: one email per walk (migration 20260826000001)

- Checkpoint 6's live run queued TWO client emails at visit finish
  (`visit_finished` + `invoice_ready`, same instant) — the per_visit
  autoflow queued its own invoice email on top of the report email whose
  page already carries the "Invoice & payment" section. Spec and sponsor
  vision say ONE email per walk.
- Fix: full-body replace of `autoflow_invoice_for_visit` with only that
  `queue_client_email('invoice_ready', ...)` removed. The owner-initiated
  `send_invoice` and `resend_invoice_email` RPCs still email — suppression
  applies ONLY to the automatic per-visit path. Applied local + hosted;
  two pgTAP assertions in 013_autoflow flipped to expect zero; 552 pass.
- Also observed, deferred as UI polish (backlog): a tip paid through
  Venmo is recorded as an overpayment, so the invoice list shows
  "Paid −$5.00" — arithmetic is right, display should read
  "Paid · incl. $5.00 tip".

## 2026-08-26 — Plan 7b Task 1: event pins have no stored coordinates

- `visit_events` rows carry NO lat/lng (schema decision from Plan 4), but the
  plan calls for pee/poop/photo pins on the static map. Chosen: a pin's
  position is the track point NEAREST IN TIME to the event's `occurred_at`
  (track points carry `t` epoch ms from ingest-track). Helper
  `nearestTrackPoint` lives in `_shared/staticMap.ts` with the other pure
  pieces; no schema change, and events logged while GPS was cold simply pin
  to the closest fix.
- Pin legend (letters, `pin-s`, colors from src/ui/tokens.ts): start `s`
  green 3A7D5C, finish `f` primary E8642C, pee `p` warning B7791F, poop `w`
  inkMuted 8A5A2B, photo `c` ink 2B1D12. Maki icons deliberately avoided —
  a bad icon name 422s the whole render; letters cannot.
- Map render also runs on the `skipped_no_provider` path (no Resend env):
  the SMS channel carries the same report link, so the map should exist even
  when no email goes out. Failure anywhere (no MAPBOX_TOKEN, Mapbox non-200,
  storage error) logs and falls through — the notification row proceeds
  exactly as before.
- URL-length guard: point budget HALVES (evenly, first/last kept) until the
  URL fits 8000 chars — deterministic and pinned in staticMap.test.ts, vs.
  a per-point char estimate that would drift with coordinates.

## 2026-08-26 — Plan 7b Task 2: no in-app report views exist yet

The plan says "public report page and in-app report views" show the map, but
no in-app owner/walker screen renders the route from the report-public
payload — `routeSvgPath`/`fetchPublicReport` are consumed only by
`app/report/[token].tsx` (the walker visit screen is text/timeline only).
So Task 2 covers the public page alone; in-app route rendering arrives with
Task 3's react-native-maps screens. Other calls:

- Route card extracted to `src/features/report/RouteCard.tsx` so it is
  testable under RNTL without mocking expo-router/react-query; the page keeps
  identical rendering.
- Plain react-native `Image` (the page's existing convention for logo and
  photos), not expo-image — one image, no caching need, and `onError` is what
  drives the fallback.
- Image load failure (e.g. signed URL expired after 1h with the page left
  open) flips component state to the SVG sketch; the route points already
  ride the same payload, so the fallback needs no refetch.
- Attribution renders at label size but without the uppercase transform —
  "© Mapbox © OpenStreetMap" must read verbatim per Mapbox ToS.

## 2026-08-26 — Plan 7b: emoji marker discs replace letter pins (sponsor request)

- Sponsor: "instead of letters can we use icons? green flag, checkered flag,
  poop emoji, water drop emoji". Swapped Mapbox `pin-s-<letter>` markers for
  custom `url-` markers: 64px white-disc PNGs in `public/markers/` (served by
  the stridetail.app Vercel deploy; Mapbox fetches + caches them by URL).
  start=green flag, finish=chequered flag, pee=droplet, poop=pile of poo,
  photo=camera.
- Artwork: Twemoji SVGs (CC-BY 4.0, © Twitter/X contributors), composited
  onto white discs with sharp; the start flag is Twemoji 1F6A9 with the cloth
  recolored #DD2E44 → token green #3A7D5C. Attribution carried here and in
  the staticMap.ts header. Generator was a scratch script (sharp, density
  300, 40px icon on 64px disc, 2px ink-25% ring) — rerun-from-scratch is
  five fetches and one composite; not vendored.
- `markerBaseUrl` option added to the builder (tests pin the default
  stridetail.app URLs). Existing stored maps are letter-pin renders; only
  tonight's smoke map was deleted and re-rendered — historical walk maps
  keep whatever style they were rendered with (presence = idempotency flag).

## 2026-08-26 — Plan 7b Task 3: in-app Apple Maps (react-native-maps)

- **OTA-before-build compatibility**: react-native-maps 1.27.2 is a native
  module absent from every currently-installed binary; the JS reaches them
  via OTA/Metro before the Sep 1 build. Nothing static-imports the package —
  `src/lib/maps.ts` is the single doorway (lazy `require` in try/catch,
  Platform web gate, cached probe). Loader null ⇒ `WalkMap` renders its
  `fallback` (nothing — exactly the pre-task UI). Type-only imports of the
  package are used freely (erased at compile).
- **Android is out of scope**: Google Maps needs an API key in app.json
  (`android.config.googleMaps.apiKey`) plus a Cloud project before ANY
  Android build ships this screen. Not configured; iOS Apple Maps needs no
  key and no config plugin — app.json is untouched, so this change is
  OTA-safe (the map simply stays hidden until a binary carries the module).
- **Web**: react-native-maps has no web build; metro WEB_STUBS redirects it
  (same pattern as expo-sqlite) and the loader also gates on Platform.OS.
  The public report page keeps the Task-2 static map image.
- **Event pin positions**: visit_events carry no coordinates; pins sit on the
  track fix nearest in time — the same correlation staticMap.ts uses server
  side (rule change must touch both).
- **Live-screen pins are session-local**: pee/poop/photo pins accumulate in
  screen state as events are logged. Leaving and resuming the active screen
  drops earlier pins from the live map (same lifetime as the existing
  "Recent" ticker; events themselves are safely in the outbox and reappear
  on the completed-visit map).
- **Marker art duplicated on purpose**: `assets/markers/` is a byte-for-byte
  copy of `public/markers/` (Twemoji discs, CC-BY 4.0 — attribution in the
  2026-08-26 entry above). public/ ships only to web; native bundling needs
  the files under assets/. Regenerate both together.
- **Completed-visit map fetch**: direct `visit_tracks`/`visit_events` selects
  under existing RLS (owner + walker-own-visit policies from
  20260824000009_execution.sql) — no new endpoint, works for both roles of
  the unified VisitScreen; gated off on web and non-completed statuses.

## 2026-08-26 — Plan 8 Task 1: client_users + booking_requests + client read scope

- **client_users has no client-role write path at all**: no insert/update
  policy or grant for `authenticated` (only select for the owner and the
  linked user, delete for the owner). Linking happens via Task 3's definer
  invite/claim RPC or the service role. Multi-business linking is allowed by
  design — the only uniqueness is (client_id, user_id).
- **Owner email for `booking_request_received`** is resolved in SQL:
  `queue_owner_email(business, template, payload)` (definer, client-execute
  revoked) joins memberships(role='owner', status='active') to
  auth.users.email and queues one notifications row per owner with an email;
  e-mail-less owners are skipped silently (queue_client_email precedent).
  No existing pattern queued to owners before — this is the new mechanism,
  fired by an AFTER INSERT trigger on booking_requests (clients insert
  directly, so no RPC exists to do the queueing).
- **booking_requests uses text + check for status** (plan's literal spec),
  not an enum, with a Plan-3-style transition trigger: pending→approved
  requires visit_id stamped in the same update, pending→declined requires a
  reason, everything else raises; who-check owner-or-elevated. So even the
  owner's direct UPDATE cannot approve without a visit — the RPC is the path
  that creates one. No delete policy/grant for anyone (requests are history).
- **Approved visit slotting**: the visit is created AT window_start for the
  service's duration_min (window_end is the client's flexibility, not the
  visit length); price = base + extra_pet × (pets − 1), the exact
  expand-series/app formula, stamped from the service's CURRENT price.
  p_walker null → unassigned; p_walker given → offered after the offer_visit
  active-membership check.
- **Clients can read active services of their linked businesses** (new
  SELECT policy) — the request form needs the list and the insert policy
  validates service_id against it (subqueries in policies run under the
  caller's RLS, so without this the with-check could never pass). This
  exposes service base/extra prices to the paying client — deliberate; the
  walker price-hiding (services_public view) is untouched.
- **Client invoice scope is `status in ('sent','paid')`**: drafts are owner
  WIP, void is retracted; invoice_items and payments chain through visible
  invoices only.
- **Price hiding for clients needs no new mechanism**: the Plan-3
  column-level select grant on visits excludes price_cents_snapshot for the
  whole `authenticated` role, and policies add rows, not columns — asserted
  in 015 (42501 on selecting the column from the client's own visit).
  **Known accepted exposure**: visits.owner_notes_md and decline_reason ARE
  in the authenticated column grant, so a linked client selecting them on
  their own visit rows succeeds. Portal UI (Tasks 4–5) must not render them;
  revisit if owner notes ever carry sensitive content (codes live in the
  encrypted client_access store, not owner notes).
- **Pets self-service column set**: feeding_md, reactivity_md, vet_name,
  vet_phone, vet_address, photo_path — the plan's "feeding/behavioral notes,
  vet info, photo" read literally. meds_md and allergies stay owner-only
  (walker-safety instructions the owner curates); name/species/breed/
  birthdate stay owner-only. Enforced by a BEFORE UPDATE trigger on pets
  (owners and elevated callers pass through untouched) because RLS is
  row-level and the grant is table-wide.
- **Client row stays read-only in v1**: no client UPDATE policy on clients
  (phones/email edits would fight the Task-3 email-matching link path).
- The three new email templates (booking_request_received / _approved /
  _declined) do not exist in send-email until Task 7 — the worker marks such
  rows failed; acceptable queue behavior until then.

## 2026-08-26 — Plan 8 Task 2: OTP auth + role routing (client portal)

- **Where portal login lives**: `app/(auth)/portal-login.tsx`, inside the
  existing `(auth)` group — it inherits the group's signed-in redirect to `/`
  for free, so the screen never navigates itself after `verifyOtp`; the auth
  event flips the session store and the router takes over. Reached from the
  staff sign-in screen via a muted "Pet parent? Sign in here" link (staff
  password flow unchanged and default).
- **Routing decision** is a pure function, `resolveEntry` in
  `src/features/portal/resolveEntry.ts`: any membership → `resolveHome`
  (staff logic untouched, dual-role lands on staff); else any `client_users`
  row (via `listMyClientLinks`, filtered to the caller like
  `listMyMemberships`) → `/(portal)/home`; else the portal-door flag decides
  between the portal's no-account state and business onboarding.
- **The no-account guard** is a persisted "which door did they come through"
  flag (`src/features/auth/portalEntry.ts`, kv-store like `pendingInvite`):
  set by `requestPortalOtp` on a successful code send, cleared by the staff
  password `signIn`/`signUp`. Chosen over in-memory state so a web reload
  (web is the portal's primary surface) keeps a link-less OTP user on the
  portal's friendly "no account found — ask your provider for an invite"
  screen instead of dumping them into business onboarding. The flag records
  the *last* door used, so a later staff sign-in on the same browser behaves
  normally.
- **Portal home is `app/(portal)/home.tsx`, not `(portal)/index.tsx`** — a
  group index would collide with the root `app/index.tsx` at `/`. Matches
  the `(owner)/today` precedent; Task 4's tabs slot in as siblings without
  moving files. The placeholder doubles as the no-account state (zero client
  links) and carries sign-out; the `(portal)` layout redirects signed-out
  users to `/portal-login` and staff to `/`.
- **`shouldCreateUser: true`** on `signInWithOtp` is deliberate: a pet
  parent's first login is their sign-up (plan Task 3 links them by email).
  OTP is self-confirming, so the email-confirmation launch blocker for
  password signups is unaffected.
- **SMTP (Resend) is sponsor-side dashboard config** — nothing in this task
  touches auth email templates or depends on SMTP being live; against local
  Supabase the OTP email lands in Inbucket/Mailpit.
- Sessions from `verifyOtp` ride the existing supabase-js client (encrypted
  LargeSecureStore on native, auto-refresh wiring unchanged) — no new
  session handling.

## 2026-08-26 — Plan 8 Task 3: invite-your-client + claim linking

- **TIGHTENING vs a bare email match**: `claim_client_links()` links only
  clients whose business INVITED them — a new `clients.portal_invited_at`
  stamp, set by owner-only `invite_client_to_portal(p_client)`, is required.
  A random OTP user whose email merely matches a client row in a business
  that never invited them does NOT get linked; the owner's invite is the
  per-business consent gate. OTP to the on-file address stays the ownership
  proof (spec §Task 3).
- **`linked_via = 'invite'` on every v1 link**: because the invited flag is
  required, every path through the claim RPC IS the invite path. `'claim'`
  stays reserved for Plan 9's tokened self-claim CTA (no owner invite).
- **Claim runs twice, both idempotent**: (1) inside `verifyPortalOtp` after
  every portal OTP login — best-effort (errors swallowed; a claim failure
  must never block the login) so returning users pick up newly-inviting
  businesses; (2) from portal home via `useClaimOnEmptyLinks` when the
  links query resolves empty — covers the auth-event/router race where
  `resolveEntry` reads links before the login-time claim lands. Links found
  → invalidate `['client-links']`; none → the no-account message stays.
- **Audit rows**: invite → `client.portal_invite` (entity `client`); each
  created link → `client_user.link` (entity `client_user`, the new link's
  id, client/business/via in meta).
- **Re-invite is allowed by design** (re-stamps + re-queues the email) —
  the owner's "they lost it" button; the UI shows "Invited <date>" with a
  "Re-send invite" action.
- **`client_invite` email**: subject "<business> invited you to their pet
  care portal"; portal link comes from the payload's `portalUrl`
  (`https://stridetail.app/portal-login`), with the same hosted fallback in
  the template when a payload lacks it. `buildContext` re-reads the business
  name fresh at send time (payload `businessName` is a convenience copy).
  **send-email needs a hosted redeploy** — rides Task 8 like the migration.
- Within one pgTAP transaction `now()` is frozen, so the re-invite test pins
  the second queued email rather than a changed `portal_invited_at` value.

## 2026-08-26 — Plan 8 Task 4: portal shell + dashboard

- **New migration `20260826000004` — "client reads linked businesses"**: the
  plan said branding comes "via the client's client row/business join", but
  Task 1 left clients with NO select path on `businesses` ("members read
  business" is staff-only), so a PostgREST embed dies on RLS. One additive
  row policy (`id in client_business_ids_for_user()`) fixes it; the
  businesses columns are all client-benign, and the app still selects named
  columns only (`id, name, brand_color, time_zone`). pgTAP: `017`.
  **Rides Task 8 to hosted** like the other Plan 8 migrations.
- **Multi-business clients (rare), v1**: no per-business portal branding
  juggling — when a user has more than one link, Home shows a plain
  switcher row (pills with each business's name) and ALL portal tabs scope
  to the selected link. The choice is a tiny kv-persisted store
  (`portalLinkId`, `src/features/portal/scope.ts` — the `activeBusinessId`
  pattern); fallback is the first link, so single-link users never see it.
- **Portal queries are online-first**: `portal-*` query keys are deliberately
  NOT added to the offline persist whitelist (`queryPersister.ts`) — the
  portal is a web-first surface and nothing needs to survive an offline
  relaunch; on web the persister is a no-op memory map anyway.
- **Client-facing visit status collapses assignment states**:
  unassigned/offered/accepted all read "Scheduled" (assignment is internal),
  in_progress reads "Happening now". The column contract is pinned in
  `portalQueries.test.ts`: visits selects never carry
  `price_cents_snapshot` (the column grant errors the whole query for
  clients), and `owner_notes_md` / `decline_reason` / `private_notes_md`
  are never fetched or rendered even though rows are selectable.
- **Report thumbnails deferred**: the plan sketch says "map thumbnail" on
  recent report cards — the signed map URL lives behind the public
  report-token function, not a client RLS read, so v1 cards show
  date · service · pets and route to the Reports tab (Task 5 owns the real
  archive + detail).
- Tabs stay bottom-docked on desktop web for v1 (no OwnerRail equivalent);
  the content column is capped at 720 px and centered, public-page style.

## 2026-08-26 — Plan 8 Task 6: pets + access-codes self-service

- **Photo upload ENABLED, not deferred**: the Plan-2 storage policies are
  member-read / owner-write and clients are not members, so before Task 6 a
  client could neither view nor upload their pet's photo. Migration
  `20260826000005` adds client policies on `storage.objects` (select +
  insert + update, no delete) scoped to `<business>/pets/<pet>/…` where the
  pet belongs to a client the caller is linked to AND the path's business
  prefix matches the pet's real business (walker-policy anti-spoof pattern,
  20260824000010). Select is required anyway — signed photo URLs check RLS.
  Gotcha fixed en route: inside the `exists (… from pets p …)` policy
  clause an unqualified `name` binds to `p.name` (pets has a name column),
  silently denying everything — the policies say `objects.name`.
- **meds_md / allergies are client-READABLE and render read-only**: the pets
  grant is table-wide for authenticated and the Task-1 client SELECT policy
  is row-level, so both columns come back to the portal. They are
  owner-curated walker-safety notes, so the editor shows them read-only
  ("managed by your provider") and the update payload never carries them
  (trigger raises server-side; petsScreens/portalPetsQueries tests pin it).
- **`has_client_access_self` added** beyond the plan's set/reveal pair: the
  UI mirrors the owner access screen, which needs the "codes on file"
  boolean without decrypting (has_client_access is owner-only and raises).
- **Audit actions**: `client_access.self_set` / `client_access.self_reveal`
  (plan-named), distinguishable from the owner's `access.set` /
  `access.reveal_owner`; same shared encrypted row, same Vault key.
- **"Optimistic UI"**: the repo has no onMutate/rollback convention anywhere
  (checked) — saves follow the services.tsx mutation pattern instead:
  useMutation -> setQueryData with the returned row + invalidate the list,
  busy state on the button. New portal api/hooks live in petsApi.ts /
  petsHooks.ts / accessApi.ts because Task 5/7 siblings own api.ts/hooks.ts.
- **Migration 20260826000005 rides Task 8 to hosted** like the other Plan 8
  migrations (applied + green locally: pgTAP 018, 42 asserts).
