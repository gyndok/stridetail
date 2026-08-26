/**
 * Pure helpers for the new-invoice flow (Plan 5 Task 4), tested in
 * __tests__/newInvoice.test.ts. Everything here MIRRORS create_invoice
 * (supabase/migrations/20260825000002_billing_rpcs.sql) so the on-screen
 * preview matches what the RPC will assemble: the local-date range rule,
 * the visit line description/amount, and the deposit stop-at-first-misfit
 * loop. Change the RPC and this file together.
 */

import { formatInTimeZone } from 'date-fns-tz';

import { dollarsStringToCents } from '@/src/features/services/form';
import { INVOICE_BASE_URL } from '@/src/lib/brand';

/** Shape returned by listUninvoicedVisits (api.ts) — the services embed
 * carries the NAME only (descriptions). Amounts come from the
 * uninvoiced_visit_amounts definer RPC (Plan 6 Task 4): the true stored
 * price_cents_snapshot, which the table's column grant hides from clients. */
export type UninvoicedVisit = {
  id: string;
  client_id: string;
  pet_ids: string[];
  scheduled_start: string;
  business_tz: string;
  service: { name: string } | null;
};

/**
 * The visit's LOCAL calendar date in its own business_tz — the RPC's
 * `(scheduled_start at time zone business_tz)::date` (same date-fns-tz
 * pattern as groupVisitsByLocalDay / visitsOnLocalDay in schedule/api).
 */
export function visitLocalDate(v: { scheduled_start: string; business_tz: string }): string {
  return formatInTimeZone(new Date(v.scheduled_start), v.business_tz, 'yyyy-MM-dd');
}

/**
 * Date-range filter mirroring create_invoice: inclusive on both ends,
 * null/'' bound = open. Plain string comparison — both sides are
 * 'YYYY-MM-DD'.
 */
export function filterByLocalDateRange<T extends { scheduled_start: string; business_tz: string }>(
  visits: T[],
  from: string | null,
  to: string | null,
): T[] {
  return visits.filter((v) => {
    const day = visitLocalDate(v);
    if (from && day < from) return false;
    if (to && day > to) return false;
    return true;
  });
}

/**
 * Preview line for one eligible visit. Description mirrors the RPC's
 * `s.name || ' — ' || to_char(..., 'Dy, Mon FMDD')`; the amount is the TRUE
 * stored snapshot handed in from uninvoiced_visit_amounts — never recomputed
 * from current service prices, so the preview always matches the draft.
 */
export function eligibleVisitLine(
  v: UninvoicedVisit,
  amountCents: number,
): { description: string; amountCents: number } {
  const day = formatInTimeZone(new Date(v.scheduled_start), v.business_tz, 'EEE, MMM d');
  const name = v.service?.name ?? 'Visit';
  return { description: `${name} — ${day}`, amountCents };
}

/**
 * Which held deposits create_invoice will auto-apply against `subtotalCents`:
 * walk the ledger IN ORDER (listHeldDeposits already returns the queue order)
 * applying WHOLE deposits, and STOP at the first that no longer fits —
 * exactly the RPC's `exit when d.amount_cents > remaining`. Skipping ahead
 * to a newer, smaller deposit would violate oldest-first (Task 2 rule).
 */
export function depositPreview<T extends { amount_cents: number }>(
  held: T[],
  subtotalCents: number,
): { applied: T[]; appliedCents: number } {
  const applied: T[] = [];
  let appliedCents = 0;
  let remaining = subtotalCents;
  for (const d of held) {
    if (d.amount_cents > remaining) break;
    applied.push(d);
    appliedCents += d.amount_cents;
    remaining -= d.amount_cents;
  }
  return { applied, appliedCents };
}

/**
 * Signed dollars for manual lines: an optional leading '-' flips the sign,
 * the rest parses per the services helper (dollarsStringToCents itself
 * rejects negatives — it feeds price fields where they are junk).
 */
export function parseSignedDollars(text: string): number | null {
  const trimmed = text.trim();
  const negative = trimmed.startsWith('-');
  const cents = dollarsStringToCents(negative ? trimmed.slice(1) : trimmed);
  if (cents === null) return null;
  return negative ? -cents : cents;
}

/** Client-side mirror of add_invoice_item's prechecks; null = valid. */
export function manualLineError(description: string, amountText: string): string | null {
  if (!description.trim()) return 'Enter a description';
  const cents = parseSignedDollars(amountText);
  if (cents === null) return 'Enter an amount like 12.50 (or -12.50)';
  if (cents === 0) return 'Amount cannot be zero';
  return null;
}

/** The public invoice link (reportLink pattern; page itself lands in Task 5). */
export function invoiceLink(token: string): string {
  return `${INVOICE_BASE_URL.replace(/\/$/, '')}/${token}`;
}
