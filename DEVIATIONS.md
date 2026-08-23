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
