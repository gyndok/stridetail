# Stridetail Plan 4 — Visit Execution, Reports, SMS, Expo Web

> **For agentic workers:** execute task-by-task with tests first (subagent per task). Same global constraints as Plans 1–3 and everything in DEVIATIONS.md (esp.: `is_owner()` NULL trap → `is not true`; always `revoke ... from public` on functions; explicit grants; visits price column-grant means NAMED COLUMNS in every visits query; RNTL 14 async; `useRefetchOnFocus`; tokens-only colors; no hardcoded tz; new native modules require a dev-client rebuild — call it out). Update the Plan 4 table in `docs/PRD-CHECKLIST.md` in each task's finishing commit.

**Goal:** spec §11 stages 6–8 — a walker runs a real visit in the field: Start (SMS "started" to the client), timestamped per-pet events with photos, live GPS distance through the Plan-1 outbox/task machinery, codes revealable only while running, Finish → report row with public token → SMS "finished" with the link; the report renders on a public web page with branding, timeline, photos, and the route; owner can resend/revoke; owners on a laptop get the ≥900 px rail + week grid. Everything field-side works offline and syncs in order.

**SMS reality:** Twilio A2P 10DLC is NOT yet registered (long lead; sponsor task). `send-sms` is built provider-abstracted: with `TWILIO_*` env present it sends; without, it marks the notification row `skipped_no_provider` (visible in UI as "SMS pending setup") and everything else proceeds. The pipeline is fully testable without Twilio.

**Offline model (spec §8):** day data cached via TanStack Query persister (`expo-sqlite` kv); visit mutations (start, events, photos, finish, track segments) append to the Plan-1 SQLite outbox first and a sync worker uploads in order, idempotent by `client_uuid`. Codes are never cached; the last successful reveal per client is kept in `expo-secure-store` for `businesses.access_grace_hours` and offered offline with a "from HH:MM" note (spec §8).

---

### Task 1: Migration — visit_events, visit_tracks, visit_reports, notifications + start/finish RPCs (+ pgTAP)

Files: `supabase/migrations/20260824000009_execution.sql`, `supabase/tests/007_execution.sql`.

- Tables per spec §5: `visit_events` (`visit_id`, `pet_id?`, `type` enum `event_type` (`arrived`,`started`,`pee`,`poop`,`ate`,`drank`,`meds`,`note`,`photo`,`finished`), `occurred_at`, `text`, `photo_path`, `client_uuid` unique — idempotency), `visit_tracks` (`visit_id`, `segment_no`, `points jsonb`, `client_uuid` unique), `visit_reports` (`visit_id` unique, `public_token` unique, `summary jsonb`, `private_notes_md`, `sent_at`, `sms_status`, `revoked_at`), `notifications` (`business_id`, `channel` default 'sms', `to`, `template`, `payload jsonb`, `status` (`queued`,`sending`,`sent`,`failed`,`skipped_no_provider`), `provider_id`, `attempts`, `next_attempt_at`, `last_error`). All with `business_id` + timestamps.
- RPCs (definer, audited, `revoke from public, anon`): `start_visit(p_visit)` — caller = assigned walker, status accepted→in_progress (the Plan-3 trigger enforces), sets `started_at`, inserts `arrived`+`started` events (server-side client_uuids), queues a 'visit_started' notification to the client's first phone; `finish_visit(p_visit, p_private_notes)` — walker, in_progress→completed, sets `finished_at`, builds `visit_reports` row (`public_token` = 24 random bytes hex; `summary` jsonb assembled from visit + events + distance), queues 'visit_finished' notification with the report link. Both idempotent-safe (re-call → clear error, no dup rows).
- RLS: walker insert/select own visit's events/tracks (insert requires visit in_progress + walker match); owner select all in business; visit_reports owner select + walker select own; notifications owner-select only. No client-role update on reports (resend/revoke via RPCs below).
- `resend_report(p_visit)` (owner; re-queues notification, bumps `sent_at`, audited 'report.resend') and `revoke_report(p_visit)` (owner; sets `revoked_at`, audited 'report.revoke').
- Distance: `recompute_visit_distance(p_visit)` definer fn summing haversine over all segments' points (SQL implementation; duplicates safe because segments are unique by client_uuid); called by the ingest path (Task 2) and finish_visit.
- pgTAP: idempotent event insert (same client_uuid twice → one row); walker cannot insert events on another's visit or a non-running visit; report token select by walker/owner ok, cross-business zero; resend/revoke owner-only + audited; notifications invisible to walkers; distance fn correct on a known 2-segment fixture with a duplicated segment.
- Commit: `feat(db): visit events, tracks, reports, notifications with start/finish rpcs`

### Task 2: ingest-track edge function + event/photo upload path (+ tests)

