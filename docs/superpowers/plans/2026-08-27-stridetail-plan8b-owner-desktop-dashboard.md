# Stridetail Plan 8b (expanded) — Owner desktop dashboard

> SUPERSEDES the 2026-08-26 "owner command strip" draft (its KPI queries and
> derived on-a-walk-now land here). Sponsor supplied a desktop mockup
> 2026-08-27 ("Paw-gressive Walker Business Hub"): when the owner signs in on
> desktop web, Today becomes a dense multi-panel command center — KPIs,
> requests, schedule table, calendar, clients, services, billing.
> Still NO management/my-walks mode toggle and NO manual presence (spec §9).
> House constraints; tick the Plan 8b table in docs/PRD-CHECKLIST.md.

**Platform shape:** one codebase. `(owner)/today` renders the DASHBOARD layout
on web at width ≥ 1024 (the OwnerRail already gives desktop a left rail);
below that — and always on native — the existing Up-next hero Today is
untouched. Panels are self-contained components (src/features/dashboard/)
composed in a CSS-grid-style two/three-column layout; every panel deep-links
into the existing full screens rather than reimplementing them.

### Task 1: dashboard shell + KPI row
- Width-gated `OwnerDashboard` swap-in on today.tsx (minimal diff there).
- KPI cards (tap-through targets in parens): revenue this week + delta vs last
  week (payments by received_on → Billing), active clients + pet count
  (Clients), walks this week done/total (Schedule), outstanding balance +
  unpaid invoice count (Billing). One batched query module
  (src/features/dashboard/kpis.ts) with pure math split out and jest-tested.
### Task 2: operations panels — requests, attention, live
- Pending requests panel: full approve/decline cards inline (REUSE the
  existing request card component incl. the start-time picker — extract it
  from app/(owner)/requests.tsx into a shared component rather than fork).
- Needs-attention panel: unassigned visits (next 14 days), declined offers,
  expiring vaccine docs — the existing needs-attention queries, panelized.
- "Out on walks right now" strip derived from in_progress visits (walker,
  client/pets, started X min ago, tap → visit). No manual presence, ever.
### Task 3: schedule table + month calendar
- Week schedule TABLE (the mockup's "Walk Schedule Wkly"): rows date/time ·
  client+pets · service · walker · status chip; filters: week picker, walker
  (All/each); row tap → visit screen. Distinct from the existing week grid
  (which stays on the Schedule tab); table lives on the dashboard.
- Month mini-calendar: per-day walk counts (dots/badges), today highlighted,
  day tap → Schedule at that date. Business-tz correct (existing date libs).
### Task 4: business panels — clients, services, billing
- Clients & pets table: name · pets (name/species) · phone · flags (needs
  meet-&-greet, missing email) · quick links (profile, access codes). Search
  box. Row tap → client screen. "Add client" button.
- Services menu panel: the catalog with prices/durations (tap → services
  management). Billing hub panel: last ~8 invoices (number · client · amount
  · status chip) + outstanding rollup + "New invoice" and unbilled-visits
  count (existing uninvoiced query) → Billing.
### Task 5: assembly polish + desktop pass
- Grid composition per the mockup's hierarchy (KPIs → operations row →
  schedule/calendar/business columns), consistent card styling from tokens,
  empty states, loading skeletons kept simple. Keyboard/scroll sanity at
  1024–1600px and at 768 (tablet web falls back to mobile Today — record).
- Sponsor desktop pass with the demo business (the acceptance bar: Alexandra
  could run Paw & Whisker from this screen). Evidence note in checkpoints.md
  under a "Desktop dashboard pass" heading (no numbered checkpoint).

### Explicitly later (recorded, not lost)
- Mobile Today compact KPI strip (original 8b idea) — after desktop proves
  the queries. Drag-and-drop reassignment on the schedule table (existing
  backlog item). Charts/sparklines. Global search. Messaging panel = Plan 9.

### Definition of done
Owner signs in on a desktop browser and the whole business is on one screen —
money, requests, today's field reality, the week, the month, every client —
with every panel two clicks from the full workflow it summarizes.
