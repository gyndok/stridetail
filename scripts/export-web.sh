#!/usr/bin/env bash
# Web export for Vercel. Env comes from eas.json's preview profile (single source
# of truth; the anon key is public-by-design). --clear matters: Metro's transform
# cache can otherwise inline a stale .env value (found 2026-08-26).
set -euo pipefail
export EXPO_PUBLIC_SUPABASE_URL="$(node -e "console.log(require('./eas.json').build.preview.env.EXPO_PUBLIC_SUPABASE_URL)")"
export EXPO_PUBLIC_SUPABASE_ANON_KEY="$(node -e "console.log(require('./eas.json').build.preview.env.EXPO_PUBLIC_SUPABASE_ANON_KEY)")"
CI=1 bunx expo export --platform web --clear
# Fail the build if the bundle ever points at localhost again.
if grep -rq "127.0.0.1:54321" dist/_expo/static/js/web/; then
  echo "FATAL: localhost Supabase URL baked into web bundle" >&2; exit 1
fi
