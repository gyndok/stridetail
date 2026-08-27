import { formatInTimeZone } from 'date-fns-tz';

import { unpaidTotalCents, type ChipTone } from '@/src/features/billing/money';

/**
 * Pure portal-dashboard helpers (Plan 8 Task 4), tested in __tests__/home.test.ts.
 * Money math delegates to the billing helpers — never duplicated.
 */

export type PortalVisitStatus =
  | 'unassigned'
  | 'offered'
  | 'accepted'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

/**
 * Client-facing status chip. Assignment states are internal — a client only
 * cares that the visit is on the calendar ("Scheduled"), underway
 * ("Happening now"), or done ("Completed", used by the reports list).
 */
export function portalVisitChip(status: PortalVisitStatus): { label: string; tone: ChipTone } {
  if (status === 'in_progress') return { label: 'Happening now', tone: 'green' };
  if (status === 'completed') return { label: 'Completed', tone: 'muted' };
  if (status === 'cancelled') return { label: 'Cancelled', tone: 'muted' };
  return { label: 'Scheduled', tone: 'neutral' };
}

/** "Thu, Aug 27 · 2:00 PM" in the BUSINESS zone carried on the visit row. */
export function visitWhenLabel(iso: string, tz: string): string {
  return formatInTimeZone(new Date(iso), tz, 'EEE, MMM d · h:mm a');
}

/** "Biscuit & Max" — pet_ids joined against the client's readable pets. */
export function petNamesLabel(petIds: string[], pets: { id: string; name: string }[]): string {
  const byId = new Map(pets.map((p) => [p.id, p.name]));
  return petIds
    .map((id) => byId.get(id))
    .filter((n): n is string => Boolean(n))
    .join(' & ');
}

/**
 * Outstanding balance across the client's 'sent' invoices — the same true
 * balance the owner's billing list shows (sum of items − payments; an
 * over-payment is a credit and reduces the total).
 */
export function outstandingBalanceCents(
  invoices: {
    status: 'sent' | 'paid' | 'draft' | 'void';
    items: { amount_cents: number }[];
    payments: { amount_cents: number }[];
  }[],
): number {
  return unpaidTotalCents(invoices);
}
