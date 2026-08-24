# Stridetail Plan 3 — Services, Availability, Visits, Series, Assignment

> **For agentic workers:** execute task-by-task with tests first (subagent per task). Same global constraints as Plans 1–2 (see Plan 1 §Global Constraints and the whole of DEVIATIONS.md — especially: `is_owner()` is NULL for non-members (`is not true` guards), always `revoke ... from public` on functions, explicit grants because migrations apply as a non-default role, RNTL 14 is async, `useRefetchOnFocus` for tab-mounted lists, tokens-only colors, no hardcoded time zone anywhere). Update `docs/PRD-CHECKLIST.md` (Plan 3 table below the Plan 2 table) in each task's finishing commit.

**Goal:** spec §11 stage 5 — the owner manages the service catalog, walkers declare weekly availability and time off, the owner schedules one-off visits and weekly recurring series (expanded to concrete visits 8 weeks ahead), assigns them to a walker with an availability/conflict-aware picker, walkers accept or decline with a reason, and the owner sees declined/unassigned work at a glance. Walkers gain read access to clients/pets **only through their visits**, and the walker-side `reveal_access(visit_id)` RPC exists, gated on assignment + `in_progress`, audited, with pgTAP proving both denial cases.

**Round 0 status:** Alexandra has not answered issue #1 (checked 2026-08-23). Keep walker-facing screen composition (Today card layout, quick actions) simple and easy to rearrange; do not over-invest in visual polish this plan.

**Time handling (spec §5):** `scheduled_start/end` are UTC instants; `business_tz` is stamped onto each visit at creation. All "today"/week/expansion math happens in `business_tz` via `date-fns` + `date-fns-tz` (new deps — pin current versions, record exact ones). Never `Date`-local math for calendar logic.

**Status machine (spec §5):** `unassigned → offered → accepted → in_progress → completed`; side exits `offered → declined` (back to unassigned + reason for the owner) and any pre-`in_progress` → `cancelled`. Only the assigned walker moves `accepted → in_progress → completed` (those transitions themselves are Plan 4; the machine must enforce them now). Owners may force-assign (`accepted` without offer).

---

### Task 1: Migration — availability, time off, visits, series + status machine (+ pgTAP)

Files: `supabase/migrations/20260824000005_scheduling.sql`, `supabase/tests/005_scheduling.sql`.

