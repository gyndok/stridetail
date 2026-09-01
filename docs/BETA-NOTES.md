# Beta notes — running feedback & roadmap (started launch night, 2026-08-31)

Living list for Alexandra's beta week. Items graduate to plans or die here.

## Shipped during beta
- **Walker removal / invite revoke** (2026-09-01, sponsor request): Team tab gains
  Remove from team + Revoke invite. RPC `remove_walker` — future offered/accepted
  visits return to the pool, history keeps the walker, blocked mid-visit, audited.
  Matrix amendment rode along: the owner can now WITHDRAW an offer and UNASSIGN an
  accepted visit directly (reassignment building block).

- **Payout percent editor** (2026-09-01, Alexandra's first field bug report — payouts
  showed 0% with no way to set it): Team tab rows show "payout N%" + Edit payout %
  (owner-only via the memberships update policy, validated 0–100). Kelly set to 75%
  by SQL immediately; UI shipped same hour.
- RESOLVED same night: the "Team member" ×3 chips were a stale client bundle —
  force-quit ×2 pulled the current OTA and names rendered. Screenshot-confirmed:
  "Kelly Whipple is paid 75% of each visit price." Lesson for beta support: the
  first question for any UI oddity is "force-quit twice, still there?".

- **Report map render-on-first-view** (2026-09-01, Alexandra's report: Poppy's map
  "had trouble loading"): root cause — map rendering lived ONLY in the email
  pipeline, and Poppy's owner (real client Neha) has no email on file → no email
  queued → no render, ever. ensureReportMap moved to _shared/reportMap.ts; the
  report-public function now renders on cache-miss (idempotent, warm path
  unchanged). Verified live on her actual report. FOLLOW-UPS: (a) remind
  Alexandra to add client emails when she has them — email-less clients get no
  automatic report/invoice emails at all (she texts links by hand); (b) observed
  GPS jitter on the track (sniffy-walk zigzags) — consider accuracy filtering,
  quality item not a bug.

## The delete-story backlog (from the same conversation)
- **Clients/pets with history → ARCHIVE, not delete**: hide from roster and pickers,
  keep invoices/reports intact. Hard delete only for the no-references typo case
  (app checks references first). DB delete policies already exist; UI deliberately
  absent until archive semantics are built.
- **Pet passing away**: archive with care — must not vanish from history.
- Until built: deletions are a support request (SQL under the owner policies).

## Open Round 1 questions
- Catalog extras (meds / transport / grooming / aquarium / house sitting) — add with prices?
- Preferred walker on portal requests?
- Auto-send reports confirmed as default? (recommended yes — matches her site's promise)
- Leads: keep inbox → Add Client procedure, or want a dashboard inquiries card?
- Business-name/logo edit UI (D2 gap — name was fixed by SQL on launch night).

## Migration track (DoggyLogs, ~17 clients + appointments)
- Email info@doggylogs.com for a data export (no export in their docs) — parallel path.
- Her paste-dump of client pages → parsed → roster import (clients + pets).
- Appointments NOT imported: recreate future recurring walks as visit series in-app.
- Opening balances per onboarding pack §6 (carry-over invoices BEFORE deposits).

## Infrastructure next
- **TestFlight: DONE 2026-08-31 (launch night!)** — production build 0.2.0(3) submitted
  via EAS (ASC API key stored, future releases non-interactive), internal Team(Expo)
  group live immediately, external "Paw & Whisker beta" group (Alexandra + Kelly)
  awaiting Beta App Review. Apple reviewer login: reviewer@stridetail.com (owner of
  the DEMO business only, verified via live auth). GOTCHA: SQL-created auth users need
  ''-not-NULL token columns or GoTrue 500s. Once approved: invites auto-send, testers
  install via TestFlight over the ad-hoc build; then retire preview channel + ad-hoc.
  Google: stridetail.com verified in Search Console (also Play-account prereq),
  sitemap submitted (4 pages), her page indexing requested.
- Sponsor: Google Search Console verification + sitemap submit; her Thumbtack backlink.
- Remove sponsor's owner membership from Paw & Whisker when her first real client
  household enters the portal (agreed cutoff).
