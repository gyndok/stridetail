# Backups & the Vault key — runbook

Written 2026-08-29 (security-review item 4). Real client addresses and door codes land
Sep 1; this documents what protects them and what to do when something goes wrong.

## 0. What Supabase already does (verified 2026-08-29)

- **Daily physical backups are ON**: Dashboard → Database → Backups showed 8 consecutive
  daily snapshots (Aug 22–29, ~13:38 UTC). Pro retention ≈ 7 days. Each has a one-click
  **Restore** — that is a WHOLE-PROJECT rollback to that snapshot (it also rolls back the
  "Geff Dog Walker Demo" business and anything else that changed since).
- **PITR** is a separate add-on (its own tab on the same page) — status not yet
  confirmed; check the "Point in time" tab and note it here. Daily backups are adequate
  for launch; PITR (~$100/mo tier pricing) becomes worth it with real tenants.
- **Storage objects are NOT in database backups** (banner on the page): pet photos, walk
  report images, the render-once walk MAPS, and logos live in the `media`/`marketing`
  buckets. A DB restore does not resurrect deleted storage files. Storage loss risk today
  is low (nothing deletes media in bulk; `protect_delete` GUC guards deletes) — revisit a
  bucket sync (e.g. rclone of the S3 endpoint) when real volume arrives.

## 1. Why the Vault key matters — and why escrow makes it a non-event

Door/lockbox/gate/alarm codes in `client_access` are encrypted with
`pgp_sym_encrypt(value, key)` where `key` is a 64-hex-char **passphrase** stored in
Supabase Vault under the name `client_access_key` (migration 20260824000002).

Two facts that decide everything:
- The encrypted columns are ordinary `bytea` — they survive every kind of backup and
  restore, and decrypt ANYWHERE the passphrase is known.
- Vault stores the passphrase encrypted with a key managed by the Supabase platform for
  THIS project. A logical dump of `vault.secrets` is ciphertext that will never decrypt
  in another project or a local database. Whether a physical-backup restore round-trips
  Vault is exactly the untested question from the review.

**Therefore: escrow the passphrase in the sponsor's password manager.** With it escrowed,
a restore that loses Vault costs one re-insert (§3), zero data loss. Without it, a failed
Vault round-trip turns every stored door code into permanent ciphertext.

## 2. Key escrow (sponsor, ~2 minutes, DO BEFORE any real door code is entered)

Run in Dashboard → SQL Editor (keeps the secret out of every chat/terminal log):

```sql
select decrypted_secret from vault.decrypted_secrets where name = 'client_access_key';
```

Copy the 64-hex-character value into the password manager as
**"Stridetail client_access_key (Supabase Vault)"**, then clear the SQL editor result.
Record the escrow date here: **escrowed 2026-08-29** (Apple Passwords, entry
"Stridetail client_access_key", sponsor's account).

## 3. If codes fail to decrypt after a restore ("client_access_key missing from vault")

Re-insert the escrowed passphrase (SQL Editor):

```sql
select vault.create_secret(
  '<the 64-hex value from the password manager>',
  'client_access_key',
  'symmetric key for client_access pgp encryption');
```

Every existing `client_access` row decrypts again immediately — the RPCs look the key up
by name on every call; nothing else to fix.

## 4. Off-project logical dumps — scripts/backup.sh

Supabase's snapshots live inside Supabase. `scripts/backup.sh` adds a dump you hold:

1. One-time: put the direct connection string (Dashboard → Connect → Direct connection —
   it needs the database password) in `~/.stridetail-db-url`, `chmod 600`. NEVER in the
   repo.
2. Run `scripts/backup.sh` → timestamped roles/schema/data dumps in
   `~/Backups/stridetail/`. Copy them off-machine.
3. Cadence: before AND after Sep 1, then before every risky migration day; weekly once
   real clients exist (a launchd job can automate this later).

## 5. Restore drills

- **Definitive, safe (recommended once before real codes):** Backups page →
  **"Restore to new project"** (beta tab). Restores yesterday's snapshot into a brand-new
  project without touching production. In the new project run the §2 select — if it
  returns the same key, Vault round-trips physical restores and the drill is done
  (delete the drill project). If it errors or returns nothing, the answer is "escrow is
  load-bearing" — which §2 already covers.
- **Local drill (logical):** restore a backup.sh dump into local Docker
  (`supabase db reset` then `psql -f`). EXPECTED: `vault.decrypted_secrets` does NOT
  yield the hosted key locally (platform-managed key differs) — that is not a failure;
  re-insert per §3 with the escrowed value and verify `reveal_access_owner` decrypts a
  fixture row. This proves the §3 recovery path end to end.

## 6. What a daily-backup restore means operationally

A snapshot Restore rolls the ENTIRE project back: demo data, invoices issued since the
snapshot, portal links, audit log — everything. After any restore: re-run §2's select to
confirm the key, spot-check one report link and one invoice link, and expect to re-send
anything issued after the snapshot time.
