#!/usr/bin/env bash
# Stridetail off-project database backup (docs/RUNBOOK-BACKUPS.md).
#
# Supabase Pro already takes daily PHYSICAL backups (verified 2026-08-29:
# daily snapshots, ~7-day retention). This script adds an OFF-PROJECT logical
# dump you control — run it before/after risky days (Sep 1) and stash the
# files outside the Supabase project entirely.
#
# Needs the direct database URL (Dashboard → Connect → Direct connection),
# which carries the database password. Keep it OUT of the repo:
#   echo 'postgresql://postgres:<password>@db.vrxoswukuiaerhwammlh.supabase.co:5432/postgres' \
#     > ~/.stridetail-db-url && chmod 600 ~/.stridetail-db-url
#
# What a logical dump does NOT cover (see the runbook):
#  * Storage objects (photos, walk maps, logos) — DB rows only.
#  * The Vault secret VALUE — vault stores ciphertext tied to the project's
#    managed key, useless outside it. The client_access_key passphrase must be
#    escrowed in the sponsor's password manager (runbook §2). The encrypted
#    client_access columns ARE in the dump and decrypt anywhere with that
#    passphrase.

set -euo pipefail

URL="${STRIDETAIL_DB_URL:-}"
if [[ -z "$URL" && -r "$HOME/.stridetail-db-url" ]]; then
  URL="$(cat "$HOME/.stridetail-db-url")"
fi
if [[ -z "$URL" ]]; then
  echo "No database URL. Set STRIDETAIL_DB_URL or create ~/.stridetail-db-url (chmod 600)." >&2
  exit 1
fi

OUT_DIR="${STRIDETAIL_BACKUP_DIR:-$HOME/Backups/stridetail}"
mkdir -p "$OUT_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"

echo "Dumping roles, schema, and data to $OUT_DIR/$STAMP-*.sql ..."
supabase db dump --db-url "$URL" -f "$OUT_DIR/$STAMP-roles.sql"  --role-only
supabase db dump --db-url "$URL" -f "$OUT_DIR/$STAMP-schema.sql"
supabase db dump --db-url "$URL" -f "$OUT_DIR/$STAMP-data.sql"   --data-only --use-copy

ls -lh "$OUT_DIR/$STAMP"-*.sql
echo "Done. Copy these somewhere off this machine too (cloud drive, external disk)."
