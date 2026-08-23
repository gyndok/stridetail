-- Members may read the profiles of teammates in any business they are active in
-- (needed for the Team screen's memberships → profiles embed).
create policy "members read teammate profiles" on public.profiles for select
  using (
    user_id in (
      select user_id from public.memberships
      where business_id in (select public.current_business_ids())
    )
  );

-- memberships.user_id references auth.users, which PostgREST cannot embed through. Add a
-- second FK to public.profiles (1:1 with auth.users via the signup trigger) so the Team screen
-- can select `profile:profiles(display_name)` from memberships.
alter table public.memberships
  add constraint memberships_user_id_profiles_fkey
  foreign key (user_id) references public.profiles(user_id) on delete cascade;
