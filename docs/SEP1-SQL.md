# Sep 1 seed SQL — run AFTER Alexandra creates her business

Pre-staged 2026-08-31 so nothing is composed live. Order matters. Claude runs these
via the Supabase MCP the moment her business exists; each block is idempotent-ish and
verifiable.

## 0. Find her business id (she creates it in the app; grab the id)

```sql
select id, name, slug, brand_color, time_zone, created_at
from businesses order by created_at desc limit 3;
```

Confirm the newest row is "Paw & Whisker Pet Services" and note its id — every block
below uses `:biz` as that id.

## 1. Clear the auto-seeded demo catalog

create_business seeds 8 generic services. Immediately post-creation nothing references
them, so a hard delete is safe (verify the count first):

```sql
select count(*) from services where business_id = :biz;  -- expect 8
delete from services where business_id = :biz
  and not exists (select 1 from visits v where v.service_id = services.id)
  and not exists (select 1 from booking_requests r where r.service_id = services.id);
```

## 2. Seed her real catalog (ALEXANDRA-ONBOARDING.md §1 — her published prices)

```sql
insert into services (business_id, name, kind, duration_min, requires_gps,
                      base_price_cents, extra_pet_price_cents) values
  (:biz, 'Meet & greet',                              'meet_greet', 30,  false, 0,    0),
  (:biz, '30-Minute Dog Walk',                        'walk',       30,  true,  2500, 500),
  (:biz, '60-Minute Dog Walk',                        'walk',       60,  true,  4000, 500),
  (:biz, '30-Minute Drop-In (cats & small mammals)',  'dropin',     30,  false, 2500, 500),
  (:biz, 'Overnight Stay',                            'overnight',  720, false, 8500, 2000);
```

Ask her about the occasional extras (meds / transport / grooming / aquarium / house
sitting — §0 and §1 notes) and add rows only if she wants them.

## 3. Sponsor support membership

The app has no owner-invite UI (gap D1). Role `owner` so support can actually fix
things during the beta; revisit/downgrade when the beta ends. Sponsor user id is
gyndok@gmail.com = `0fcaa202-32b8-4fd3-aee9-8093847fa847`.

```sql
insert into memberships (business_id, user_id, role, status)
values (:biz, '0fcaa202-32b8-4fd3-aee9-8093847fa847', 'owner', 'active');
```

After this, the sponsor's app shows "Switch to Paw & Whisker Pet Services" in Settings.

## 4. Billing settings (from her Thumbtack payment methods — §0)

She can also do this in the app's Billing settings UI (preferred — it's a teach
moment); SQL fallback if time is short. Fill in her real handles:

```sql
update businesses set
  venmo_handle = '<her venmo>',
  zelle_handle = '<her zelle email/phone>',
  apple_pay_handle = '<her apple cash phone>',
  payment_instructions_md = 'Venmo preferred. Zelle, Apple Pay, and cash also welcome.'
where id = :biz;
```

## 5. Verify (30 seconds)

```sql
select name, duration_min, base_price_cents, extra_pet_price_cents
  from services where business_id = :biz order by base_price_cents;
select role, status, user_id from memberships where business_id = :biz;
select brand_color, venmo_handle is not null as venmo_set from businesses where id = :biz;
```

Expected: 5 services at her §1 prices, 2 active memberships (her owner + sponsor
owner), her chosen brand color.

## NOT today
- No demo-business changes (Geff Dog Walker Demo untouched — it's the show-and-tell).
- No portal invites to real clients (finish-line plan: one or two friendly clients,
  after the testing week).
- SEO gate stays ON until she signs off the page (then §9 of the onboarding pack).
