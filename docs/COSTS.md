# Infrastructure cost projection (drafted 2026-08-30)

Prices verified against vendor pages/roundups 2026-08. Companion to docs/SAAS-PLAN.md
(its "unit economics" claim, now with receipts). Update when a vendor reprices.

## The stack and what each service is doing

| Service | Role | Plan today | Base $/mo |
|---|---|---|---|
| Supabase | DB, auth, storage, edge functions, cron | Pro | $25 |
| Vercel | app + marketing hosting (2 projects) | Pro | $20 |
| Resend | outbound email + inbound (hello@) | Free | $0 |
| Mapbox | one static map render per finished walk | Free tier | $0 |
| Expo EAS | builds + OTA updates | Free | $0 |
| Apple Developer | device builds → TestFlight → App Store | Annual | $8.25 (99/yr) |
| Domains (.com + .app, Squarespace) | — | Annual | ~$4 |
| **Total today** | | | **~$57/mo** |

## Per-tenant usage drivers (model: avg tenant ≈ 200 visits/mo)

- **Email ~600/tenant/mo**: 2 per visit (started + finished) + invoices + portal OTP logins
  + booking-request trio. NOTE: Resend counts INBOUND (hello@ catch-all) against the same
  quota, and each To/CC recipient separately.
- **Mapbox ~200 requests/tenant/mo**: render-once means exactly one Static Images call per
  finished walk; report-page views hit OUR stored copy (Supabase egress, not Mapbox).
- **Storage growth ~0.7 GB/tenant/mo**: ~2 photos/visit (~1.5 MB) + 0.3 MB map. Cumulative.
- **Egress ~2 GB/tenant/mo**: clients viewing report pages (photos + map) + app API chatter.
- **DB growth ~6 MB/tenant/mo**: GPS tracks dominate (~30 KB jsonb/visit).
- **Edge invocations**: ~43k/mo BASELINE from the per-minute email cron alone, +~4k/tenant.
  Pro includes 2M — a non-issue below ~400 tenants.
- **Auth MAU ~30/tenant** (staff + portal clients). Pro includes 100k — never a factor.
- **EAS Update MAU ~3/tenant** — ONLY STAFF run the native app; clients are pure web.
  This is why EAS stays ~free: 200 tenants ≈ 600 update MAU vs 1,000 free.

## Projection by stage

| | Today (beta) | 10 tenants | 50 tenants | 200 tenants |
|---|---|---|---|---|
| Emails/mo | <1k | ~6k | ~30k | ~120k |
| Supabase | $25 | $25 | $35–85 ¹ | $150–250 ² |
| Vercel | $20 | $20 | $20 | $20 |
| Resend | $0 | $20 (Pro) | $20 (Pro, 50k cap) | ~$110 (Scale 100k + overage) |
| Mapbox | $0 | $0 (2k of 50k free) | $0 (10k) | $0 (40k — still free!) |
| EAS | $0 | $0 | $0 | $0–19 (Starter for support) |
| Apple + domains | $12 | $12 | $12 | $12 |
| **Total/mo** | **~$57** | **~$77** | **~$90–160** | **~$300–450** |
| **Cost/tenant** | — | ~$7.70 | ~$2–3 | ~$1.50–2.25 |
| Revenue @ $19–39 | — | $0 (founding) | ~$1,250+ | ~$5,000+ |
| **Gross margin** | — | — | **~90%+** | **~92–94%** |

¹ 50 tenants: file storage passes the included 100 GB after ~3 months (+$0.021/GB ≈ $4 at
  300 GB) and the Micro compute instance likely wants a bump (+$10–50).
² 200 tenants: bigger compute ($60–110), storage ~1 TB (+$20–25 and growing), egress
  ~400 GB (+$13 over the 250 GB included). A Team-plan jump ($599) is about SLA/SSO, not
  capacity — defer until a customer demands it.

## Costs that arrive with FEATURES, not scale

- **SMS (Twilio, dormant)**: 10DLC campaign ~$2–15/mo + ~$0.008/segment. At 2 msgs/visit,
  ~$3.20/tenant/mo — the single biggest marginal cost in the roadmap. Price it into the
  Team plan (it's already positioned as a Team feature in the SaaS plan).
- **Stripe Billing (subscriptions only)**: ~2.9% + 30¢ on each tenant's $19–39 charge ≈
  $0.85–1.45/tenant/mo. Card processing for tenants' CLIENTS stays off the books (P2P).
- **Supabase PITR**: $100/mo — declined at one-tenant scale (RUNBOOK-BACKUPS.md); revisit
  around 10–25 paying tenants, funded by ~3 subscriptions.
- **Mapbox Directions** (travel-time Phase 2): free 100k/mo directions requests with
  per-client-pair caching — effectively $0 at any plausible scale.

## Watch-outs (cheap today, surprises later)

1. **GPS tracks live in the DATABASE (8 GB included)**, not file storage. ~1.2 GB/mo of
   track jsonb at 200 tenants hits the cap in ~6 months. DB overage is cheap
   ($0.125/GB) but the right Phase-C move is archiving old track points to storage
   (reports only need the rendered map after N months).
2. **The hello@ catch-all counts against Resend quota** — a spam wave to random
   @stridetail.com addresses eats sending quota. If it ever happens: scope the MX to
   specific addresses or filter in the inbound function.
3. **Per-tenant caps matter more than totals**: one runaway tenant (900 walks/mo, huge
   photos) moves every meter. The SaaS plan's cost-telemetry item (per-tenant counters)
   is the guardrail — build it before tenant #10.
4. **Egress is the sleeper**: photos served to clients are the biggest byte stream.
   Photo compression on upload (already sized-down client-side) and signed-URL TTLs
   keep it in the included 250 GB for a long time.

**Bottom line**: the marginal tenant costs ~$1.50–8 depending on scale — against $19–39
revenue, the SaaS plan's ">95% gross margin at Solo $19" claim holds from ~50 tenants on,
and never dips below ~75% even in the awkward 10-tenant founding stage where revenue is
deliberately $0.
