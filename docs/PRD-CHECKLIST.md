# Stridetail — PRD checklist

Living status of Slice 1 "Operate" against the spec
(`docs/superpowers/specs/2026-08-23-stridetail-slice1-design.md`). Update this file in the
same commit that completes a task. Legend: `[x]` done · `[ ]` not started · `[~]` in progress ·
`[!]` blocked.

Last updated: 2026-08-25

---

## Plan 1 — Foundation, GPS/offline spike, auth & tenancy

| # | Task | Status | Commit |
|---|------|--------|--------|
| 1 | Scaffold Expo 57 app, strict TS, Jest | [x] | `35b4bb6` |
| 2 | Design tokens, theme provider, base components | [x] | `fcc2285` |
| 3 | SQLite schema + outbox store (memory + SQLite) | [x] | `d306ef1` |
| 4 | GPS geometry: haversine, accuracy + jitter filters | [x] | `d4a6f88` |
| 5 | Background-location task, controller, recovery, dev spike screen | [x] | `ab77dd5` |
| — | **Checkpoint 1** — offline walk survives force-kill on a real iPhone | [x] | 2026-08-23, EAS preview `91abd85f`; ~5-min walk, see `checkpoints.md` |
| 6 | Supabase core schema, RLS, RPCs (`create_business`, `create_invite`, `accept_invite`), pgTAP | [x] | `8586ad7` |
| 7 | Supabase client, encrypted session storage, auto-refresh | [x] | `5eadb27` |
| 8 | Session store, sign-in / sign-up | [x] | `a2b0ffc` |
| 9 | Business creation, active-business store, onboarding | [x] | `abc0ca3` |
| 10 | Role-based routing, owner/walker tab shells, settings, business switch | [x] | `5512e50` |
| 11 | Invitations: owner creates, `invite-accept` edge function, walker mode | [x] | `b4c8310` |
| 12 | CI (app + pgTAP), `README.md`, `checkpoints.md`, `DEVIATIONS.md` | [x] | `42a12fa` |
| — | **Checkpoint 2** — sign-up → business → invite → walker accepts, on two devices | [x] | PASS 2026-08-23, all 8 steps (iPhone + simulator, hosted Supabase) |

**Plan 1 — Definition of done** (2026-08-23): *Met* — `bun run test`, `typecheck`, `lint`, `db:test` pass locally (CI workflow committed, not yet observed green: nothing pushed); Checkpoint 1 recorded in `checkpoints.md` (~5-min walk, not the full 10 min); pgTAP covers outsider isolation, inactive invitee, walker no-price, service-role accept (17 assertions); no service-role/Twilio key or hardcoded time zone in `app/`/`src/`. *Deferred* — the end-to-end sign-up → business → invite → walker-accepts-on-second-device flow was not exercised manually (simulator/device runs skipped); covered only by unit tests and pgTAP.

## Plans 2–4 (to be written from the spec)

- [~] Plan 2 — written 2026-08-23 (`docs/superpowers/plans/2026-08-23-stridetail-plan2-clients-pets-access.md`); executing. Walker-side `reveal_access(visit_id)` deferred to Plan 3 (needs visits).

  | # | Plan 2 task | Status | Commit |
  |---|-------------|--------|--------|
  | 1 | clients/pets/pet_documents/audit_log migration + pgTAP | [x] | f1a034d |
  | 2 | client_access encrypted (pgcrypto+Vault), audited owner reveal | [x] | c0f5e56 |
  | 3 | `media` bucket, tenant-scoped storage policies | [x] | 821cb3a |
  | 4 | clients api + owner list | [x] | fa233df |
  | 5 | client form w/ geocoding + detail | [x] | c62b52f |
  | 6 | pets crud + photo + profile | [x] | e2a36ef |
  | 7 | vaccine documents + access codes UI | [x] | d017049 |
  | 8 | hosted deploy, checklist, build | [x] | migrations 1–4 on hosted, advisor hardening, smoke-tested |
