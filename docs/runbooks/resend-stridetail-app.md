# Runbook: verify stridetail.app in Resend (Squarespace DNS)

Sponsor-provided walkthrough, 2026-08-25. Do this in a **dedicated Resend account for
Stridetail** (platform-entity separation; the interim sender is the sponsor's personal
account/domain geffreyklein.com).

## 1 — Records from Resend
Resend → Domains → Add Domain → `stridetail.app` (accept the recommended `send.` Return-Path
subdomain). Resend shows three records: MX, SPF TXT, DKIM TXT.

## 2 — Add in Squarespace (Settings → Domains → stridetail.app → DNS Settings → Custom Records)
**Squarespace auto-appends the domain to Host — enter only the prefix.**
- MX — Host `send`, Priority `10`, Value = Resend's mail server (e.g. feedback-smtp.us-east-1.amazonses.com)
- TXT (SPF) — Host `send`, Value = Resend's SPF string (e.g. `v=spf1 include:amazonses.com ~all`)
- TXT (DKIM) — Host `resend._domainkey`, Value = the long `p=...` key, no line breaks

## 3 — Verify
Resend → Verify DNS Records (5–30 min typical, up to 72 h). "Not found" after an hour almost
always = full domain in the Host field (record became send.stridetail.app.stridetail.app);
check via mxtoolbox.com.

## 4 — stridetail.com
Do NOT add to Resend. Connect it in Squarespace as a secondary domain of the same site →
automatic 301 to stridetail.app.

## Extra
DMARC on stridetail.app: Host `_dmarc`, TXT, `v=DMARC1; p=none;` — cheap deliverability
insurance. Verification covers SENDING only; receiving at @stridetail.app needs a separate
inbox/forwarding product.

## After verification (flips production sender)
1. New Resend API key in the Stridetail account (Sending access).
2. Sponsor runs:
   `supabase secrets set RESEND_API_KEY=<new key> EMAIL_FROM="Paw & Whisker via Stridetail <reports@stridetail.app>" --project-ref vrxoswukuiaerhwammlh`
   (from-name is per-tenant white-label — revisit wording when multi-tenant.)
3. Queue a test row (see checkpoints/session notes) and confirm `sent`.
