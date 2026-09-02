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
   show it. **Next binary MUST bump version to 0.2.1** to light it up.
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
- iOS build 2b0d887d → submitted to App Store Connect (build 4), processing.
  `ascAppId` now in eas.json submit profile — future submits fully
  non-interactive. NOTE: 0.2.0(3) still "Waiting for Beta App Review" for the
  external group; once 0.2.1(4) processes, consider pointing the group at it.
- Android build 3a3da19c → 0.2.1 (versionCode 3) UPLOADED to Play internal
  testing 2026-09-01 (sponsor, manual). Next Android build: wire `eas submit
  -p android` (Google service-account JSON) to retire the manual step.
- OTA note: future `eas update` publishes target runtime 0.2.1 — 0.2.0
  binaries are frozen at the round-2 OTA until replaced.
- Legal pages finalized same night: draft banners removed from /terms +
  /privacy (effective Sep 1, 2026), contact fixed hello@stridetail.app →
  hello@stridetail.com (the .app address received no mail), privacy now lists
  short videos + the per-client marketing-photo consent record.

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