- [x] Plan 3 — COMPLETE 2026-08-23 (all 10 tasks; Checkpoint 3 passed)

  | # | Plan 3 task | Status | Commit |
  |---|-------------|--------|--------|
  | 1 | scheduling schema + status machine + assignment RPCs | [x] | 4239897 |
  | 2 | walker visibility via visits + `reveal_access(visit_id)` | [x] | 234aa59 |
  | 3 | recurrence + conflict lib (DST-proof) | [x] | 7d2c21e |
  | 4 | expand-series edge function + nightly cron | [x] | 17e72cf |
  | 5 | services management UI | [x] | a48dc65 |
  | 6 | walker availability + time off UI | [x] | eb68cfb |
  | 7 | owner scheduling + walker picker | [x] | 5732474 |
  | 8 | walker accept/decline + owner needs-attention | [x] | 7ce1221 |
  | 9 | hosted deploy, advisors, build | [x] | migrations 5–8 + expand-series live; cron secret set + verified (200 good / 403 bad); advisors clean; build `c76a4186` |
  | 10 | **Checkpoint 3** — two-device scheduling + reveal denied before start | [x] | PASS 2026-08-23 (iPhone + simulator); see `checkpoints.md` |
- [x] Plan 4 — COMPLETE 2026-08-24 (all 10 tasks; Checkpoint 4 passed on device)

  | # | Plan 4 task | Status | Commit |
  |---|-------------|--------|--------|
  | 1 | events/tracks/reports/notifications schema + start/finish RPCs | [x] | `b1bd3b5` |
  | 2 | ingest-track function + walker media policy | [x] | `6cad8c7` |
  | 3 | offline day cache + outbox sync worker | [x] | `42ec5a3` |
  | 4 | walker visit detail + gated start | [x] | `fc09520` |
  | 5 | active visit: field mode, events, photos, reveal, finish | [x] | `7d7a403` |
  | 6 | send-sms + notification queue + owner surfacing | [x] | `1ca1e04` — sms surfacing since retired (`158788d`, migration 0013): RPCs queue email only, sms cron unscheduled, dormant-sms skips no longer hit needs-attention; function/templates/queue stay deployed for a toll-free future |
  | 7 | report-public + web report page + resend/revoke | [x] | `1e83f2a` |
  | 8 | Expo Web rail + week grid | [x] | `136df85` |
  | 9 | hosted deploy, advisors, builds | [x] | migrations 9–12 hosted; ingest-track/send-sms/send-email (verify_jwt on) + report-public (off, token-gated) live; SMS_CRON_SECRET/EMAIL_CRON_SECRET set; smoke 23/23 (walk start→track→finish→report 200→revoke 404; live pg_cron drained queue to `skipped_no_provider`); advisors: no new findings; build `7d8cb2dd` |
  | 10 | **Checkpoint 4** — full field run | [x] | PASS 2026-08-24: sim half + device half (real GPS route 284.7 m/19 pts, photo upload, report share + revoke on sponsor's iPhone) |

---

## Spec §2 — In-scope functionality

1. [~] Self-serve business creation (name, logo, brand color, IANA tz, policies) — creator = `owner` — *name + device-detected IANA tz via onboarding screen, `create_business` RPC seeds owner membership + 8 services (Task 9); logo, brand color picker, and policies UI still pending (settings, Task 10 / later plan)*
2. [~] Memberships `owner`/`walker`, SMS/email invite link, `is_platform_admin` flag — *schema + RPCs (Task 6); owner creates invite + shares `stridetail://invite/<token>` via share sheet, `invite-accept` edge function + accept screen, walker routed to walker tabs (Task 11, verified against local stack); invite SMS queueable from the Team screen through the `send-sms` queue (Plan 4 Task 6) but the sms channel is DORMANT since migration 0013 (cron unscheduled — queued invite sms will not drain until the toll-free re-enable; owners share the invite link via the share sheet, which is the working path); `is_platform_admin` is a column only, no UI*
3. [~] Clients + pets: instructions, vet info, vaccine docs w/ expiry, secured access info — *owner side complete: clients w/ geocoding, pet profiles + photos, vaccine docs w/ expiry badges, audited access-codes screen (Plan 2 Tasks 4–7); walker read paths + visit-gated reveal in Plan 3*
4. [x] Per-business service catalog seeded (Plan 1) + owner management UI *(Plan 3 Task 5)*
5. [~] Scheduling: one-off + weekly series (8-week expansion), assignment offer/accept/decline, availability, time off, conflict-aware picker, needs-attention *(Plan 3; device verification = Checkpoint 3)*
6. [~] Visit execution: Today, start/finish, background GPS, per-pet timestamped events, multi-pet, private notes — *full walker UI built: detail + gated start (Plan 4 Task 4), field-mode active screen with per-pet events/photos/notes, gated reveal w/ grace fallback, finish w/ private notes, resume banner (Plan 4 Task 5); hosted pipeline proven end-to-end (Task 9 smoke: start→events→GPS ingest 318.9 m→finish→report row); device verification = Checkpoint 4*
7. [~] Reports: tokenised public page, notification on start/finish, retry, owner resend/revoke — *spec said SMS; delivered as EMAIL (Resend, live) after the 10DLC drop. Queue + per-minute `send-email` cron with 1/5/15/60-min retry (Plan 4 Task 6 pattern); public page + resend/revoke UI (Task 7); pipeline live on hosted (Task 9). SMS retired from queueing/surfacing 2026-08-25 (`158788d`, migration 0013 — needs hosted push): RPCs queue email only, owner card shows the email delivery state, "Resend email"; send-sms stays deployed dormant*
8. [~] Offline: day cache + ordered outbox sync — *sync worker + persisted query cache + grace-window reveal helpers done (Plan 4 Task 3); field screens consume them (Tasks 4–5: outbox-first events/finish, per-visit sync badge, offline reveal fallback); airplane-mode device pass = Checkpoint 4; hosted server side (RPCs, RLS insert paths, ingest idempotency by `client_uuid`) verified in Task 9 smoke*
9. [~] Expo Web owner layout ≥ 900 px: rail nav, week grid — *built (Plan 4 Task 8): left rail via the Tabs navigator's `tabBarPosition: 'left'` + custom tab bar, business-tz week grid with status-colored blocks and an inline offer/reassign + reschedule panel (first `rescheduleVisit` UI); drag-and-drop deferred (recorded follow-up); verified via `expo export --platform web` (48 routes; also fixes the pre-existing web-bundle break via expo-sqlite web stubs) — signed-in browser pass rides with Task 9/Checkpoint 4*
10. [~] White-label: name/logo/accent everywhere — *theme provider accent override done (Task 2); surfaces pending*

## Spec §5 — Data model

- [x] `profiles`, `businesses`, `memberships` (+ `services`) *(Task 6)*
- [x] `clients`, `client_access` (Vault/pgcrypto — pgsodium deprecated), `pets`, `pet_documents` *(Plan 2 Tasks 1–2)*
- [x] `services` (Plan 1), `availability_rules`, `time_off`, `visit_series`, `visits` *(Plan 3)*
- [x] `visit_events`, `visit_tracks`, `visit_reports`, `notifications` (+ `audit_log` since Plan 2) *(Plan 4 Task 1; on hosted since Task 9)*
- [x] Local SQLite: `outbox`, `track_points`, `active_visit` *(Task 3/5)*

## Spec §6 — Security

- [x] RLS on every table; no service-role use from the app *(Task 6 — 4 tables; holds for later plans)*
- [x] Walker visibility limited to own/offered visits; prices hidden via column grants + `services_public`; clients/pets visible only via visits *(Plan 3)*
- [~] `client_access` no select policy; `reveal_access` / `reveal_access_owner` audited — *no select policy + zero grants, `reveal_access_owner` + `set_client_access` audited (Plan 2 Task 2); walker-side `reveal_access(visit_id)` in Plan 3*
- [x] `report-public` returns report-safe fields only — *explicit allow-list payload (business/brand/logo, pet names, service, times, duration, distance, route, timeline); unknown/revoked/malformed tokens all 404; leak-check E2E asserts no address, phone, email, price, walker name, or private notes (Plan 4 Task 7); re-proven against the HOSTED function in Task 9 (real token 200, leak markers absent, revoked → 404)*
- [x] Auth tokens in `expo-secure-store`, auto-refresh on foreground *(Task 7)*
- [x] Storage bucket `media`, tenant-scoped paths, signed URLs — *bucket + member-read/owner-write policies with safe path parse (Plan 2 Task 3); signed URLs for pet photos + documents in app code (Plan 2 Tasks 6–7)*
- [~] Audit log for status/assignment/reveal/resend/revoke — *reveal/set audited server-side (Plan 2 Task 2) and surfaced in the access UI (Task 7); status/assignment/resend/revoke in Plans 3–4*
- [x] Secrets only in edge-function env; `.env` gitignored, `.env.example` tracked *(Task 1)*

## Spec §8 — Offline and GPS

- [~] Day cache (today ±2 d) via persisted TanStack cache; codes never cached, grace-window reveal — *persister over `expo-sqlite/kv-store` with whitelisted key prefixes (never access keys), 48 h maxAge, wired in `_layout`; secure-store grace helpers built + tested (Plan 4 Task 3); active-visit UI consumes the grace path in Task 5*
- [x] Outbox: local-first writes, in-order sync worker, idempotent by `client_uuid` — *ordered drain with stop-on-retryable + backoff, permanent 4xx parked as `error`, photo-then-event sequencing, already-done RPC conflicts = success; kicks on foreground/append/segment-roll + 30 s active-visit interval (Plan 4 Task 3)*
- [x] GPS task: 5 s / 10 m, High accuracy, SQLite `track_points`, 60 s segment roll-up *(Task 5)*
- [x] Recovery: re-register task + restore active visit on relaunch *(Task 5 — verified on device, Checkpoint 1)*
- [x] Notification retry with backoff (1/5/15/60 min, 6 attempts) + "Report not sent" badge — *sender-owned backoff + terminal states (Plan 4 Task 6), owner needs-attention line + per-visit badges; per-minute cron live on hosted (Task 9). Since `158788d` (0013) the surfacing is email-only: dormant-sms `skipped_no_provider` rows are excluded (that permanent "SMS pending setup" card is gone), a real failed sms or any email problem still surfaces; retries are live on the email channel (Resend)*

## Spec §9 — UI

- [x] Direction B tokens (cream `#FFF4E6`, primary `#E8642C`, ink `#2B1D12`, 24 px radius, pill buttons) *(Task 2)*
- [x] App icon + splash + favicon (iconikai line-art dog recolored onto token primary `#E8642C`, iOS/Android adaptive/monochrome/web) *(2026-08-23)*
- [ ] Field mode (dark map/sheet while recording; `walkTheme` setting)
- [x] Owner tabs Today · Schedule · Clients · Team · Settings; walker tabs Today · Schedule · Clients *(Task 10, placeholder screens)*
- [ ] Owner Today: needs-attention strip + visits by walker; walker Today: hero card + list
- [ ] Web ≥ 900 px: left rail, week grid w/ drag-reassign, list + detail

## Spec §10 — Testing

- [x] Unit: outbox ordering/idempotency, distance with duplicates *(Tasks 3–4)*
- [x] Unit: RRULE expansion across DST in business tz (both 2026 boundaries, pinned instants); status-machine matrix (144 cases) *(Plan 3 Task 3)*
- [~] pgTAP: cross-walker isolation, no pricing, `reveal_access` gating, revoked token 404, cross-business zero rows — *no pricing + cross-business zero rows done (Task 6, 14 assertions); rest in Plans 2/4*
- [ ] Maestro E2E: sign up → business → client → schedule → start → finish → report
- [x] CI running lint, tsc, jest, pgTAP *(Task 12)*

## Spec §10 — On-device judging script

1. [ ] Create business; invite contractor; contractor accepts on second phone
2. [ ] Client w/ codes + pet w/ vaccine PDF; schedule walk; contractor accepts; owner sees it
3. [~] Reveal codes denied before Start — PROVEN (Checkpoint 3); shown-after + audit entry lands with Plan 4's start flow
4. [~] **Checkpoint 1** — airplane mode, force-kill, relaunch, finish: PASS (GPS only); events/photos/sync pending Plan 4
5. [ ] ~~Client phone gets "started"/"finished" SMS~~ → client EMAIL gets "started"/"finished" (sms dormant, 0013); report shows branding/map/photos, no address/codes/price
6. [ ] Owner reschedules on laptop week grid; walker sees change

## Spec §13 / handoff — Open items (sponsor)

- [x] USPTO + App Store / Play knockout searches clean; **stridetail.com and stridetail.app registered** (Squarespace, auto-renew to 2029-08-23, WHOIS privacy + lock on) — 2026-08-23
- [x] ~~Twilio A2P 10DLC~~ — **dropped 2026-08-24** (prior rejections + per-tenant burden); see
  `docs/HANDOFF.md`. Replaced by: email channel + device-composed SMS
- [x] Email channel: `send-email` edge function + `channel='email'` rows (Resend provider on
  `stridetail.app`) — built 2026-08-24, `244acb4` (migration 0012 queues email from
  start/finish, per-minute cron, `skipped_no_provider` until the sponsor sets
  `RESEND_API_KEY`/`EMAIL_FROM` — see the migration's hosted-setup comment). **LIVE 2026-08-25**: secrets set (Resend, from geffreyklein.com — sponsor's existing verified domain); first delivery confirmed in Gmail after the retry queue absorbed two misconfigured attempts. Follow-up DONE 2026-08-25: stridetail.app verified; sender is now "Paw & Whisker via Stridetail <reports@stridetail.app>" with a domain-scoped key
- [x] Device-composed SMS: "Text the client" button (pre-filled `sms:` link) on the owner visit
  detail and the walker finish flow — `244acb4` (walker offline path sends an honest
  no-link body; the owner card sends the linked one)
- [ ] Parked: toll-free SMS verification — revisit when automated texting is wanted. Re-enable
  hooks are documented in migration `20260824000013_sms_dormant.sql`: re-add the
  `queue_client_sms` calls to start/finish (and resend if wanted) + re-schedule the
  `send-sms-every-minute` cron; function, templates, and secrets are all still deployed
- [ ] Google Maps API key for Android
- [~] Apple Developer, Google Play, Expo/EAS accounts — Apple (individual, team NJ4JGW72MW) + EAS (`geffreykleins-team`) done; **App Store Connect app record "Stridetail" created (1.0 Prepare for Submission)**; Google Play pending; platform entity TBD
- [x] Docker on the Mac mini (colima) — `bun run db:test` runs
- [x] Alexandra's Round 0 answers — received by email 2026-08-24 (recorded in `docs/HANDOFF.md`)

## Round 0 feedback items (Alexandra, 2026-08-24)

- [x] Direction B **plus greens** — `green`/`greenSoft` in `src/ui/tokens.ts` (`success` aliased to
  the one green); accepted/completed badge, owner schedule walker line, picker "Available", and
  the offer-accepted confirmation. Warm base untouched — d202e9c
- [x] **Active-walk screen defaults to WARM** (overrides spec §9 dark-by-default); dark remains
  the persisted `walkTheme` setting (Settings → Walk screen) — d202e9c
- [x] **Today → client and pet profile in one tap** — walker offers get "View details"
  (`/visit/[id]`), owner cards get "Client & pets" (`/clients/[id]`) — d202e9c
- [x] Quick buttons stay **Pee · Poop · Photo · Note**; Ate/Drank/Meds behind a collapsed "More"
  toggle (notes carry them) — d202e9c

## Device-test findings (Checkpoint 2, 2026-08-23)

- [x] Team list went stale after invite acceptance — fixed: `focusManager` wired to AppState + `useRefetchOnFocus` on Team
- [x] Walker tab shell has no Settings/sign-out — fixed: shared `SettingsScreen`, walker Settings tab added

## Before real users (launch blockers — none block dev/testing)

- [ ] Re-enable **email confirmation** on hosted auth (turned OFF 2026-08-23 for dev) and build a
  proper confirmation flow in the app (signed-up-but-unconfirmed state, resend link)
- [ ] Revisit dev-only settings before launch (local `config.toml` analytics-disabled is
  local-only and fine; audit hosted auth/settings against production expectations)
- [ ] Rotate the Vault `client_access_key` if it was ever pasted anywhere outside Vault during
  deploys (as of 2026-08-23 it never was — both environments seeded it inside the migration via
  `gen_random_bytes`; rotation requires re-encrypting `client_access` rows, script it then)
- [ ] Orphaned-object cleanup: `deleteDocument` removes the DB row before the storage object
  (correct order for authorization), so a failed second step orphans the object. Add a periodic
  cleanup job (list `media` objects without matching rows) before launch

## Polish backlog

- [ ] Active-walk screen visual polish (sponsor, 2026-08-24) — fold into Round 1 with Alexandra
- [x] Walker-view banner — superseded by the single-mode Today redesign (`e10e43a` deletes it; it shipped in build `2b6561af` only)
- [ ] Today redesign (hero + single mode) — OTA pending
- [ ] EAS Update (OTA) setup — first item after build quota returns; JS-only changes should not cost native builds
- [ ] Drag-and-drop reassign on the web week grid (click-reassign shipped)

- [ ] Missed visits: accepted/offered visits whose window passed without a start currently vanish from Today — surface in needs-attention ("missed yesterday") — noticed 2026-08-25

## Slice 2 — Bill (spec 2026-08-25; Plans 5–6)

- [~] Plan 5 — invoices, deposits, payments (`docs/superpowers/plans/2026-08-25-stridetail-plan5-invoices.md`); executing

  | # | Plan 5 task | Status | Commit |
  |---|-------------|--------|--------|
  | 1 | billing schema + pgTAP | [ ] | |
  | 2 | billing RPCs (create/send/pay/void/deposits) | [ ] | |
  | 3 | billing api + owner tab + invoice list | [ ] | |
  | 4 | new-invoice flow + detail + deposit ledger | [ ] | |
  | 5 | invoice-public page + email template | [ ] | |
  | 6 | hosted deploy, OTA, Checkpoint 6 script | [ ] | |
- [ ] Plan 6 — walker payouts UI + corrections polish + Checkpoint 6 device run
- Open (validate with Alexandra): payout model (% assumption), packages/bundles, tax lines, invoice numbering scheme

## Survey items not yet in the spec (from the discovery sheet, 2026-08-23)

Source: Alexandra's discovery survey (link in `docs/HANDOFF.md`). Spec §1 captures the rest.

- [ ] Video clips in visit events/reports (she rated photo **and** video must-have) — slice 1 Plan 4 or slice 3
- [ ] Emergency protocol in `policies_md` + "Call owner / vet" action on the active-visit screen; can't-access-home rule (walker stays the window, full charge) — Plan 4
- [ ] Deposit rules: refundable until 7 days before, forfeited within 24 h — slice 2
- [ ] Self-booking after meet & greet with "another teammate may be assigned" notice — slice 3
- [ ] Digital waiver (she already uses one) — slice 3
- [ ] Live map for clients — rated must-have; confirm slice 3 placement with her