Files: `supabase/functions/ingest-track/index.ts` (+ shared cors), pgTAP additions if needed, `src/features/visit/upload.ts` skeleton (used by Task 3's worker).

- `ingest-track` (verify_jwt on): POST `{visitId, segments:[{segmentNo, points, clientUuid}]}` with the walker's JWT; verifies caller is the visit's walker via user-scoped client; service-role upserts `visit_tracks` (ignoreDuplicates on client_uuid) then `recompute_visit_distance`; returns `{distanceM}`. Events do NOT need a function — the app writes `visit_events` directly under RLS (idempotent by client_uuid); photos upload to `media` at `business_id/visit_id/<client_uuid>.jpg` — extend the Plan-2 storage policy if walker writes are blocked (walkers currently can't insert storage objects: add a policy allowing the visit's walker to insert under their visit's prefix while in_progress — keep it tight; pgTAP it).
- Local end-to-end: serve function, fixture visit in_progress, post 2 segments + a duplicate → distance computed once, re-post → unchanged.
- Commit: `feat(gps): ingest-track function and walker media upload policy`

### Task 3: Offline day cache + outbox sync worker

Files: `src/lib/offline/sync.ts` (+tests with MemoryOutbox), `src/lib/offline/queryPersister.ts`, `src/features/visit/api.ts` (outbox-first mutations), app/_layout.tsx wiring.

- Outbox kinds: `visit.start`, `visit.event` (payload incl. client_uuid, optional local photo URI), `visit.track` (segment), `visit.finish`. Worker drains in insertion order, one at a time: start→RPC, event→(photo? upload first, then insert row), track→ingest-track, finish→RPC. Retries with attempts++ and backoff; permanent failures (4xx that aren't auth) park the item with `state='error'` and surface a Today badge. Runs on: app foreground, network regain (`@react-native-community/netinfo` — check v57 compatibility; if it needs a native module note the rebuild), after each local append when online, and a 30 s timer while a visit is active.
- TanStack persister: `@tanstack/query-async-storage-persister` over a kv adapter on `expo-sqlite/kv-store`, persisting ONLY whitelisted query keys (today visits ±2 days, clients/pets/instructions for those visits, memberships) — never access codes, never revealed values (spec §8). maxAge 48 h.
- Grace-window reveal: on successful `reveal_access` (Task 5 UI) store `{clientId, values, revealedAt}` in expo-secure-store; offline path shows it if within `access_grace_hours` (from the cached business row) with the timestamp note; else the "No signal — call owner" action (tel: link).
- Tests: worker ordering + idempotent re-drain with MemoryOutbox and a scripted fake server; persister whitelist (codes never persisted); grace-window expiry logic.
- Commit: `feat(offline): ordered outbox sync worker and persisted day cache`

### Task 4: Visit detail + Start flow (walker)

Files: `app/(walker)/visit/[id].tsx` (+ walker stack registration), `src/features/visit/` additions, tests for pure helpers.

- From Today's accepted cards → visit detail: client, pets (tap → read-only pet profile the walker can already read), instructions (`owner_notes_md`, client notes, feeding/meds/reactivity summaries), equipment/key location hint ("Reveal codes" entry DISABLED until started, with lock note), Start button (only when `canTransition(accepted→in_progress)`).
- Start: appends `visit.start` to outbox (optimistic status locally), starts the Plan-1 GPS controller with the REAL visit id when `service.requires_gps` (permission prompts here; reuse `startVisitTracking`), navigates to the active-visit screen (Task 5).
- Commit: `feat(visit): walker visit detail with gated start`

### Task 5: Active visit screen — field mode, events, photos, reveal, finish

Files: `app/(walker)/visit/[id]/active.tsx` (or a mode of `[id].tsx` — pick and record), `src/features/visit/ActiveVisit*.tsx`, tests for helpers (timer format, distance format, event button payloads).

- **Field mode** (spec §9): dark surface + orange accents while recording — extend the theme provider with a `dark` palette scoped to this screen (tokens only; add dark tokens to `src/ui/tokens.ts`); `walkTheme` setting deferred (Round 0 pending; record).
- Header: elapsed timer, live local distance (from the GPS controller's local estimate), per-pet chips when multi-pet (selected pet gets the event). Event buttons: Pee · Poop · Photo · Note (+ Ate · Drank · Meds in an overflow row — Round 0 will finalize; keep all six reachable). Photo → expo-image-picker camera → outbox with local URI; Note → small inline field. Each event appends to outbox with fresh `client_uuid` (expo-crypto) and `occurred_at` now.
- **Reveal codes** (now enabled): calls Plan-3 `reveal_access(visit_id)`; success → values in component state + secure-store grace copy (Task 3); failure offline → grace fallback or call-owner action. Same never-cache rules as the owner screen.
- Finish: confirm → stop GPS, roll final segment, append `visit.finish` with private-notes text (prompted "Note for owner (private)" optional) → back to Today; visit shows completed once synced.
- Recovery: on app launch with a locally in_progress visit, re-register task + reopen this screen (extend Plan-1 `recoverActiveVisit` to carry the visit id/route).
- Commit: `feat(visit): active visit screen with events, photos, gated reveal, finish`

### Task 6: send-sms function + notification queue processor + owner surfacing

Files: `supabase/functions/send-sms/index.ts`, migration `20260824000010_sms_cron.sql` (per-minute pg_cron → send-sms with the existing cron-secret pattern; backoff schedule 1/5/15/60 min, max 6 attempts — implemented in SQL picking due rows or in the function; pick one, record), owner UI: "Report not sent" badge on visit rows + Today strip count; invite SMS: Team screen gains "Send by SMS" using the same queue (spec §2 item 2).
- Provider abstraction: `TWILIO_ACCOUNT_SID/AUTH_TOKEN/FROM` env → real send (Twilio REST fetch; no SDK); missing → mark `skipped_no_provider`. Status transitions queued→sending→sent/failed(+next_attempt_at). SMS body templates: started/finished (+ report link `https://stridetail.app/report/<token>` — the domain isn't wired yet; use the Expo Web deploy URL placeholder from Task 7 and record), invite.
- pgTAP for the queue transitions; function exercised locally with provider absent (rows → skipped_no_provider).
- Commit: `feat(sms): notification queue, send-sms function, owner delivery surfacing`

### Task 7: report-public function + /report/[token] web page + resend/revoke UI

Files: `supabase/functions/report-public/index.ts`, `app/report/[token].tsx` (Expo Router web route — must render on native too, minimal), owner visit detail additions (Resend / Revoke with Alert confirms), tests for the summary shape + polyline simplification helper.

- `report-public` (verify_jwt OFF — public by design, gate is the token; document why): GET/POST token → 404 when unknown or revoked; returns ONLY report-safe fields (spec §6.4): business name/logo signed URL/brand color, pet names, service name, times, duration, distance, simplified polyline points, events (type, time, text, photo signed URLs 24 h). Never address, codes, price, walker contact. Rate-limit lightly (fixed small per-IP in-memory map is fine; note limits).
- Web page: server data → branded page (business color header, timeline, photo grid, SVG polyline route sketch — no map tiles; record as deviation from "static map"), works with `bunx expo export --platform web` and locally via `expo start --web`; on native the route shows "open on web" fallback.
- Owner: visit detail gains report section (status, sent/sms state, Resend, Revoke) wired to Task-1 RPCs.
- pgTAP/tests: revoked → 404 path (function-level check locally), summary builder unit tests.
- Commit: `feat(report): public tokenised report page with resend and revoke`

### Task 8: Expo Web owner layout — rail nav + week grid

Files: `src/ui/web/` helpers, `app/(owner)/_layout.tsx` responsive branch (≥900 px web → left rail via `Platform.OS === 'web'` + `useWindowDimensions`), `app/(owner)/schedule/index.tsx` week-grid mode, reassign interaction.

- Rail: same five sections, vertical, business name header. Week grid: 7 columns (business tz), visits as blocks, click → detail; **reassign** via click → walker menu (drag-and-drop recorded as a follow-up if not reached — judging step 6 needs "reschedule tomorrow's visits", satisfied by click-reassign + time edit; be honest in the checklist).
- Verify with `bunx expo export --platform web` build + `expo start --web` screenshot.
- Commit: `feat(web): owner rail navigation and week grid at desktop widths`

### Task 9: Hosted deploy, advisors, checklist, builds

- Migrations 9–10 hosted via MCP; deploy ingest-track/send-sms/report-public (secrets: reuse cron secret pattern; Twilio env deliberately absent); advisor sweep (fix real, record accepted); smoke: SQL-impersonated walker start→events→track ingest→finish→report token fetch via report-public → revoke → 404.
- All local checks green; push; CI green; PRD checklist Plan 4 table + spec §2 items 6–9, §5, §6, §8 rows updated honestly; EAS preview build (new native modules likely: netinfo — dev-client rebuild note).
- Commit: `chore(release): plan 4 hosted deploy`

### Task 10: Checkpoint 4 — full field run (PENDING, on-device)

Append to `checkpoints.md`: the spec §10 judging script steps 3–5 in one pass: walker (sim or Alexandra) accepts tomorrow's visit re-dated to now; reveal denied before start; Start (SMS row queued — skipped_no_provider until Twilio); airplane-mode mid-visit events + photo; force-kill + relaunch → active screen restored; Finish; airplane off → sync; owner sees completed visit with distance; report link opens in a browser showing branding/timeline/route, no address/codes/price; owner Revoke → 404. Evidence table + screenshots.

## Definition of done

A visit flows offline-first from Start to a revocable public report with every event timestamped and the route measured; SMS rows queue and will send the moment Twilio credentials land; owners get the desktop week grid. Slice 1 then needs only: Twilio creds, Alexandra's onboarding + Round 0 polish, and the full two-phone judging script (Checkpoint 5 = judging steps 1–6 end to end).
