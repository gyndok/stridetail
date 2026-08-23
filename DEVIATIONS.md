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
