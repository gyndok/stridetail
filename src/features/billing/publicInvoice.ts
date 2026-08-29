import { formatInTimeZone } from 'date-fns-tz';

import { env } from '@/src/lib/env';

import { formatCents, formatIsoDate } from './money';

/**
 * Public invoice fetch + pure view model (Plan 5 Task 5). Deliberately a
 * PLAIN fetch, not the supabase client: the /invoice/[token] page is
 * direct-linked from the client's email and must work with no session at all
 * (invoice-public has verify_jwt off — the token is the credential). The anon
 * apikey header is sent for the gateway's benefit only. Mirrors
 * src/features/report/api.ts exactly.
 */

export type InvoicePayload = {
  business: { name: string; brandColor: string; logoUrl: string | null };
  businessTz: string;
  /** First name ONLY — the function never ships the full client name. */
  clientFirstName: string;
  invoice: {
    numberLabel: string;
    issuedOn: string;
    dueOn: string | null;
    status: string;
    paidAt: string | null;
  };
  items: { description: string; amountCents: number; kind: string }[];
  paymentsTotalCents: number;
  balanceCents: number;
  paymentInstructionsMd: string | null;
  /**
   * Venmo pay primitives (Plan 6 Task 3) — present only while the invoice is
   * sent, unpaid, with a positive balance AND the business has a handle on
   * file. The page builds the link via src/lib/venmo.ts (tips adjust the
   * amount client-side); the function never ships a URL.
   */
  venmo: { handle: string; amountCents: number; note: string } | null;
  /**
   * Zelle / Apple Pay send-to destinations (2026-08-29) — display-only (no
   * deep-link convention exists for either), present under the same gate as
   * venmo: sent, unpaid, positive balance, handle on file.
   */
  zelleHandle: string | null;
  applePayHandle: string | null;
};

/** Unknown, revoked, or voided token — the page shows the friendly gone state. */
export class InvoiceUnavailableError extends Error {
  constructor() {
    super('This invoice is no longer available.');
    this.name = 'InvoiceUnavailableError';
  }
}

export function invoiceEndpoint(supabaseUrl: string): string {
  return `${supabaseUrl.replace(/\/$/, '')}/functions/v1/invoice-public`;
}

export async function fetchPublicInvoice(token: string): Promise<InvoicePayload> {
  const res = await fetch(invoiceEndpoint(env.SUPABASE_URL), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: env.SUPABASE_ANON_KEY },
    body: JSON.stringify({ token }),
  });
  if (res.status === 404) throw new InvoiceUnavailableError();
  if (!res.ok) throw new Error(`Could not load the invoice (${res.status}). Please try again.`);
  return (await res.json()) as InvoicePayload;
}

export type InvoiceViewModel = {
  /** 'Invoice INV-0007'. */
  title: string;
  /** 'Prepared for Marisol' — null when the payload has no first name. */
  clientLine: string | null;
  /** 'Issued Aug 25, 2026'. */
  issuedLine: string;
  /** 'Due Sep 1, 2026' — null when the invoice has no due date. */
  dueLine: string | null;
  paid: boolean;
  /** 'Paid Aug 30, 2026' in the business tz — null when unpaid. */
  paidLine: string | null;
  items: { description: string; amountText: string; isCredit: boolean }[];
  totalText: string;
  /** Payments row — null when nothing has been paid yet. */
  paymentsText: string | null;
  balanceText: string;
};

/**
 * Pure payload -> render-ready strings (tested in __tests__). Money via the
 * shared formatCents; dates are calendar-only strings (formatIsoDate) except
 * paidAt, an instant rendered in the BUSINESS tz (report-page rule: the
 * reader may be anywhere, but the business is where the invoice lives).
 * Negative item amounts (deposit credits, discounts) are flagged isCredit so
 * the table can render them as credits.
 */
export function invoiceViewModel(p: InvoicePayload): InvoiceViewModel {
  const totalCents = p.items.reduce((sum, it) => sum + it.amountCents, 0);
  const paid = p.invoice.status === 'paid';
  return {
    title: `Invoice ${p.invoice.numberLabel}`,
    clientLine: p.clientFirstName ? `Prepared for ${p.clientFirstName}` : null,
    issuedLine: `Issued ${formatIsoDate(p.invoice.issuedOn)}`,
    dueLine: p.invoice.dueOn ? `Due ${formatIsoDate(p.invoice.dueOn)}` : null,
    paid,
    paidLine:
      paid && p.invoice.paidAt
        ? `Paid ${formatInTimeZone(new Date(p.invoice.paidAt), p.businessTz, 'MMM d, yyyy')}`
        : null,
    items: p.items.map((it) => ({
      description: it.description,
      amountText: formatCents(it.amountCents),
      isCredit: it.amountCents < 0,
    })),
    totalText: formatCents(totalCents),
    paymentsText: p.paymentsTotalCents > 0 ? formatCents(-p.paymentsTotalCents) : null,
    balanceText: formatCents(p.balanceCents),
  };
}
