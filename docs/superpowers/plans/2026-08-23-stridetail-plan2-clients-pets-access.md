# Stridetail Plan 2 — Clients, Pets, Documents, Access Codes

> **For agentic workers:** execute task-by-task with tests first (subagent per task). Checkbox steps track progress. Same global constraints as Plan 1 (`2026-08-23-stridetail-plan1-foundation.md` §Global Constraints): Expo SDK 57 (verify every module against v57 docs), Bun only, strict TS, tokens-only colors, no hardcoded tz, no secrets in `app/`/`src/`, conventional lowercase scoped commits with the Claude trailer, update `docs/PRD-CHECKLIST.md` in the finishing commit of each task, deviations → `DEVIATIONS.md`.

**Goal:** an owner can manage client households and pets end to end: contact + geocoded address, pet profiles (feeding/meds/allergies/reactivity/vet), vaccine documents with expiry stored in tenant-scoped Storage, and door/lockbox/gate/alarm codes that are **encrypted at rest, unreadable via any select, and revealed only through an audited RPC**. Covers spec §11 stage 4 (§2 item 3, §5 rows clients/client_access/pets/pet_documents, §6 items 3/6/7 owner-side).

**Deviation from spec, by design:** walker-facing `reveal_access(visit_id)` requires `visits` (`in_progress`, assignment) which arrive in Plan 3. Plan 2 ships `reveal_access_owner(client_id)` (audited) plus the same storage/encryption plumbing; Plan 3 adds the visit-gated function on top. Walkers see no clients in Plan 2 (their visibility path is via assigned visits).

**Encryption:** pgsodium is deprecated on new Supabase projects. Codes are encrypted with **pgcrypto `pgp_sym_encrypt`**, key stored in **Supabase Vault**; only `security definer` functions (`set_client_access`, `reveal_access_owner`) touch the key. `client_access` has RLS enabled and **no select policy for any role**; grants exclude select for `authenticated`.

**Stack additions:** `expo-image-picker` (camera/library for pet photos + vaccine docs), `expo-document-picker` (PDF vaccine records). Geocoding via `expo-location` `geocodeAsync` on-device at save time (no API key). Verify each at `https://docs.expo.dev/versions/v57.0.0/sdk/<module>/`.

---

### Task 1: Migration — clients, pets, pet_documents, audit_log (+ pgTAP)

Files: `supabase/migrations/20260824000001_clients_pets.sql`, `supabase/tests/002_clients_pets.sql`.

- `clients`: per spec §5 (`business_id`, `name`, `phones text[]`, `email`, `address`, `lat`, `lng`, `notes_md`, `mg_completed_at`, timestamps). Index on `business_id`.
- `pets`: per spec §5 (`client_id` FK cascade, `business_id`, name, species, breed, birthdate, `feeding_md`, `meds_md`, `allergies`, `reactivity_md`, vet fields, `photo_path`).
- `pet_documents`: per spec §5 (`pet_id` FK cascade, `business_id`, `type` enum `doc_type` (`rabies`,`dhpp`,`lepto`,`bordetella`,`other`), `storage_path`, `expires_on`).
- `audit_log`: per spec §5 (`business_id`, `actor_user_id`, `action`, `entity`, `entity_id`, `meta jsonb`, `created_at`). RLS: owners select own business; no insert policy (writes only from definer functions/service role).
- RLS on all: select for members of the business; insert/update/delete **owner only** (walker read path comes in Plan 3 via visits). Explicit grants as in Plan 1's migration (CLI runs as `supabase_admin`).
- pgTAP: cross-business zero rows; walker of business A cannot read A's clients (no visit path yet); owner CRUD ok; audit_log not writable by `authenticated`.
- Verify: `bun run db:reset && bun run db:test` (all suites), app tests still green.
- Commit: `feat(db): clients, pets, documents, audit log with owner-only rls`

### Task 2: Migration — client_access encrypted via pgcrypto + Vault, audited owner reveal (+ pgTAP)

Files: `supabase/migrations/20260824000002_client_access.sql`, `supabase/tests/003_client_access.sql`.

- Enable `pgcrypto` (extensions schema). Seed a Vault secret named `client_access_key` **in the migration only for local dev** via `vault.create_secret(...)` guarded so reruns don't duplicate; hosted gets the same via deploy step (Task 8).
- `client_access`: `client_id` PK/FK cascade, `business_id`, encrypted `bytea` columns (`door_code_enc`, `lockbox_code_enc`, `gate_code_enc`, `alarm_code_enc`, `key_location_enc`, `notes_enc`), timestamps. RLS enabled, **no select policy**; grant only insert/update/delete to nothing — all writes via RPC too. Revoke all from `authenticated`/`anon`.
- `set_client_access(p_client uuid, p_door text, p_lockbox text, p_gate text, p_alarm text, p_key_location text, p_notes text)` security definer: caller must be owner of the client's business; encrypts with `pgp_sym_encrypt(value, key)` (null-safe); upserts; inserts `audit_log` row (`action='access.set'`).
- `reveal_access_owner(p_client uuid)` security definer: caller must be owner; decrypts and returns record of plain texts; inserts `audit_log` row (`action='access.reveal_owner'`).
- `has_client_access(p_client uuid)` security definer → bool (owner-only check + row exists) so the UI can show "codes on file" without decrypting.
- pgTAP: `authenticated` select on `client_access` fails (permission denied); non-owner reveal raises; owner reveal returns values and writes audit row; encrypted column never equals plaintext.
- Commit: `feat(db): encrypted client access codes with audited owner reveal`

