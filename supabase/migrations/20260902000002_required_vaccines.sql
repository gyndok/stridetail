-- Required vaccines per business (beta wish list #5, 2026-09-01).
-- Species-keyed doc_type lists, e.g. {"dog": ["rabies","dhpp"], "cat": ["rabies","fvrcp"]}.
-- Keys match pets.species lowercased/trimmed (species is free text; 'dog'/'cat'
-- are the app's conventional values). Read via the existing businesses grants;
-- written by owners under the existing owner-update policy. The booking screen
-- WARNS on missing/expired required vaccines — it never blocks a booking.
alter table public.businesses add column required_vaccines jsonb not null default '{}'::jsonb;

comment on column public.businesses.required_vaccines is
  'Species-keyed lists of required pet_documents doc_types, e.g. {"dog":["rabies"],"cat":["rabies","fvrcp"]}. Booking shows a non-blocking warning when a required vaccine is missing or expired.';
