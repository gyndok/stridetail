-- Pet sex / spay-neuter / last-heat (beta round 5, 2026-09-04 — first OUTSIDE
-- tester feedback, Alexandria Chalet: "check mark box for spayed/neutered and
-- if not when was last heat... or at least a male/female check mark so the
-- sitter knows to ask"). Also restores the DoggyLogs sex field the migration
-- dropped. Staff-facing safety info; surfaced on the pet profile and the
-- walker visit brief, INTACT flagged.
alter table public.pets add column sex text check (sex in ('male', 'female'));
alter table public.pets add column fixed boolean;
alter table public.pets add column last_heat date;

comment on column public.pets.sex is 'male/female; null = not recorded.';
comment on column public.pets.fixed is 'Spayed/neutered. null = unknown/not asked.';
comment on column public.pets.last_heat is 'Most recent heat, for intact females (round 5).';