- `availability_rules` (`user_id`, `business_id`, `weekday` 0–6, `start_local time`, `end_local time`) and `time_off` (`user_id`, `business_id`, `starts_at`, `ends_at`, `reason`): RLS — the user manages their own rows; the business owner may select all rows in the business (for the picker); walkers cannot see others'.
- `visit_status` enum; `visit_series` and `visits` exactly per spec §5 (visits: `client_id`, `service_id`, `series_id?`, `walker_id?`, `pet_ids uuid[]`, `scheduled_start/end timestamptz`, `business_tz text`, `status` default `unassigned`, `price_cents_snapshot`, `owner_notes_md`, `decline_reason`, `started_at`, `finished_at`, `distance_m`). Unique partial index `(series_id, scheduled_start)` where `series_id is not null` (expansion idempotency).
- **Transition guard trigger** on `visits` (before update of `status`): allow-list of legal transitions incl. who may make them (owner: `unassigned→offered`, `unassigned/offered→accepted` (force-assign), pre-`in_progress`→`cancelled`; assigned walker: `offered→accepted`, `offered→declined` (requires `decline_reason`, resets `walker_id`? no — decline keeps the row but returns status to `unassigned` per spec "returns to owner as unassigned with reason": implement decline as status→`unassigned` + `decline_reason` set + `walker_id` cleared, all inside the trigger-validated RPC below; the enum needs no `declined` state — record this reading in DEVIATIONS), assigned walker: `accepted→in_progress→completed` (Plan 4 calls them; machine allows them now). Everything else raises.
- RPCs (definer, `is not true` guards, `revoke from public, anon`, grant to authenticated): `offer_visit(p_visit, p_walker)`, `accept_visit(p_visit)`, `decline_visit(p_visit, p_reason)`, `cancel_visit(p_visit)`. Audit rows for every status/assignment change (spec §6.7).
- RLS on visits: owner full CRUD in business; walker select where `walker_id = auth.uid()` (both offered-to-them and accepted); walker has NO direct update grant path other than the RPCs. `visit_series`: owner-only.
- pgTAP (write first): every legal transition passes and every illegal one raises (loop the matrix); walker A cannot see walker B's visits or any pricing column (assert `price_cents_snapshot` select fails via column grant or a walker view — pick the simpler mechanism: column-level grants; walkers select visits through a `visits_walker` view without price, `security_invoker`; record choice); decline requires reason; audit rows written.
- Commit: `feat(db): scheduling schema, visit status machine, assignment rpcs`

### Task 2: Migration — walker visibility via visits + `reveal_access(visit_id)` (+ pgTAP)

Files: `supabase/migrations/20260824000006_walker_visibility.sql`, `supabase/tests/006_walker_visibility.sql`.

- Add select policies: walker reads `clients`/`pets`/`pet_documents` where the row's business has a visit with `walker_id = auth.uid()` and matching `client_id` (pets via their client). Owner-only write policies unchanged. Keep the policy subqueries index-friendly.
- `reveal_access(p_visit uuid)` definer RPC: caller is `visits.walker_id`, visit `status = 'in_progress'`, `client_access` row belongs to the visit's client/business → decrypt (same Vault key path as Plan 2) and return; audit `access.reveal` with visit id in `meta`. Deny otherwise.
- pgTAP: **both denial cases explicitly** — (a) assigned walker, visit NOT `in_progress` → raises, no audit row; (b) different walker (or owner of another business), visit `in_progress` → raises; plus the success case writes the audit row and returns decrypted values; walker can read the visit's client/pets, and loses nothing when the visit is cancelled (visibility follows the policy you wrote — assert whichever you implement and record it).
- Commit: `feat(db): walker visibility via visits and gated reveal_access`

### Task 3: Recurrence + calendar lib (pure TS, DST-proof)

Files: `src/lib/schedule/recur.ts`, `src/lib/schedule/conflicts.ts`, tests under `src/lib/schedule/__tests__/`.

- `bunx expo install date-fns date-fns-tz` (or `bun add` — they're pure JS; record versions).
- `expandWeekly({ weekdays, localStart, durationMin, tz, from, until })` → UTC instants: computed **in business tz** so a 09:00 walk stays 09:00 local across DST. Unit tests must span both 2026 US boundaries (Mar 8 spring-forward, Nov 1 fall-back) in `America/Chicago`: same local time before/after, UTC offset shifts; a visit *during* the nonexistent 02:00–03:00 hour resolves deterministically (document which way date-fns-tz rounds).
- `overlaps(aStart,aEnd,bStart,bEnd)`, `withinAvailability(visitStartUtc, visitEndUtc, rules, tz)`, `inTimeOff(...)` — pure, unit-tested (weekday computed in business tz, including a visit whose local date differs from its UTC date).
- Status-machine mirror `canTransition(from, to, role, isAssignee)` for the UI (matches Task 1's trigger; unit-test the full matrix so app and DB agree).
- Commit: `feat(schedule): weekly recurrence and conflict math in business tz`

### Task 4: Series expansion — edge function + nightly cron + on-edit

Files: `supabase/functions/expand-series/index.ts`, migration `20260824000007_expand_series_cron.sql` (pg_cron + pg_net schedule calling the function, or `supabase/config.toml` schedule if CLI-native — check current Supabase docs for scheduling edge functions and record the mechanism), `src/features/schedule/api.ts` additions.

- Function (service role): for each active series, insert missing `visits` rows from now to +8 weeks (`on conflict do nothing` against the unique index), stamping `business_tz`, `price_cents_snapshot` from the service, and the series' walker as `offered` (or `accepted` if series walker = owner; record choice). Expansion math server-side must match Task 3 (duplicate the minimal weekly-in-tz logic in Deno; keep both covered by the same test vectors — copy the vector table into the function's test or a comment).
- Called: nightly by cron; and from the app right after series create/edit (authenticated invoke with the owner's JWT; the function verifies owner via a user-scoped client before doing service-role writes).
- Verify locally with `supabase functions serve` against the local stack.
- Commit: `feat(schedule): series expansion edge function with nightly cron`

### Task 5: Services management UI (owner)

Files: `src/features/services/api.ts` (+tests), `app/(owner)/settings/` → convert to dir with `index.tsx` + `services.tsx` (Settings gains a "Services" row).

- List with active/inactive, edit sheet: name, kind (button row), duration, base price, extra-pet price, requires GPS, active toggle. Prices in cents in the DB — display/edit as dollars (pure helper + tests).
- Commit: `feat(services): owner service catalog management`

### Task 6: Walker availability + time off UI

Files: `src/features/availability/api.ts` (+tests), `app/(walker)/schedule.tsx` rebuilt: weekly availability editor (per-weekday rows with add/remove time ranges, times as local `HH:MM` TextFields validated by a pure helper) + time-off list with add (start/end date-time, reason) and delete.

- Weekday labels/order derived in the business tz context but rules are local times — no tz conversion here (they're `time` columns); record that reading.
- Commit: `feat(availability): walker weekly availability and time off`

### Task 7: Owner scheduling — create visit/series + walker picker + schedule list

Files: `src/features/schedule/api.ts` (+tests), `app/(owner)/schedule/` dir: `index.tsx` (day-grouped upcoming list, filter chips: all/unassigned/declined-reasons/needs-attention), `new.tsx` (flow: client → service → pets (from client, multi-select chips) → date/time (`YYYY-MM-DD` + `HH:MM` fields in business tz, converted with date-fns-tz) → one-off or weekly repeat (weekday chips + end date) → walker picker), `[id].tsx` (detail: reassign/offer, cancel, decline reason display).

- Walker picker rows (each active member incl. the owner): name + computed flags from Task 3 helpers — "available", "time off", "overlaps N visits" (fetch that walker's visits in the window). Self-assign → `accepted` directly (force-assign path), others → `offered` via `offer_visit`.
- One-off: insert visit (status per pick). Series: insert `visit_series` then invoke expand-series (Task 4).
- `price_cents_snapshot` = service base + extra-pet × (pets−1) — pure helper, tested (mirrors survey "+$5/extra pet").
- Commit: `feat(schedule): owner visit and series creation with conflict-aware picker`

### Task 8: Walker offers + owner needs-attention

Files: `app/(walker)/today.tsx` rebuilt (offered strip with Accept / Decline-with-reason prompt → `accept_visit`/`decline_visit`; then today's accepted visits, simple cards — composition stays intentionally plain pending Round 0), `app/(owner)/today.tsx` rebuilt (needs-attention strip: unassigned count, declined-with-reason list linking to reassign; then today's visits grouped by walker), shared `src/features/schedule/VisitCard.tsx`.

- Both screens: `useRefetchOnFocus`; times rendered in `business_tz` (helper from Task 3).
- Commit: `feat(visits): walker accept/decline and owner needs-attention`

### Task 9: Hosted deploy, advisors, checklist, build

- Apply migrations 5–7 hosted via Supabase MCP; deploy `expand-series`; set up the hosted cron per Task 4's mechanism; smoke-test via SQL impersonation: owner creates visit → offer → walker accepts → audit rows; reveal_access denied (not in_progress).
- Run security advisors; fix real findings (remember PUBLIC execute) or record accepted ones.
- All local checks green; push; CI green; PRD checklist Plan 3 table + spec §2 items 4–5, §5 rows, §6 items 2–3 updated honestly; EAS preview build.
- Commit: `chore(release): plan 3 hosted deploy`

### Task 10: Checkpoint 3 — two-device scheduling (PENDING, on-device)

Append to `checkpoints.md`: owner (device A) creates a client+service visit offered to the walker; walker (device B / simulator) sees the offer on Today, accepts; owner sees acceptance (needs-attention clears / visit shows walker); walker opens the visit's client and taps Reveal codes → **denied** (visit not started — judging step 3 first half). Evidence table + screenshots. Run it in-session on the simulator where possible; device A steps belong to the sponsor.

## Definition of done

Owner can run a real week: catalog priced, walker availability declared, one-off + weekly series scheduled 8 weeks out, offers accepted/declined with reasons surfacing on Today, all times correct across a DST boundary (proven by tests), and the codes stay sealed until a visit is actually running (proven by pgTAP; demonstrated on device in Checkpoint 3). Plan 4 picks up: visit execution (start/finish, events, GPS wiring to visits), reports + SMS, Expo Web owner layout.
