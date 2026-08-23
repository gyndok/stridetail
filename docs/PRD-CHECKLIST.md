# Stridetail — PRD checklist

Living status of Slice 1 "Operate" against the spec
(`docs/superpowers/specs/2026-08-23-stridetail-slice1-design.md`). Update this file in the
same commit that completes a task. Legend: `[x]` done · `[ ]` not started · `[~]` in progress ·
`[!]` blocked.

Last updated: 2026-08-23

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
| 12 | CI (app + pgTAP), `README.md`, `checkpoints.md`, `DEVIATIONS.md` | [~] | `checkpoints.md`, `DEVIATIONS.md` exist; CI + README pending |

## Plans 2–4 (to be written from the spec)

- [ ] Plan 2 — clients, pets, documents, access codes with `reveal_access` (spec §11 stage 4)
- [ ] Plan 3 — services, availability, time off, visits, series, assignment, accept/decline (stage 5)
- [ ] Plan 4 — visit execution UI, reports, `report-public`, SMS retries, Expo Web layout (stages 6–8)

---

## Spec §2 — In-scope functionality

1. [~] Self-serve business creation (name, logo, brand color, IANA tz, policies) — creator = `owner` — *name + device-detected IANA tz via onboarding screen, `create_business` RPC seeds owner membership + 8 services (Task 9); logo, brand color picker, and policies UI still pending (settings, Task 10 / later plan)*
2. [~] Memberships `owner`/`walker`, SMS/email invite link, `is_platform_admin` flag — *schema + RPCs (Task 6); owner creates invite + shares `stridetail://invite/<token>` via share sheet, `invite-accept` edge function + accept screen, walker routed to walker tabs (Task 11, verified against local stack); SMS delivery of the link in Plan 4 (`send-sms`); `is_platform_admin` is a column only, no UI*
3. [ ] Clients + pets: instructions, vet info, vaccine docs w/ expiry, secured access info *(Plan 2)*
4. [ ] Per-business service catalog seeded with Paw & Whisker's list *(Plan 3)*
5. [ ] Scheduling: one-off + recurring series, assignment, accept/decline, availability, time off, conflict view *(Plan 3)*
6. [~] Visit execution: Today, start/finish, background GPS, per-pet timestamped events, multi-pet, private notes — *GPS + outbox foundation done (Tasks 3–5); UI in Plan 4*
7. [ ] Reports: tokenised public page, SMS on start/finish, retry, owner resend/revoke *(Plan 4)*
8. [~] Offline: day cache + ordered outbox sync — *outbox + GPS buffer done; cache + sync worker in Plan 4*
9. [ ] Expo Web owner layout ≥ 900 px: rail nav, week grid *(Plan 4)*
10. [~] White-label: name/logo/accent everywhere — *theme provider accent override done (Task 2); surfaces pending*

## Spec §5 — Data model

- [x] `profiles`, `businesses`, `memberships` (+ `services`) *(Task 6)*
- [ ] `clients`, `client_access` (Vault/pgcrypto — pgsodium deprecated), `pets`, `pet_documents` *(Plan 2)*
- [ ] `services`, `availability_rules`, `time_off`, `visit_series`, `visits` *(Plan 3)*
- [ ] `visit_events`, `visit_tracks`, `visit_reports`, `notifications`, `audit_log` *(Plan 4)*
- [x] Local SQLite: `outbox`, `track_points`, `active_visit` *(Task 3/5)*

## Spec §6 — Security

- [x] RLS on every table; no service-role use from the app *(Task 6 — 4 tables; holds for later plans)*
- [ ] Walker visibility limited to own/offered visits; `services_public` view hides prices
- [ ] `client_access` no select policy; `reveal_access` / `reveal_access_owner` audited *(Plan 2)*
- [ ] `report-public` returns report-safe fields only *(Plan 4)*
- [x] Auth tokens in `expo-secure-store`, auto-refresh on foreground *(Task 7)*
- [ ] Storage bucket `media`, tenant-scoped paths, signed URLs
- [ ] Audit log for status/assignment/reveal/resend/revoke
- [x] Secrets only in edge-function env; `.env` gitignored, `.env.example` tracked *(Task 1)*

## Spec §8 — Offline and GPS

- [ ] Day cache (today ±2 d) via persisted TanStack cache; codes never cached, grace-window reveal
- [~] Outbox: local-first writes, in-order sync worker, idempotent by `client_uuid` — *store done; worker pending*
- [x] GPS task: 5 s / 10 m, High accuracy, SQLite `track_points`, 60 s segment roll-up *(Task 5)*
- [x] Recovery: re-register task + restore active visit on relaunch *(Task 5 — verified on device, Checkpoint 1)*
- [ ] Notification retry with backoff (1/5/15/60 min, 6 attempts) + "Report not sent" badge

## Spec §9 — UI

- [x] Direction B tokens (cream `#FFF4E6`, primary `#E8642C`, ink `#2B1D12`, 24 px radius, pill buttons) *(Task 2)*
- [ ] Field mode (dark map/sheet while recording; `walkTheme` setting)
- [x] Owner tabs Today · Schedule · Clients · Team · Settings; walker tabs Today · Schedule · Clients *(Task 10, placeholder screens)*
- [ ] Owner Today: needs-attention strip + visits by walker; walker Today: hero card + list
- [ ] Web ≥ 900 px: left rail, week grid w/ drag-reassign, list + detail

## Spec §10 — Testing

- [x] Unit: outbox ordering/idempotency, distance with duplicates *(Tasks 3–4)*
- [ ] Unit: RRULE expansion across DST in business tz; status-machine transitions
- [~] pgTAP: cross-walker isolation, no pricing, `reveal_access` gating, revoked token 404, cross-business zero rows — *no pricing + cross-business zero rows done (Task 6, 14 assertions); rest in Plans 2/4*
- [ ] Maestro E2E: sign up → business → client → schedule → start → finish → report
- [ ] CI running lint, tsc, jest, pgTAP *(Task 12)*

## Spec §10 — On-device judging script

1. [ ] Create business; invite contractor; contractor accepts on second phone
2. [ ] Client w/ codes + pet w/ vaccine PDF; schedule walk; contractor accepts; owner sees it
3. [ ] Reveal codes denied before Start, shown after; owner sees audit entry
4. [~] **Checkpoint 1** — airplane mode, force-kill, relaunch, finish: PASS (GPS only); events/photos/sync pending Plan 4
5. [ ] Client phone gets "started"/"finished" SMS; report shows branding/map/photos, no address/codes/price
6. [ ] Owner reschedules on laptop week grid; walker sees change

## Spec §13 / handoff — Open items (sponsor)

- [ ] USPTO + App Store / Play name checks for "Stridetail"; register stridetail.com + stridetail.app
- [ ] Twilio A2P 10DLC registration (start early — takes days)
- [ ] Google Maps API key for Android
- [~] Apple Developer, Google Play, Expo/EAS accounts — Apple (individual, team NJ4JGW72MW) + EAS (`geffreykleins-team`) done; Google Play pending; platform entity TBD
- [x] Docker on the Mac mini (colima) — `bun run db:test` runs
- [ ] Alexandra's Round 0 answers (stridetail-mockups issue #1)
