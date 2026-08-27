# Stridetail Plan 8b — Owner command strip

> Small follow-on to Plan 8 (sequenced after it — the requests KPI needs
> `booking_requests`). From the sponsor's dashboard brief, keeping the KPI cards and
> derived live status; explicitly NOT reintroducing the management/my-walks toggle
> (unified Today won on device testing) and NOT building manual presence.

**Goal:** the owner opens the app and reads the business in five seconds.

### Task 1: business-health KPI strip
- Owner Today (below the Up-next hero) — compact horizontally-scrolling cards:
  revenue today / this week (payments received, received_on based), outstanding
  balance (existing uninvoiced+unpaid queries), pending booking requests (tap →
  requests), walks today (done/total). One batched query module + jest; no new schema.
### Task 2: "on a walk now" derived status
- Where a visit is in_progress: a live strip on owner Today (walker display name, pet,
  started X min ago, tap → visit). Presence is DERIVED from visit state — no manual
  status field anywhere. (The walker's own active walk already shows via the hero.)
### Task 3: device pass
- Sponsor glance test on the phone: strip reads correctly during and after a real walk;
  numbers reconcile with Billing. Recorded in checkpoints.md as a note under
  Checkpoint 8 (no separate checkpoint).

### Definition of done
Revenue, money owed, pending requests, and who's out walking — visible on Today without
a single extra tap, derived entirely from existing data.
