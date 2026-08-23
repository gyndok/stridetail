# Stridetail

Mobile-first operations app for pet-care businesses (dog walkers, sitters, small
multi-walker teams). Owners schedule and track visits; walkers run them offline with
background GPS; clients get a report. Expo SDK 57 (Expo Router) + Supabase (Postgres,
RLS, edge functions). Design direction B: warm surface, orange accent, tokens in
`src/ui/tokens.ts`.

## Prerequisites

- **Bun** (the only package manager used here — never `npm`/`yarn`)
- **Supabase CLI** `>= 2.x` (`brew install supabase/tap/supabase`)
- **Docker** — Docker Desktop, or [colima](https://github.com/abiosoft/colima) on macOS
  (`export DOCKER_HOST=unix://$HOME/.colima/default/docker.sock`)
- Xcode / iOS Simulator for native runs; a physical iPhone for background GPS
- `bunx eas-cli` (logged in) for device builds

## Run locally

1. `bun install`
2. `bun run db:start` → copy the API URL and anon key into `.env` (see `.env.example`).
   Only `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` are ever exposed to the
   client; no service-role key in the app.
3. `bun run db:reset` — applies `supabase/migrations/` and `supabase/seed.sql`
4. `bunx expo start` (web / simulator).
   Background GPS and SecureStore need a development build on a real device:
   `bunx eas-cli build --profile development --platform ios`, then `bunx expo start --dev-client`.
   Dev-only GPS spike screen: `stridetail://dev/gps-spike`.

## Checks

`bun run typecheck` · `bun run lint` · `bun run test` · `bun run db:test`

`db:test` runs pgTAP (`supabase/tests/`) and needs Docker + a running local stack.
CI (`.github/workflows/ci.yml`) runs the same four on every push to `main` and every PR:
job `app` (Bun: tsc, eslint, jest) and job `db` (Supabase CLI + pgTAP on the runner's Docker).

## EAS builds

Profiles in `eas.json`:

- `development` — dev client, internal distribution, device only
- `preview` — internal distribution (used for Checkpoint 1)
- `production` — auto-increment build number

`bunx eas-cli build --profile <name> --platform ios`. No store submission in Plan 1.

## Repo layout

```
app/                 Expo Router routes: (auth), onboarding, invite/[token], (owner), (walker), dev
src/lib/             brand, env, supabase client, secure session storage
src/lib/offline/     SQLite + outbox store
src/lib/gps/         geometry, background task, controller
src/features/        auth session, business (api, active store, invites)
src/ui/              tokens, theme, base components
supabase/            config, migrations, tests (pgTAP), functions (invite-accept), seed
docs/                spec, plans, handoff, PRD checklist, evidence screenshots
.github/workflows/   ci.yml
```

## Documents

- Design spec: `docs/superpowers/specs/2026-08-23-stridetail-slice1-design.md`
- Plan 1: `docs/superpowers/plans/2026-08-23-stridetail-plan1-foundation.md`
- Handoff: `docs/HANDOFF.md`
- Status tracker: `docs/PRD-CHECKLIST.md`
- Plan deviations: `DEVIATIONS.md` · Checkpoint evidence: `checkpoints.md`

## Hosted dev backend

EAS `preview`/`production` builds point at the hosted Supabase dev project `vrxoswukuiaerhwammlh`
(env in `eas.json`). Apply new migrations there with `supabase db push --linked` (after
`supabase link --project-ref vrxoswukuiaerhwammlh`) or via the Supabase MCP; deploy functions with
`supabase functions deploy <name>`.
