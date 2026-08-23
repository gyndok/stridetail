# Stridetail — instructions for Claude Code

Read `docs/HANDOFF.md` first in any new session. It carries the product context that is not
derivable from the code.

## Source of truth
- Design spec: `docs/superpowers/specs/2026-08-23-stridetail-slice1-design.md`
- Current plan: `docs/superpowers/plans/2026-08-23-stridetail-plan1-foundation.md`
- Precedence on conflict: spec > plan > this file > conversation.

## Hard rules
- Expo SDK **57**. Before using any Expo module, read `https://docs.expo.dev/versions/v57.0.0/sdk/<module>/`.
  The SDK is newer than model training data — verify, do not guess.
- Package manager is **Bun** only (`bun install`, `bun run`, `bunx expo`). Never npm or yarn.
- TypeScript strict; `bun run typecheck` must pass before every commit.
- No service-role key, Twilio key, or any secret in `app/` or `src/`. Only `EXPO_PUBLIC_*` env vars reach the client.
- No hardcoded time zone. Zones come from `businesses.time_zone` or the device.
- Every table behind RLS; privileged work only in `supabase/functions/*`.
- Colors and spacing come from `src/ui/tokens.ts`; never literal colors in screens.
- Product display name lives only in `src/lib/brand.ts`.

## Workflow
- Execute plans task-by-task with tests first (superpowers: subagent-driven-development or executing-plans).
- Commits: conventional, lowercase, scoped (`feat(gps): ...`, `fix(db): ...`), ending with
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Unresolved decisions: make the conservative call, record it in `DEVIATIONS.md`.
- Checkpoint evidence (device, screenshots, numbers) goes in `checkpoints.md`; screenshots under `docs/evidence/`.
- Checks: `bun run test` · `bun run typecheck` · `bun run lint` · `bun run db:test` (needs Docker + Supabase CLI).

## Feedback loop with the first tenant
- Mockups: public repo `gyndok/stridetail-mockups`, live at https://gyndok.github.io/stridetail-mockups/
- Feedback: one GitHub issue per round in that repo. Read open rounds at session start and fold answers into the work.
