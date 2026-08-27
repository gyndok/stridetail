# Stridetail Plan 7b — Walk report maps

> Sponsor-approved 2026-08-26 (conversation): real base maps under the GPS track.
> Architecture decision: **render once per walk, not once per view** — at finish
> time an edge function makes ONE Mapbox Static Images request (path + event
> pins), stores the PNG in the private `media` bucket beside the report photos,
> and the report surfaces serve the stored image. Free tier then scales with
> walks (50k/mo), the token stays server-side (Supabase secret `MAPBOX_TOKEN`),
> and the image works identically on web, in email, and in future PDFs.
> Provider isolated behind one URL builder so MapTiler/Geoapify are a one-file
> swap. House constraints apply; tick the Plan 7b table in docs/PRD-CHECKLIST.md.

### Task 1: map renderer in the notification pipeline
- Deno lib `supabase/functions/_shared/staticMap.ts`: pure URL builder —
  polyline-encode the track (Mapbox polyline overlay, URL-length-aware:
  downsample points if the URL would exceed ~8k chars), start/finish markers,
  event pins (pee/poop/photo) from visit_events with coordinates, warm style,
  retina 2x, sensible bbox padding. Deno tests with pinned expected URLs.
- Hook into the existing send-email flow for `visit_finished` (the cron-driven
  worker): before sending, if the visit has ≥2 track points, fetch the static
  image ONCE and upload to `media` bucket at a deterministic path
  (`reports/<visit_id>/map.png`); idempotent (skip if object exists). Failure
  is non-fatal: email still sends, report falls back to the current SVG
  polyline. No schema change — presence of the storage object is the flag.
- `report-public` returns a short-lived signed URL for the map when the object
  exists.
### Task 2: report surfaces show the map
- Public report page (`app/report/[token].tsx`) and in-app report views: show
  the map image when the payload carries a map URL, SVG polyline fallback
  otherwise. Attribution line "© Mapbox © OpenStreetMap" per Mapbox ToS.
- Verify live on hosted after a real walk (sponsor) or SQL-simulated finish.
### Task 3 (rides the Sep 1 build): in-app live maps
- `react-native-maps` (Apple Maps — no key, no limits) on the active-walk
  screen and walker/owner visit detail: live polyline + event pins. Native
  module → lands in the same build cut as Alexandra's UDID; until that build,
  screens keep the SVG rendering (feature-detect, no crash on old binaries).
### Backlog (recorded, not in scope)
- Strava-style privacy trim (first/last ~50 m) before real-client scale.
- Interactive web map on the report page (static image suffices for v1).

### Definition of done
A finished walk's report page shows the route drawn on a real branded base map
with start/finish/event pins, at zero marginal cost per view, and old reports
without a stored map still render.
