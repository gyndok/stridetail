import { useQuery } from '@tanstack/react-query';

import {
  formatCents,
  formatIsoDate,
  invoiceBalance,
  invoiceNumberLabel,
  invoiceTotal,
  paymentsTotal,
  statusChip,
  type ChipTone,
} from '@/src/features/billing/money';
import { supabase } from '@/src/lib/supabase';

/**
 * Portal invoices list (Plan 8 Task 5). Own file so Task 5 never collides with
 * the Task 4 dashboard queries in api.ts/hooks.ts. Named columns ONLY (house
 * rule; portalInvoicesApi.test.ts pins the shape). Money math delegates to the
 * shared billing helpers — never duplicated.
 *
 * Detail rendering: invoices.public_token is client-readable (whole-table
 * select grant + the Task 1 sent|paid row policy), so a row deep-links to the
 * existing public invoice page at /invoice/<token> — line items, payments,
 * tip chips, and the Venmo button, all already built and function-gated. The
 * token is fetched through the client's OWN RLS read; the public page is just
 * the renderer (recorded in DEVIATIONS.md).
 */

export const PORTAL_INVOICE_LIST_COLUMNS =
  'id, client_id, number, status, issued_on, due_on, public_token, revoked_at, ' +
  'items:invoice_items(amount_cents), payments:payments(amount_cents)';

export type PortalInvoiceListRow = {
  id: string;
  client_id: string;
  number: number;
  status: 'sent' | 'paid' | 'draft' | 'void';
  issued_on: string | null;
  due_on: string | null;
  /** Stamped on send; null on legacy rows that never went out. */
  public_token: string | null;
  /** Owner revoked the link — the row stays, the deep link does not. */
  revoked_at: string | null;
  items: { amount_cents: number }[];
  payments: { amount_cents: number }[];
};

/**
 * Every invoice the client can see (RLS already limits rows to sent|paid; the
 * explicit filter keeps the intent in the query), newest issue first.
 */
export async function listPortalInvoices(clientId: string): Promise<PortalInvoiceListRow[]> {
  const { data, error } = await supabase
    .from('invoices')
    .select(PORTAL_INVOICE_LIST_COLUMNS)
    .eq('client_id', clientId)
    .in('status', ['sent', 'paid'])
    .order('issued_on', { ascending: false })
    .order('number', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as PortalInvoiceListRow[];
}

export function usePortalInvoiceList(clientId: string | null) {
  return useQuery({
    queryKey: ['portal-invoice-list', clientId],
    queryFn: () => listPortalInvoices(clientId as string),
    enabled: Boolean(clientId),
  });
}

/**
 * Where an invoice row navigates: the public invoice page for its own token —
 * null when there is no token or the owner revoked it (the row still renders,
 * just without a detail link).
 */
export function invoiceHref(
  inv: Pick<PortalInvoiceListRow, 'public_token' | 'revoked_at'>,
): string | null {
  return inv.public_token && !inv.revoked_at ? `/invoice/${inv.public_token}` : null;
}

export type PortalInvoiceVm = {
  id: string;
  /** 'INV-0007'. */
  numberLabel: string;
  /** 'Issued Aug 24, 2026' — empty string when issued_on is missing. */
  dateLine: string;
  totalText: string;
  balanceText: string;
  /** True while money is still owed — the list shows the balance line. */
  unpaid: boolean;
  chip: { label: string; tone: ChipTone };
  href: string | null;
};

/**
 * Pure row -> render-ready strings. Chip reuses the shared statusChip
 * precedence (paid > overdue > partially paid > status) with one client-facing
 * rename: a plain 'Sent' reads 'Awaiting payment' — the client is the payer.
 */
export function portalInvoiceVm(inv: PortalInvoiceListRow, now: Date): PortalInvoiceVm {
  const itemsCents = invoiceTotal(inv.items);
  const paymentsCents = paymentsTotal(inv.payments);
  const balanceCents = invoiceBalance(inv.items, inv.payments);
  const base = statusChip(inv, { itemsCents, paymentsCents }, now);
  return {
    id: inv.id,
    numberLabel: invoiceNumberLabel(inv.number),
    dateLine: inv.issued_on ? `Issued ${formatIsoDate(inv.issued_on)}` : '',
    totalText: formatCents(itemsCents),
    balanceText: formatCents(balanceCents),
    unpaid: inv.status === 'sent' && balanceCents !== 0,
    chip: base.label === 'Sent' ? { label: 'Awaiting payment', tone: base.tone } : base,
    href: invoiceHref(inv),
  };
}
