-- Onboarding (2026-08-29) — add feline FVRCP to the vaccine document types.
-- The first tenant does cat care and her published requirements are
-- "Felines: Rabies, FVRCP"; the doc_type enum had only canine + generic values
-- (rabies, dhpp, lepto, bordetella, other), so a cat's core combo vaccine had
-- nowhere to go. Additive enum value; existing rows and code are unaffected.
alter type public.doc_type add value if not exists 'fvrcp' after 'bordetella';
