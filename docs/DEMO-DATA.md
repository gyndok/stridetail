# Demo dataset — "Geff Dog Walker Demo"

Generated 2026-08-27 directly against hosted Supabase (`vrxoswukuiaerhwammlh`) via raw
SQL inserts (no RPCs, no emails, zero `notifications` rows). This data is **meant to
stay** — it powers the business-oversight demo for the first tenant. Do not treat it
as smoke fixtures.

Business: `Geff Dog Walker Demo` (`677f59c1-0e93-4af9-bd42-4cd7de06a3bd`, tz America/Chicago).
Pre-existing rows were left untouched: the business row itself (except
`invoice_next_number`, advanced 5 → 66 as part of numbering), client **Karla Klein**
(`8a1a55d1-560f-4f8c-b138-b259ced853e3`) and all her pets/visits/invoices
(INV-0001..0004)/payments, and the existing payout statement. Verified by md5
checksums before/after — byte-identical.

## What was generated

| Table | Rows | Notes |
|---|---|---|
| clients | 10 | Houston-area, fake 713/832 phones, invented addresses |
| pets | 17 | 14 dogs, 3 cats; meds_md on Juno, Duke, Whiskey |
| visits (past) | 103 | 100 completed + 3 cancelled, 2026-07-28 → 2026-08-26 |
| visits (upcoming) | 15 | Aug 28 – Sep 3: 11 accepted, 2 offered, 2 unassigned |
| visit_events | 419 | on 82 of the 100 completed visits (arrived/started/pee/poop/note/finished) |
| visit_tracks | 82 | 1 segment each, 12–25 GPS points looping from the client's address; `visits.distance_m` matches the track's haversine distance |
| visit_reports | 82 | 48-hex `public_token`, `summary` jsonb in finish_visit's exact shape |
| invoices | 61 | numbers **5–65** (continue after Karla's 1–4); counter now 66 |
| invoice_items | 68 | description format `Walk — Mon, Aug 24` (autoflow format) |
| payments | 43 | mostly venmo, some zelle/cash, received 0–4 days after issue |

Walker split on completed visits: **57 owner** (Geffrey Klein,
`0fcaa202-32b8-4fd3-aee9-8093847fa847`) / **43 Simulated walker**
(`d8090ed0-f6d1-4246-b13b-054719d3a2e9`).

Invoice states: **42 paid**, **18 sent/unpaid**, **1 partially paid**
(#54, Priya Natarajan — $15 venmo against $30). 59 are per-visit invoices for
completed visits from Aug 7 onward; **2 combined multi-visit invoices**:
#64 Bill Kowalski (5 walks, $125, paid) and #65 Curtis Boone (4 medication
visits, $100, sent).

## Clients

| Client | id | Email | Cadence |
|---|---|---|---|
| **Marcus Delgado** | `0acb1825-c460-4d83-98c4-68c69f0a43a1` | **gyndok+demo1@gmail.com** | regular (Baxter, Olive) |
| Priya Natarajan | `34aa790a-8469-4476-bbec-74e652170a5a` | priya.natarajan@example.com | regular (Biscuit, Chai) |
| Tom Whitfield | `484267fd-d284-4514-b7fc-7cfe44ef5280` | twhitfield@example.com | 3×/wk (Scout, Maple) |
| Dana Okafor | `e124e4e2-4c5d-40d0-a10a-9e874f059e34` | dana.okafor@example.com | regular (Juno, Ziggy) |
| Jorge Ramirez | `4b0e45f1-8923-46b1-9c8b-31a54e135695` | jramirez.htx@example.com | 2×/wk (Rocky, Pepper) |
| Abby Chen | `cef928ce-f22b-400e-994e-cde4c59a148a` | abby.chen@example.com | cat drop-ins (Miso, Mochi) |
| Bill Kowalski | `7852b938-bc12-47d6-990a-5ce445ee5386` | bkowalski@example.com | weekly, combined invoice (Duke) |
| Sofia Marchetti | `881d2c55-6bdf-4e20-b7f3-ab92d578c2bd` | sofia.marchetti@example.com | 2×/wk (Enzo, Luna) |
| Rachel Nguyen | `1f0b4611-0ee0-468a-acba-bffdebbd6705` | rachel.nguyen@example.com | puppy visits (Pixel) |
| Curtis Boone | `33a67390-96d4-486f-9e41-e41791751cd6` | curtis.boone@example.com | weekly meds, combined invoice (Whiskey) |

**Marcus Delgado is the client-portal enrollment target.** His email is the sponsor's
own plus-address (`gyndok+demo1@gmail.com`), so portal-invite emails are deliverable.
He has both **paid** (8) and **unpaid/sent** (5) invoices for the portal billing demo,
and appears at least twice in the upcoming week. All other 9 clients use
`@example.com` addresses — undeliverable by design; never portal-invite them.

Public report verification: `report-public?token=…` returned 200 with route points
and timeline for a generated report (no `mapUrl` — SVG fallback, expected).

## Removing the demo data later

Everything generated hangs off these 10 client ids (FKs cascade for pets, visits,
events, tracks, reports, invoices, items, payments):

```sql
-- The 10 demo clients (everything else cascades or is deletable by join):
-- clients.id in (
--   '0acb1825-c460-4d83-98c4-68c69f0a43a1','34aa790a-8469-4476-bbec-74e652170a5a',
--   '484267fd-d284-4514-b7fc-7cfe44ef5280','e124e4e2-4c5d-40d0-a10a-9e874f059e34',
--   '4b0e45f1-8923-46b1-9c8b-31a54e135695','cef928ce-f22b-400e-994e-cde4c59a148a',
--   '7852b938-bc12-47d6-990a-5ce445ee5386','881d2c55-6bdf-4e20-b7f3-ab92d578c2bd',
--   '1f0b4611-0ee0-468a-acba-bffdebbd6705','33a67390-96d4-486f-9e41-e41791751cd6')
delete from clients
 where business_id = '677f59c1-0e93-4af9-bd42-4cd7de06a3bd'
   and id <> '8a1a55d1-560f-4f8c-b138-b259ced853e3';  -- keep Karla Klein
```

Equivalently: every demo invoice has `number between 5 and 65`; every demo visit
belongs to a client other than Karla. Do **not** reset
`businesses.invoice_next_number` after deletion — numbers are never reused.

## Marketing walk (2026-08-30)

Abby Chen's Aug 6 visit (`9824547c-8b69-4233-bc37-239bc0dba3f6`, report token
`cce5e0f6…`) had its synthetic track replaced with a loop of Memorial Park's
running trails (66 points, distance_m 2140) and its Mapbox report map rendered.
PURPOSE: the publish-safe report page for landing-page imagery — real walks
trace the sponsor's neighborhood and must never be published. Keep this visit's
track as-is; the bulk-removal predicate still covers it.