### Task 3: Migration — storage bucket `media` with tenant-scoped policies (+ pgTAP)

Files: `supabase/migrations/20260824000003_storage_media.sql`, additions to `supabase/tests/003_client_access.sql` or new `004_storage.sql`.

- Insert bucket `media` (private) into `storage.buckets` (id `media`), idempotent.
- Policies on `storage.objects` for bucket `media`: path convention `business_id/...` (spec §6.6). Members of the business may `select`; **owners** may insert/update/delete. Path's first segment parsed with `split_part(name,'/',1)::uuid` against `current_business_ids()` / `is_owner`.
- pgTAP: cross-tenant object row invisible; owner insert allowed, walker insert denied (storage policies testable by inserting rows into `storage.objects` directly as the test role).
- Commit: `feat(db): media bucket with tenant-scoped storage policies`

### Task 4: Clients feature API + owner Clients list

Files: `src/features/clients/api.ts`, `src/features/clients/types.ts`, `src/features/clients/__tests__/api.test.ts`, rewrite `app/(owner)/clients.tsx`, `app/(owner)/clients/` route dir if using nested routes (`index.tsx`, `[id].tsx`, `new.tsx` — expo-router nested inside the tab).

- API: `listClients(businessId, search?)` (name ilike, ordered), `getClient(id)` (with pets + docs counts), `createClient`, `updateClient`. Types mirror table.
- List UI: search field, client cards (name, phone, pet names line, "M&G pending" badge when `mg_completed_at is null`), tap → detail route, "Add client" button. Empty state. `useRefetchOnFocus`.
- Unit tests: query-shape/pure helpers (e.g. search filter builder, M&G badge logic) with mocked supabase.
- Commit: `feat(clients): client api and owner clients list`

### Task 5: Client detail + add/edit form with on-device geocoding

Files: `app/(owner)/clients/new.tsx`, `app/(owner)/clients/[id].tsx` (+ shared `src/features/clients/ClientForm.tsx`), `src/features/clients/geocode.ts`, tests for geocode + form validation.

- Form: name (required), phones (comma or multi-field), email, address, notes. On save: if address changed, `expo-location` `geocodeAsync(address)` → first result lat/lng (null on failure — never block save; record "no pin" state). No location permission is needed for forward geocoding on iOS; verify against v57 docs and note platform caveats in DEVIATIONS.
- Detail screen: contact card (tap phone → `Linking.openURL('tel:…')`), address, notes, pets section (Task 6), access-codes entry point (Task 7), "Mark meet & greet done" action setting `mg_completed_at` (owner shortcut; visit-driven completion arrives in Plan 3 — record deviation).
- Commit: `feat(clients): client form with geocoding and detail screen`

### Task 6: Pets CRUD + profile

Files: `src/features/pets/api.ts`, `src/features/pets/PetForm.tsx`, `app/(owner)/clients/[id]/pets/new.tsx`, `app/(owner)/clients/[id]/pets/[petId].tsx`, tests.

- API: list by client, create, update; photo upload to `media` at `business_id/pets/<pet_id>/photo.jpg` via `expo-image-picker` (camera or library) + `supabase.storage.upload` (upsert). Signed URL for display.
- Pet profile screen: photo, species/breed/birthdate (age computed in business tz — use date-fns, no hardcoded zone), feeding, meds, allergies, reactivity (warning-styled when non-empty), vet card (name/phone/address, tap-to-call). Vaccine documents section (Task 7).
- Commit: `feat(pets): pet crud, photo upload, profile screen`

### Task 7: Vaccine documents + access codes UI

Files: `src/features/pets/documents.ts`, `src/features/clients/access.ts`, `app/(owner)/clients/[id]/access.tsx`, document components, tests.

- Documents: add via camera (image) or `expo-document-picker` (PDF) → `media` at `business_id/pets/<pet_id>/docs/<uuid>.<ext>`; row in `pet_documents` with `type` + `expires_on`. List with expiry badges: red = expired, amber = < 30 days (computed with date-fns in device tz — display only). Open via signed URL (`Linking.openURL` / expo-web-browser if already available; do not add new modules without checking v57 docs).
- Access codes screen (lock icon on the entry point): shows "codes on file" via `has_client_access`; **Reveal** button → `reveal_access_owner` RPC → values shown with a visible "This access is logged" note; edit form → `set_client_access`. Codes are **never cached** (spec §8): no react-query persistence for this data — fetch on demand, keep only in component state.
- Commit: `feat(access): vaccine documents and audited access codes ui`

### Task 8: Hosted deploy, checklist, CI, build

- Apply migrations 000001–000003 to hosted `vrxoswukuiaerhwammlh` (Supabase MCP `apply_migration`), create the `client_access_key` Vault secret there, verify with a smoke query (owner flow: create client → set codes → reveal → audit row exists).
- `bun run test`, `typecheck`, `lint`, `db:test` all green; CI still green after push.
- Update `docs/PRD-CHECKLIST.md`: Plan 2 section (add a task table like Plan 1's), tick spec §2 item 3, §5 rows, §6 items 3 (owner half)/6/7, note walker-reveal deferred to Plan 3.
- Cut EAS preview build.
- Commit: `chore(release): plan 2 hosted deploy and checklist`

## Definition of done

Owner on a device can: add a client with address pin → add pets with photos → attach a vaccine PDF with expiry and see badges → enter door/alarm codes → reveal them (and the reveal is in `audit_log`) — with `db:test` proving walkers/outsiders see nothing and no role can select `client_access`. Plan 3 picks up: services/availability/visits/series/assignment, walker visibility via visits, visit-gated `reveal_access`, M&G completion via visits.
