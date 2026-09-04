-- Round 5b hygiene: push_tokens (created 20260904000001) picked up the
-- schema-default anon grants every new table gets — the exact class the
-- 2026-08-29 hardening swept and pgTAP 019 pins ("anon holds zero table
-- privileges in schema public"). RLS already returned anon nothing; this
-- restores the belt to go with the suspenders.
revoke all on public.push_tokens from anon;
revoke all on public.push_tokens from public;
