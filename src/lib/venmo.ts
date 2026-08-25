/**
 * Venmo pay-link builder (Plan 6 Task 3). Pure TS — shared by the public
 * invoice page; the invoice-public function ships only the primitives
 * (handle, amountCents, note) and never builds a link itself.
 *
 * Link form, verified against current convention (2026-08-25; Venmo has no
 * official deep-link docs — the profile-link parameters are the long-standing
 * community-documented behaviour):
 *
 *   https://venmo.com/<handle>?txn=pay&amount=<dollars>&note=<url-encoded>
 *
 * The HTTPS profile link is the PRIMARY (and only) form used here: on mobile
 * (app installed) the Venmo app intercepts venmo.com universal links and
 * opens a prefilled payment; without the app, mobile and desktop browsers
 * land on the recipient's profile page — a graceful fallback. The native
 * `venmo://paycharge?txn=pay&recipients=...` scheme is deliberately NOT used:
 * it hard-errors in any browser without the app installed, and the https
 * form reaches the app in every case the scheme would have.
 */

/** Cents -> the Venmo `amount` query value: plain dollars, two decimals, no $. */
export function centsToAmountParam(cents: number): string {
  return (cents / 100).toFixed(2);
}

/** Base amount plus an optional tip; negative or missing tips add nothing. */
export function withTip(amountCents: number, tipCents?: number): number {
  const tip = typeof tipCents === 'number' && Number.isFinite(tipCents) ? Math.floor(tipCents) : 0;
  return amountCents + Math.max(0, tip);
}

export type VenmoLinkInput = {
  /** Bare Venmo username — a leading '@' is tolerated and stripped. */
  handle: string;
  amountCents: number;
  /** Payment note, e.g. the invoice number label 'INV-0042'. */
  note: string;
  tipCents?: number;
};

/** Prefilled pay link: https://venmo.com/<handle>?txn=pay&amount=..&note=.. */
export function venmoLink({ handle, amountCents, note, tipCents }: VenmoLinkInput): string {
  const bare = handle.trim().replace(/^@+/, '');
  const amount = centsToAmountParam(withTip(amountCents, tipCents));
  return `https://venmo.com/${encodeURIComponent(bare)}?txn=pay&amount=${amount}&note=${encodeURIComponent(note)}`;
}
