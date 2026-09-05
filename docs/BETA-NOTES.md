# Beta notes — running feedback & roadmap (started launch night, 2026-08-31)

Living list for Alexandra's beta week. Items graduate to plans or die here.

## Shipped during beta
- **Crash telemetry, tier 1** (2026-09-05, after Alexandra's build-8 startup
  crash arrived as an expo-updates ErrorRecovery abort with no JS error —
  diagnosis was pure guesswork): `src/lib/crashReport.ts`, no SDK, OTA-safe on
  every deployed binary. Hooks RN's global fatal handler, persists the error
  to a local crash_reports table FIRST (boot crashes may never get a network
  tick), best-effort POSTs to Sentry's envelope API via plain fetch, and
  flushes stored reports on the next healthy launch (14-day prune). Dormant
  until `EXPO_PUBLIC_SENTRY_DSN` lands in the EAS production environment —
  sponsor creates the sentry.io project (account creation is his); then one
  OTA arms it. **Tier 2 for BUILD 9: install @sentry/react-native + its expo
  config plugin (native crash handling); init with enableNative only where
  the native module exists.**
- **Missed visits now visible in Schedule** (2026-09-05, Alexandra's report:
  "1 visit missed — review in Schedule" but "when I open the schedule nothing
  shows up" — the missed visit was Pauline Bitar, Sep 4 7 PM, accepted and
  never started): Today's alert scans 26 h back but Schedule queried from
  now() FORWARD — a missed visit, being past, could never appear where its
  alert pointed. Schedule now shares the same lookback constant
  (MISSED_LOOKBACK_MS in schedule/api) and renders a red "Missed" section at
  the top (client · day · time · walker, tap-through to the visit to cancel or
  rebook); splitScheduleWindow keeps lookback noise (old completed rows) out
  of the day groups while letting in-grace late walks show. Manual updated.
- **Web-safe confirms, full sweep** (2026-09-05, sponsor field report: "the
  Finalize button does not seem to work" on desktop web): Alert.alert buttons
  never fire on web (the team.tsx lesson) — this round hunted down EVERY
  remaining mutation gated behind one and converted it to an inline confirm:
  payout statement Finalize / Void / Mark paid, invoice Send / Resend / Void,
  deposit Refund / Forfeit, report Resend / Revoke link, visit Cancel, pet
  document Remove, and the walker's redundant second finish confirm (deleted —
  the notes card IS the confirm). Post-action popups became inline notices;
  the two GPS-denied notices keep the native Alert (it floats above the
  navigation that follows) and use inline text on web; the walker's post-
  finish "text the client" offer skips straight home on web (no Messages app
  there — and its Alert would otherwise strand the walker). Grep proves no
  web-reachable Alert-gated mutation remains.
- **Money-review two-bug round** (2026-09-05, from the "Money feature" review
  prompt — full prompt archived at docs/MONEY-HUB-PROMPT.md, both bugs verified
  before touching code):
  - *Owed now was incomplete*: walker_owed_now only counted earnings/tips not
    yet on a statement, so DRAFTING a statement zeroed "Owed now" with no money
    moved. Now returns three disjoint parts (loose wages, unclaimed tips,
    unpaid draft/finalized statement totals) — invariant pinned by pgTAP 025:
    draft/finalize move money between parts, only Mark paid reduces the total.
    Bonus from the same rewrite: a REMOVED walker with an unpaid statement
    stays listed (frozen statement total, null percent, no invented wages).
    Migration `..11_owed_now_complete` (drop+recreate, regrant).
  - *Balance glance netted deposits against debt*: "$50 deposit − $25 unpaid
    walk" showed "+$25 credit", hiding the unpaid invoice. clientBalances now
    keeps { owedCents, heldCents } apart and every surface (client list, client
    profile, desktop dashboard) shows up to two parts: red "Owes $X" + green
    "Holding $Y" (true overpayment still reads "$X credit"). Never netted.
  1084 jest + 809 pgTAP green; manual updated.

