import { useQuery } from '@tanstack/react-query';

import { listInvoices, type InvoiceListItem } from '@/src/features/billing/api';
import {
  formatCents,
  invoiceNumberLabel,
  invoiceTotal,
  paymentsTotal,
  statusChip,
  type ChipTone,
} from '@/src/features/billing/money';
import { isMeetGreetPending, portalInviteState } from '@/src/features/clients/api';
import type { Client } from '@/src/features/clients/types';
import { listServices } from '@/src/features/services/api';
import { supabase } from '@/src/lib/supabase';

// Plan 8b Task 4 — data + pure view math for the BusinessPanel (clients &
// pets roster, services catalog, billing hub). House rules as in kpis.ts:
// named columns, business_id scoping on every query, all shaping in pure
// functions. Services and invoices REUSE the existing feature queries
// (services/api listServices, billing/api listInvoices) — nothing here
// re-derives money math; it all comes from billing/money.ts.

// ---- clients & pets roster ----

/** Pet embed carries names for the compact "Baxter (dog), Olive (dog)" cell. */
export const BUSINESS_CLIENT_COLUMNS =
  'id, name, phones, email, mg_completed_at, portal_invited_at, pets(id, name, species)';

export type BusinessClientRow = Pick<
  Client,
  'id' | 'name' | 'phones' | 'email' | 'mg_completed_at' | 'portal_invited_at'
> & {
  pets: { id: string; name: string; species: string | null }[];
};

/**
 * The whole roster in one read — the business has ~11 clients, so fetch-all
 * plus client-side search (filterClients) is the right size; no server-side
 * ilike round-trips per keystroke.
 */
export async function fetchBusinessClients(businessId: string): Promise<BusinessClientRow[]> {
  const { data, error } = await supabase
    .from('clients')
    .select(BUSINESS_CLIENT_COLUMNS)
    .eq('business_id', businessId)
    .order('name');
  if (error) throw error;
  return (data ?? []) as unknown as BusinessClientRow[];
}

/** Case-insensitive substring match on client OR pet names; blank term = all. */
export function filterClients(rows: BusinessClientRow[], term: string): BusinessClientRow[] {
  const q = term.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter(
    (c) =>
      c.name.toLowerCase().includes(q) || c.pets.some((p) => p.name.toLowerCase().includes(q)),
  );
}

/** 'Baxter (dog), Olive (dog)' — name-sorted; species omitted when unknown. */
export function petsSummary(pets: BusinessClientRow['pets']): string {
  if (pets.length === 0) return 'No pets';
  return [...pets]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((p) => (p.species ? `${p.name} (${p.species})` : p.name))
    .join(', ');
}

export type ClientFlags = { noEmail: boolean; meetGreetPending: boolean };

/**
 * Row flags, both derived through the existing clients/api helpers: no email
 * = portalInviteState 'needs-email' (portal invites require one), meet &
 * greet pending = isMeetGreetPending (mg_completed_at still null).
 */
export function clientFlags(
  client: Pick<Client, 'email' | 'portal_invited_at' | 'mg_completed_at'>,
): ClientFlags {
  return {
    noEmail: portalInviteState(client) === 'needs-email',
    meetGreetPending: isMeetGreetPending(client),
  };
}

/** Cap a panel list at `max` rows; the remainder becomes the "+N more" link. */
export function capRows<T>(rows: T[], max: number): { visible: T[]; moreCount: number } {
  return { visible: rows.slice(0, max), moreCount: Math.max(0, rows.length - max) };
}

export function useBusinessClients(businessId: string | null) {
  return useQuery({
    queryKey: ['dashboard-clients', businessId],
    enabled: !!businessId,
    queryFn: () => fetchBusinessClients(businessId!),
  });
}

// ---- services catalog ----

export function useBusinessServices(businessId: string | null) {
  return useQuery({
    queryKey: ['dashboard-services', businessId],
    enabled: !!businessId,
    queryFn: () => listServices(businessId!),
  });
}

// ---- billing hub ----

export type InvoiceRowView = {
  id: string;
  label: string;
  clientName: string;
  amountLabel: string;
  chip: { label: string; tone: ChipTone };
};

/** One invoice list row: INV-label · client · total · status chip (money.ts). */
export function invoiceRowView(inv: InvoiceListItem, now: Date): InvoiceRowView {
  const itemsCents = invoiceTotal(inv.items);
  return {
    id: inv.id,
    label: invoiceNumberLabel(inv.number),
    clientName: inv.client?.name ?? 'Client',
    amountLabel: formatCents(itemsCents),
    chip: statusChip(inv, { itemsCents, paymentsCents: paymentsTotal(inv.payments) }, now),
  };
}

/** Completed visits with no invoice_items row — pure half of the anti-join. */
export function unbilledVisitCount(
  visits: { id: string }[],
  invoiced: { visit_id: string | null }[],
): number {
  const invoicedIds = new Set(invoiced.map((r) => r.visit_id));
  return visits.filter((v) => !invoicedIds.has(v.id)).length;
}

/**
 * Business-wide unbilled-visits count: the SAME anti-join eligibility as
 * billing/api listUninvoicedVisits (completed visits minus invoice_items with
 * a visit_id), minus its client filter — that query is per-client by design,
 * so this dashboards-only variant reads bare ids across the business and
 * counts client-side.
 */
export async function fetchUnbilledVisitCount(businessId: string): Promise<number> {
  const [visitsRes, invoicedRes] = await Promise.all([
    supabase
      .from('visits')
      .select('id')
      .eq('business_id', businessId)
      .eq('status', 'completed'),
    supabase
      .from('invoice_items')
      .select('visit_id')
      .eq('business_id', businessId)
      .not('visit_id', 'is', null),
  ]);
  if (visitsRes.error) throw visitsRes.error;
  if (invoicedRes.error) throw invoicedRes.error;
  return unbilledVisitCount(
    (visitsRes.data ?? []) as { id: string }[],
    (invoicedRes.data ?? []) as { visit_id: string | null }[],
  );
}

export type BusinessBilling = { invoices: InvoiceListItem[]; unbilledCount: number };

/** Invoice list (existing billing query) + unbilled count in one batch. */
export function useBusinessBilling(businessId: string | null) {
  return useQuery({
    queryKey: ['dashboard-billing', businessId],
    enabled: !!businessId,
    queryFn: async (): Promise<BusinessBilling> => {
      const [invoices, unbilledCount] = await Promise.all([
        listInvoices(businessId!),
        fetchUnbilledVisitCount(businessId!),
      ]);
      return { invoices, unbilledCount };
    },
  });
}
