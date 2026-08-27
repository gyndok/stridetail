import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/src/lib/supabase';

import {
  clientsKpi,
  kpiWeekWindows,
  outstandingKpi,
  revenueKpi,
  walksKpi,
  type ClientsKpi,
  type KpiWeekWindows,
  type OutstandingInvoice,
  type OutstandingKpi,
  type PaymentRow,
  type RevenueKpi,
  type WalksKpi,
} from './kpiMath';

// Plan 8b Task 1 — the ONE batched KPI query module for the owner desktop
// dashboard. House rules as everywhere: named columns only (never '*' — and
// visits carries the price column grant, so a bare select would 42501),
// business_id scoping on every query even though RLS is owner-only, all math
// in kpiMath.ts pure functions.

export const KPI_PAYMENT_COLUMNS = 'amount_cents, received_on';
export const KPI_CLIENT_COLUMNS = 'id, pets(count)';
export const KPI_VISIT_COLUMNS = 'id, status';
export const KPI_INVOICE_COLUMNS =
  'id, status, items:invoice_items(amount_cents), payments:payments(amount_cents)';

export type DashboardKpis = {
  windows: KpiWeekWindows;
  revenue: RevenueKpi;
  clients: ClientsKpi;
  walks: WalksKpi;
  outstanding: OutstandingKpi;
};

type ClientCountRow = { pets: { count: number }[] | null };

/**
 * All four KPIs in one Promise.all batch:
 * - payments over BOTH weeks in one read (received_on is a DATE column —
 *   local-ymd string bounds), split per week client-side;
 * - every client with its pets(count) embed (a dog-walking roster is small);
 * - this week's visits by UTC instant bounds from the same week windows;
 * - `sent` invoices with item/payment amounts (outstanding is derived math,
 *   never stored — money.ts).
 */
export async function fetchDashboardKpis(
  businessId: string,
  tz: string,
  nowUtc: Date = new Date(),
): Promise<DashboardKpis> {
  const windows = kpiWeekWindows(nowUtc, tz);
  const [paymentsRes, clientsRes, visitsRes, invoicesRes] = await Promise.all([
    supabase
      .from('payments')
      .select(KPI_PAYMENT_COLUMNS)
      .eq('business_id', businessId)
      .gte('received_on', windows.previous.startYmd)
      .lt('received_on', windows.current.endYmd),
    supabase.from('clients').select(KPI_CLIENT_COLUMNS).eq('business_id', businessId),
    supabase
      .from('visits')
      .select(KPI_VISIT_COLUMNS)
      .eq('business_id', businessId)
      .gte('scheduled_start', windows.current.fromUtc.toISOString())
      .lt('scheduled_start', windows.current.toUtc.toISOString()),
    supabase
      .from('invoices')
      .select(KPI_INVOICE_COLUMNS)
      .eq('business_id', businessId)
      .eq('status', 'sent'),
  ]);
  if (paymentsRes.error) throw paymentsRes.error;
  if (clientsRes.error) throw clientsRes.error;
  if (visitsRes.error) throw visitsRes.error;
  if (invoicesRes.error) throw invoicesRes.error;
  return {
    windows,
    revenue: revenueKpi((paymentsRes.data ?? []) as PaymentRow[], windows),
    clients: clientsKpi((clientsRes.data ?? []) as unknown as ClientCountRow[]),
    walks: walksKpi((visitsRes.data ?? []) as { status: string }[]),
    outstanding: outstandingKpi((invoicesRes.data ?? []) as unknown as OutstandingInvoice[]),
  };
}

/**
 * TanStack hook for the KPI row (and any later panel that wants the same
 * numbers — Tasks 2-4 may reuse this rather than re-query). Disabled until
 * both the active business and its time zone are known; the key carries the
 * business only (tz is a property of the business, not a second dimension).
 */
export function useDashboardKpis(businessId: string | null, tz: string | null) {
  return useQuery({
    queryKey: ['dashboard-kpis', businessId],
    enabled: !!businessId && !!tz,
    queryFn: () => fetchDashboardKpis(businessId!, tz!),
  });
}