## Parked: the full "Money hub" epic (docs/MONEY-HUB-PROMPT.md)
The rest of that prompt is a Billing-2.0 reorganization — a people-first Money
destination (Clients owe / You owe walkers / Deposits held), partial-payout
schema, multi-walker tip allocation with a "needs allocation" state, an
overpayment/unapplied-credit model, needs-attention feed, date-range semantics,
18 acceptance scenarios. Deliberately parked mid-beta (testers just learned the
current billing surface; several items are new business policy). Revisit as the
first post-beta phase, fed by beta feedback. The two calculation bugs it
flagged are fixed above; everything else in the prompt remains open.
- **External code-review fixes, all 5 findings** (2026-09-05, review doc "stridetail
  review 952026" at commit cc569be — both P1s verified real before touching code):
  1. *Cross-business price overrides (P1)*: composite FKs `(client_id, business_id)`
     and `(service_id, business_id)` on client_prices (unique pairs added on
     clients/services); expand-series now also filters overrides by business_id.
     Migration `..09_client_prices_tenant`, pgTAP 023.
  2. *Offline outbox black hole (P1)*: retryable failures no longer go terminal
     after 10 attempts — items retry forever under the capped (5 min) backoff and
     stay visible in pending counts; legacy 'failed' rows restored to 'pending' on
     every db open. Strict FIFO still blocks later work behind a stuck head item.
  3. *Sync stalls after an offline finish (P2)*: the 30 s interval now runs on
     `hasPendingWork()` (active visit OR non-empty outbox), not just the active
     marker that stopVisitTracking clears.
  4. *Offline walks lost their real times (P2)*: start/finish payloads stamp the
     device instant; `start_visit`/`finish_visit` accept validated
     `p_started_at`/`p_finished_at` (fallback-to-now on absent/unreasonable, finish
     clamped ≥ start, old call shapes fine — old signatures DROPPED to dodge the
     overload gotcha). Migration `..10_offline_timestamps`, pgTAP 024. A 30-min
     offline walk uploaded late now reports 30 min, not seconds.
  5. *Delete-vs-in-flight-upload race (P2)*: a local event removal also enqueues a
     `visit.event.delete` tombstone op — FIFO puts it after any copy a running
     drain uploads; zero-row server delete is a clean no-op.
  1080 jest + 799 pgTAP green. Client half is OTA-able (no native changes); server
  half MUST be applied to hosted before the OTA publishes (old server rejects the
  new RPC arg names).
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

## External recruits
- **First stranger tester (2026-09-01):** a Houston dog walker Alexandra found via
  NEXTDOOR — alexandriachalet@gmail.com, added to the TestFlight external group
  (invite sends on beta approval). PLAN: they create their OWN business (never a
  walker on P&W — door-code exposure); they are founding-member prospect #1 and the
  first honest-signal user. Watch their onboarding funnel server-side. Validates the
  Nextdoor/local-network recruitment channel from the SaaS plan.

## Open Round 1 questions
- Catalog extras (meds / transport / grooming / aquarium / house sitting) — add with prices?
- Preferred walker on portal requests?
- Auto-send reports confirmed as default? (recommended yes — matches her site's promise)
- Leads: keep inbox → Add Client procedure, or want a dashboard inquiries card?
- Business-name/logo edit UI (D2 gap — name was fixed by SQL on launch night).

## Alexandra's wish list (texted 2026-09-01, day-1 of full testing)
ROUND-2 DECISIONS (Alexandra by text, 2026-09-01): defer #3/#4 texting ("ignore
the text messaging" — she'll copy/paste links from her current business number;
sponsor to research SMS approaches later). GREEN-LIT: #5, #2, #1, and #7 with a
**10-second video cap** (her number). Build order: 5 → 2 → 1 → 7.
1. Custom map marks — SHIPPED 2026-09-01: 'mark' event type, Mark button
   (More row) drops a labeled pin at the current spot (nearest-in-time track
   fix, same rule as pee/poop/photo); on live walk map, static report map
   (public/markers/mark.png, deployed), and report timeline ("Marked spot").
2. Remove markers before report sends — SHIPPED 2026-09-01: Remove link on
   the walk screen's Recent list; pending outbox items dequeue locally, synced
   rows delete under a new walker RLS policy (own running visit, structural
   started/finished rows protected). Window closes at finish, as she asked.
3. Per-client report channel: email or text (pairs with #4).
4. Reports texted from a BUSINESS number, not her personal phone (with #3 =
   one feature: Twilio SMS channel, ~$1–2/mo per number. Biggest lever on the
   list — she manually texts links from her personal number today, and it
   covers the 5 email-notifs-OFF DoggyLogs clients + 3 no-email clients).
   INTERIM (agreed 2026-09-01): Alexandra gets a FREE Google Voice number for
   P&W and texts links from the GV app — personal number hidden today, $0,
   zero code. Still manual (GV has no send API). Later: PORT the GV number to
   Twilio (~$3 unlock + port) when building the automated channel, so clients
   keep the same number. Tip: pick a memorable Houston number — it's permanent.
5. Vaccine gating — SHIPPED 2026-09-01: businesses.required_vaccines jsonb
   (species-keyed), Settings "Required vaccines" card (dogs: rabies/DHPP/
   lepto/bordetella; cats: rabies/FVRCP, save-on-tap), New Visit shows red
   non-blocking warnings for missing/expired required vaccines on selected
   pets. Lenient: a doc on file with no expiry counts as current.
6. Photo-marketing consent flag on client profiles — SHIPPED 2026-09-01
   (`clients.marketing_photos_ok` 3-state: null=not asked/true/false; chips on
   the client form, colored line on client detail + walker visit brief, "not
   asked = treat as no" default; OTA'd to preview + production channels).
7. Report videos — CODE SHIPPED 2026-09-01, **DORMANT until the 0.2.1
   binary**: 'video' event type, Video button (camera, videoMaxDuration 10 +
   duration guard, iOS Medium quality → H.264), clip rides the photo pipeline
   into media bucket (.mov/.mp4), report page "Videos" card (<video> on web,
   open-URL fallback native). GOTCHA: app.json had microphonePermission:false
   — iOS crashes video capture without the plist key, and OTA can't add plist
   keys. Fixed in app.json; the Video button is gated on
   Updates.runtimeVersion >= 0.2.1 (videoSupport.ts), so 0.2.0 binaries never
   show it. LIVE-VERIFIED 2026-09-01 on the 0.2.1 TestFlight build (sponsor):
   button appeared via the runtime gate, clip captured → synced .mov in bucket
   → signed URL in report-public payload → Videos card on the report page,
   playback confirmed in Chrome (H.264 via iOS Medium quality — as designed).
8. (Sponsor add, 2026-09-01) Expo push notifications — FREE channel, no
   carrier registration. First use: STAFF (visit offers/requests/payments —
   everyone has the app); later: report-ready push for app-using clients.
   Does NOT replace SMS (the manually-texted clients don't have the app; the
   no-email 3 can't OTP into the portal). Ladder: push → email → SMS.
   Needs a new native binary (expo-notifications, no OTA); EAS manages
   APNs/FCM creds. Pairs with whatever the next build ships.

## 0.2.1 release (cut 2026-09-01 night)
- Version bumped 0.2.0 → 0.2.1 (runtimeVersion follows). Carries the mic
  permission → **Video button lights up on these binaries**.
- iOS build 2b0d887d → **BETA APP REVIEW APPROVED 2026-09-02** (0.2.1 build 4;
  sponsor had pulled 0.2.0(3) from the queue). External "Stridetail Beta"
  group invites auto-sent (Alexandra, Kelly, Nextdoor recruit). `ascAppId` now
  in eas.json submit profile — future submits fully non-interactive.
  Sponsor verified video end-to-end on this build (TestFlight internal),
  Chrome playback confirmed.
- **TESTFLIGHT MIGRATION COMPLETE 2026-09-02**: Alexandra installed 0.2.1(4)
  (iPhone 17), Kelly in via the group PUBLIC LINK
  (https://testflight.apple.com/join/CJVDr5Jk — share person-to-person only).
  Kelly gotcha for the file: her main Apple Account matched, but TestFlight
  follows the Media & Purchases identity, which can differ — the public link
  is identity-agnostic and is the universal fix. Ad-hoc/preview era OVER:
  OTA publishes go to the PRODUCTION channel only from now on; preview channel
  retired (stop publishing; nothing to delete). Chalet invite still "Invited".
  OPEN cleanup: cancel the Alexandria Chalet App Manager ASC invite (stranger;
  external group only); optionally drop Kelly's stale internal-tester row +
  ASC team membership (public link covers her).
- Android build 3a3da19c → 0.2.1 (versionCode 3) UPLOADED to Play internal
  testing 2026-09-01 (sponsor, manual). Next Android build: wire `eas submit
  -p android` (Google service-account JSON) to retire the manual step.
- OTA note: future `eas update` publishes target runtime 0.2.1 — 0.2.0
  binaries are frozen at the round-2 OTA until replaced.
- Legal pages finalized same night: draft banners removed from /terms +
  /privacy (effective Sep 1, 2026), contact fixed hello@stridetail.app →
  hello@stridetail.com (the .app address received no mail), privacy now lists
  short videos + the per-client marketing-photo consent record.

## Round 4 (Alexandra by text, 2026-09-03) — staff push, **LIVE-VERIFIED 2026-09-04**
Sponsor installed 0.2.2(5) internal, allowed notifications, token registered;
a queued visit_offered row delivered to his LOCK SCREEN on the first cron tick
("New visit offer — Margo · 30-Minute Dog Walk — Wed, Sep 2, 11:00 AM. Open to
accept or decline."), status 'sent', 0 retries. Full chain proven:
queue → cron → send-push → Expo → APNs → phone, with enrichment.
BOTH DIRECTIONS verified same session: sponsor accepted a REAL offer push in
Geff Dog Walker Demo, declined ("Going to the beach") → owner decline push
sent back to his phone; the co-owner (reviewer@stridetail.com, no tokens) got
the designed skipped_no_provider — owner fan-out + graceful skip both proven.
- Her ask: walkers notified "when a call needs to be reviewed and accepted/
  declined" — wish-list #8 landing. Three staff moments wired, all through the
  existing notifications queue (new channel='push', mirror of sms/email):
  1. visit_offered → push to the offered walker ("Olivia · Walk — Thu, Sep 4,
     3:00 PM. Open to accept or decline.")
  2. visit_declined → push to all active owners (walker name + reason)
  3. booking_request → push to all active owners (client name)
- Plumbing: push_tokens table (own-rows RLS; sender reads via service role);
  queue_push definer helper; offer_visit/decline_visit replaced to queue;
  booking_requests AFTER INSERT trigger; per-minute send-push cron (own vault
  secret push_cron_secret, aligned to PUSH_CRON_SECRET env); send-push edge fn
  (claim-race-safe, 1/5/15/60 backoff, DeviceNotRegistered prunes tokens, no
  tokens = terminal skip). Deployed to hosted; pgTAP 765 green.
- Client: registerForPush() on staff sign-in in both layouts (permission ask,
  Expo token upsert); **BINARY-GATED to runtime >= 0.2.2** (expo-notifications
  is native; 0.2.1 binaries no-op via pushSupportedFor — videoSupport pattern).
- **0.2.2 CUT + SUBMITTED 2026-09-04**: first iOS build (e995f8ca) ERRORED —
  the App Store provisioning profile lacked the Push Notifications capability
  (non-interactive builds reuse stale profiles; the predicted trap, one level
  deeper). FIX: sponsor ran ONE interactive `eas build -p ios` in the app
  terminal — capability synced to the bundle id, new profile generated, AND
  the Apple Push Notifications service key created + assigned (the delivery
  credential). Rebuild 52b6981c FINISHED, submitted to ASC — processed as **build 6** (the ERRORED build e995f8ca consumed number 5; EAS increments at build start).
  Android 9bcbd6ea FINISHED → 0.2.2 (vc 4) UPLOADED to Play internal testing
  2026-09-04 (sponsor, manual). Push delivery on Android still needs FCM v1
  creds on EAS — deferred until a real Android tester exists.
- Build 6 attached to external "Stridetail Beta" group 2026-09-04 (sponsor) —
  repeat-build review, expected quick; testers auto-update on approval.
- Build 7 (bda238ee) cut Sep 4 night with rounds 5/5b/6a + updates card
  EMBEDDED; sponsor verified on-device, then ADDED TO THE EXTERNAL GROUP
  (supersedes 6 for review). On approval all three external testers land on
  the fully-loaded build with the self-serve update card.
- Android delivery additionally needs FCM v1 credentials on EAS (not set up —
  zero Android users; do when a real Android tester exists).

## Round 5 candidate (ALEXANDRIA CHALET via TestFlight feedback, 2026-09-04)
- **FIRST STRANGER ENGAGED**: installed 0.2.1(4) Sep 4 (iPhone 15 Pro, CDT),
  entering real pets (Bernese "Lola"), sent structured TestFlight feedback w/
  screenshot. The Nextdoor channel works.
- Her ask: spayed/neutered checkbox + last-heat for intact females ("spent the
  weekend with 2 unneutered males and a female in heat"), or at minimum a
  male/female mark "so the sitter knows to ask". Validates the DoggyLogs sex
  field we dropped at migration (sexes parked in client notes_md).
- **SHIPPED 2026-09-04 (same day)**: pets.sex/fixed/last_heat; Sex +
  Spayed/neutered chips on the pet form, "Last heat" field appears for intact
  females; "Female · spayed" / "Male · INTACT" (warning-highlighted) on the
  owner pet profile AND the walker visit brief — intact flags, unknown never
  does. 10 migrated DoggyLogs singles backfilled with their recorded sexes
  (pairs left null — per-pet sex was ambiguous in combined records). OTA'd to
  production (runtime 0.2.2 — NOTE: 0.2.1 phones froze at the round-4 OTA when
  the version bumped; testers on 0.2.2 via TestFlight get this). 1068 jest,
  765 pgTAP.
- ALSO SOLVED: Kelly's "No Builds Available" named row is vestigial — her real
  membership is the "Public link — Anonymous" row (15 sessions, iPhone 13).
  Named row safe to delete.

## OTA self-serve (2026-09-04 night — sponsor's stuck update on iOS 27 beta)
- Sponsor's 0.2.2(5) phone wouldn't apply tonight's OTAs — reinstall did NOT
  fix it. Server exonerated end-to-end: channel→branch mapping correct,
  manifest served to a simulated device (multipart accept header required —
  plain accept gets 406), and the eascdn asset 403s during probing were a RED
  HERRING (Expo requires the expo-updates client's authorization headers;
  probes get "Unauthorized asset request" by design). Failure is ON-DEVICE;
  leading suspect: iOS 27 dev beta (OTA worked on the same phone Sep 2 —
  possibly a newer beta seed since). PRAGMATIC FIX: build 6 cut with
  everything embedded; the embedded App-version card's Check button will
  surface the real checkForUpdateAsync error for diagnosis.
  **RESOLVED same night:** build 7 (#7 — errored build consumed #5, phone was
  on #6) installed with everything embedded → fields present; the card's
  "Check for updates" then FOUND, FETCHED, and APPLIED the next OTA on the
  SAME iOS 27 phone. Verdict: pipeline healthy; build 6's install had a wedged
  updates state that survived reinstall. Not iOS 27, not the server. The
  self-serve card is the permanent remedy — stuck testers self-diagnose in
  Settings. ALSO UNRESOLVED:
  Alexandria's 0.2.1(4) screenshots show round-2 features (Remove) but not
  round-3 (age field) — inconsistent with fetch-latest semantics; watch her
  device after build 5/6 lands.
- HARDENING SHIPPED: Settings "App version" card (all roles) — shows the
  running bundle (built-in vs update id + publish time) and a "Check for
  updates" button that downloads AND applies with an in-place restart
  (appUpdates.ts). Retires force-quit-twice for all testers. OTA'd.

## Round 7 — TIPS (sponsor, 2026-09-04 evening) — SHIPPED
- The problem: $30 recorded on a $25 walk showed a -$5 "credit owed back";
  the extra was really Kelly's tip. Demo's negative Paid amounts were this.
- Model: payments.tip_cents beside amount_cents (whose meaning is unchanged —
  all balance math survives untouched). Tip never counts toward the invoice;
  record_payment gains p_tip_cents; Record-payment form gains a Tip field;
  payments list shows "+ $5.00 tip".
- Payouts: create_payout_statement sweeps unclaimed period tips at **100%**
  (payout percent applies to wages only) as "Tip — Mon D" items; claimed via
  payments.tip_statement_id (once, ever). Mixed-walker invoices' tips stay
  unclaimed rather than guessing a split (fine under invoice-per-visit).
- FOLLOW-UP FIX (same night, found while explaining the flow): the tip sweep
  had a period LOWER bound, so a tip recorded after its period's statement
  existed could orphan between statements. Sweep now takes any unclaimed tip
  up to the period end — late tips ride the next statement.
- POSTGRES LESSON (bit us live): create-or-replace with an added defaulted
  param = ambiguous OVERLOAD; drop the old signature AND re-pin execute
  grants on the new one (fresh signature = fresh PUBLIC execute).
- Demo overpayments reclassified into tips (4 payments). pgTAP 022 (7 tests,
  suite 779 green); restart-button now explains the iOS "crashed" dialog.

## Round 7e — staff report access + walker history (sponsor, 2026-09-04 late) — SHIPPED
- Walkers had NO path to old visits (Today looked back 26h; Schedule tab is
  availability). Today gains a collapsed "Past walks" section — last 60 days
  of completed visits, lazily fetched, tap-through to the visit.
- Every completed visit now has "View report" for staff: owners in the
  ReportSection (next to Share), walkers via WalkerReportLink (own-report RLS
  read; hidden when revoked/unsynced). Opens the exact client-facing page.

## Round 7d — remove mis-recorded payments (sponsor, 2026-09-04 late) — SHIPPED
- The last append-only corner closed: every payment row on an invoice gets a
  web-safe Remove (inline two-tap). remove_payment RPC: owner-only, reverts
  paid -> sent when the invoice drops below total (status machine gained its
  first reverse arm, paid->sent, for exactly this), audited both ways.
- GUARD: a payment whose tip is already on a payout statement is FROZEN —
  void the draft statement first; finalized = support. No silent double-books.
- Correction model is remove-and-re-record, never in-place edit — mistake and
  fix both stay visible in the audit log. pgTAP 022 now 13 tests; 011 matrix
  updated. Manual documented.

## Round 7c — "Owed now" payout balances (sponsor, 2026-09-04 evening) — SHIPPED
- The gap: after tips, nothing showed the owner what they owe each walker
  until a statement was created. Payouts now OPENS with "Owed now": per
  active member, wages on unswept completed visits (at their %) + unclaimed
  tips — exactly what the next statement will sweep. walker_owed_now RPC
  (owner-only, definer, grants pinned). pgTAP 022 extended (owed → sweep → 0).
- TYPE GOTCHA: memberships.payout_percent is numeric(5,2) — RETURNS TABLE
  declared int broke with "structure of query does not match"; declare numeric.
- App-side ledger STILL not rendering on sponsor's device despite updates —
  BUILD 8 cut with everything embedded; **VERIFIED WORKING on build 8**.
  Verdict on the device saga: sponsor's iOS 27 beta applies OTAs
  unreliably (some yes, some silently dropped) — feature code was always
  fine. POLICY: sponsor's phone rides binaries; stable-iOS testers ride OTAs.
- Build 8 attached to the external group 2026-09-04 (supersedes 6/7 for
  review). On approval, all testers land on the complete accounting build:
  tips, owed-now, ledger, picker, spay/sex, push, update card.

## Round 7b — inline client ledger (sponsor, 2026-09-04 evening) — SHIPPED
- Balance on the client profile now UNFOLDS IN PLACE (no bounce to Billing):
  every invoice w/ live status chip + open amount (tap-through), "Collected
  $X + $Y in tips across N payments", held deposits. ClientLedger.tsx.
  The Billing-tab client picker stays for the roster-wide view.

## Round 6b — billing client focus (sponsor, 2026-09-04 night)
- Ask: client-profile Balance tap should show THAT client's invoices. V1
  (?client= param) worked on web, failed on iOS; v2 (useGlobalSearchParams)
  still failed on his device. FINAL FORM (sponsor's own suggestion): an
  in-screen **Client picker** on Billing — chip list, "All clients" default,
  narrows the list AND the summary strip; pure component state, immune to
  router/tab quirks; the URL param only seeds it (desktop deep-link intact).
  LESSON: on native tab screens, don't build features on search params —
  own the state in the screen. OTA'd production.

## Round 5b (ALEXANDRIA's 4-item TestFlight barrage, 2026-09-04 4:31–4:39 PM)
1. **BUG, FIXED SAME HOUR**: Remove on a SYNCED event failed 42501, rendered
   "[object Object]". Root cause: round-2 shipped the walker DELETE POLICY on
   visit_events without the table-level DELETE GRANT (grants and policies are
   separate layers — same family as the 8/23 revoke-from-public lesson; the
   family testers never hit it because their removes dequeued from the outbox
   before sync). Grant applied to hosted (fixed for her 0.2.1 instantly);
   shared src/lib/errorText.ts unwraps message-bearing objects across all 28
   call sites (OTA runtime 0.2.2); pgTAP 021 pins grant+policy; BONUS FOUND:
   push_tokens had default anon grants (new-table trap, broke 019's invariant)
   — revoked. 771 pgTAP.
2. **Per-client pricing — BOTH OPTIONS SHIPPED 2026-09-04 (round 6a)**:
   (a) client_prices table (owner-only RLS, anon revoked at birth) + "Custom
   prices" card on the client profile — per-service override replacing the
   BASE price (extra-pet charges still stack; past visits/invoices untouched);
   applied at visit creation AND series expansion (expand-series redeployed
   override-aware). (b) The New Visit price field is EDITABLE for one-off
   visits (defaults to override-aware computed price; derived-state drift
   guard, React-Compiler-lint clean). OTA'd production. 1069 jest, 771 pgTAP.
3. **Tab-bar "glitch"** (sometimes 4 tabs, sometimes 6): BY DESIGN but
   confusing — the active-walk screens live in the walker route group, so a
   dual-role owner sees the walker shell (4 tabs) while walking and the owner
   shell (6) elsewhere. Backlog: unify shells or add a clear "back to owner
   view" affordance. Explain to testers meanwhile.
4. **Un-complete a visit** (accidental finish/test visits): completed is
   terminal by design (report + invoice lines exist). Backlog design: owner
   "reopen visit" that revokes the report + pulls draft-invoice lines, and/or
   a walker "abort visit" for accidental starts. Needs design, not a quickie.

## Round 3 (Alexandra by text, 2026-09-02) — SHIPPED same day
- **Age instead of birthday** on the pet form ("a lot of people don't know
  their dog's birthday"): one field accepts "3", "3.5", "8 mo", or an exact
  YYYY-MM-DD; birthdate derived (today minus duration, day-clamped) so
  vaccine expiry + age display keep working. DRIFT GUARD: editing a pet
  without touching the age field keeps the stored birthdate byte-identical.
- **Delete pet** (her accidental duplicates): Delete pet on the pet profile,
  inline two-tap confirm (web-safe). HARD-BLOCKED when the pet appears on any
  visit — history stays intact; that case waits for archive. Cascades
  documents; sweeps photo + doc storage objects best-effort.
- OTA'd to production channel (runtime 0.2.1) — both testers get it on next
  restart. 1064 jest tests.

## Test-data hygiene (2026-09-02, Kelly's test walks)
- Invoice lifecycle covers it: draft (editable) → sent (immutable) → paid/void
  (terminal). Void releases deposits, frees visits, revokes the pay page,
  keeps the number (gapless tombstone — accounting discipline, no hard delete).
- Rules for the testers: test only against the test client records (Geffrey
  Klein / Alexandra klein); Void test invoices when done; NEVER Record payment
  on a test invoice (payments = dashboard revenue, no in-app undo; SQL rescue
  only). Sponsor leaving cleanup to Alexandra's discretion.
- Current books: INV-0001 $25 paid = REAL (Olivia). INV-0002 void. INV-0003
  $25 sent to Alexandra-as-client = TEST, hers to void.
- REAL money spotted: Poppy's Sep-1 walk ($25, Neha) completed but UNINVOICED.
- Backlog tie-in: voided test visits become invoiceable again — the archive-
  clients feature is the permanent fix.

## Migration track (DoggyLogs, ~17 clients + appointments)
- **ROSTER IMPORTED 2026-09-01**: 16 client screenshots from Alexandra parsed →
  16 clients + 22 pets inserted via SQL (combined "X + Y" DoggyLogs pet records
  split into individual pets, breeds matched by position; assumptions + DoggyLogs
  quirks recorded in each client's notes_md). P&W now 19 clients / 24 pets.
  Not geocoded (lat/lng null) — editing+saving a client in-app re-geocodes.
- **Open questions for Alexandra** (email if she doesn't surface them in-app):
  Jae's last name + email; Brody + Mia species/breeds; Hankanthony breed;
  Rudy's breed (assumed Chihuahua); Yvette "Matthew's" spelling; whose number
  is Marilyn Klein's second (281) 236-8700; most ZIPs missing (cosmetic).
- **Notification mismatch**: 5 clients had email notifications OFF in DoggyLogs
  (Cindy Warner, Niaz Siamak-Lighvani, Jenny Lewis, Roxanne Wieland, Marilyn
  Klein) but Stridetail has no per-client email opt-out — they WILL get
  report/invoice emails now that their addresses are on file. Flag to Alexandra;
  possible backlog item (per-client email mute).
- 2 clients have NO email (Austin Cleveland, Jae) + Neha Akkad — no auto emails.
- Pet photos exist in DoggyLogs — Alexandra re-adds in-app (not imported).
- Appointments NOT imported: recreate future recurring walks as visit series in-app.
- Opening balances per onboarding pack §6 (carry-over invoices BEFORE deposits).
- Email info@doggylogs.com for a data export — no longer needed unless photos wanted.

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
- **Play identity decision (2026-09-01, sponsor call):** org = GK&KK LLC at its
  registered (home) address — proceeding AS-IS with verification, accepting that
  Play may display the org name/address publicly on listings (already TX public
  record). Revisit a virtual business address if it ever chafes. D-U-N-S must be
  GK&KK LLC's, not personal.
- **Play verification prep**: ORGANIZATION account (skips the personal-account
  12-tester/14-day production rule). Order: identity/org verification + D-U-N-S
  FIRST; phone verification unlocks after approval. Public "developer phone" =
  Stridetail Google Voice (832) 844-6596; private contact = sponsor cell. The
  .aab is at ~/Downloads/stridetail-0.2.0-vc2.aab awaiting "Create app" unlock.
- Play package registered (2026-09-01): app.stridetail / "Stridetail", keystore
  SHA-256 25:9B:15:02:...:34:F1 attached. Developer name set to Stridetail
  (public profile); D-U-N-S 135366746 (GK&KK LLC) on file; website pre-verified
  via GSC. Verification CLEARED same night.
- **Play INTERNAL TESTING LIVE 2026-09-01**: app entry created (Stridetail /
  app.stridetail, Free), release 0.2.0 (2) published to internal track
  ("Available to internal testers", 32.4 MB download). Tester list "Stridetail
  internal" = gyndok@gmail.com. Opt-in link:
  https://play.google.com/apps/internaltest/4701598200265848517
  Testers see temp name "app.stridetail (unreviewed)" until store listing +
  review — cosmetic. Warnings accepted: no deobfuscation file (Expo doesn't
  obfuscate). Emulator smoke test abandoned (TX age-verification law walls Play
  sign-in on new devices; no Android hardware in the family) — testing waits for
  a real Android tester. Next Android steps: wire `eas submit -p android`
  (service-account JSON); store listing later.
- **Android: FIRST BUILD DONE 2026-09-01** — Play Console account created (developer
  verification pending, a few days); keystore generated + stored on EAS; production
  .aab built (build 207d2c61, versionCode 2). Next: when verification clears, create
  the app entry, upload the .aab to INTERNAL testing (no 12-tester rule there), add
  testers. Personal-account note: PRODUCTION release later requires a 14-day closed
  test with 12 testers. First upload: manual via Play Console UI; wire `eas submit
  -p android` (Google service-account JSON) after.
- Sponsor: Google Search Console verification + sitemap submit; her Thumbtack backlink.
- Remove sponsor's owner membership from Paw & Whisker when her first real client
  household enters the portal (agreed cutoff).
