# Stridetail Plan 7 — Ship the Web

> Spec: `docs/superpowers/specs/2026-08-26-stridetail-web-experience-design.md` (§0–§2, §4–§5).
> House constraints apply. Tick the Plan 7 table in docs/PRD-CHECKLIST.md per task.

**Goal:** email links come alive. stridetail.app serves the product web app (tokened
report/invoice pages + owner web); stridetail.com serves the marketing landing and Paw &
Whisker's SEO page. DNS moves off Squarespace parking (sponsor clicks, we hand exact records).

### Task 1: Product web → Vercel + stridetail.app
- `bunx expo export --platform web` with HOSTED env (the OTA env trap applies).
- `vercel.json` in a `web-deploy` staging dir (or repo root config — decide): rewrites so
  `/report/<anything>` → the exported `[token].html` (and `/invoice/*` likewise; inspect the
  export's actual dynamic-route output naming), SPA fallback for the app shell routes,
  headers: `X-Robots-Tag: noindex` on `/report/*` + `/invoice/*`.
- Deploy via the connected Vercel account (MCP/CLI) as project `stridetail-app`; attach
  domains stridetail.app + www (301). Output the DNS records the sponsor must set in
  Squarespace (replacing the parked A-preset for .app ONLY).
- Verify on the production URL: tokened invoice + report render live (use the real INV-0001
  token), owner sign-in works, deep tokens 404 correctly, noindex header present.
### Task 2: Marketing site scaffold + landing (stridetail.com)
- `marketing/` dir in-repo: hand-written static HTML/CSS (no framework), design-B palette,
  responsive, fast. Pages: `/` coming-soon landing per spec §4 (real screenshots pulled from
  docs/evidence where suitable, email-capture form → Supabase `waitlist` table via a tiny
  edge function or a mailto fallback v1 — decide, record), `/privacy`, `/terms` (solid
  template drafts marked DRAFT pending review).
- Second Vercel project `stridetail-marketing`; domains stridetail.com + www → 301.
### Task 3: Paw & Whisker SEO page
- `marketing/p/paw-and-whisker/` static page: LocalBusiness JSON-LD, services, Houston area
  targeting, meet-&-greet CTA (tel/mailto v1), photos placeholder-safe. Copy drafted for
  Alexandra's sign-off — page marked visually complete but flagged DRAFT in the checklist.
### Task 4: SEO plumbing + Checkpoint 7
- robots.txt + sitemap.xml both domains; OG tags + social card; favicon reuse.
- checkpoints.md **Checkpoint 7**: on a phone with NO app installed — invoice email → tap →
  live page renders → Venmo button opens; marketing landing loads on .com; P&W page passes
  Google Rich Results test for LocalBusiness.
### Definition of done
A client with nothing installed taps an email link and sees their branded invoice on the
real domain. stridetail.com pitches the product; /p/paw-and-whisker exists for Google.
