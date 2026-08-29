import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/src/lib/supabase';

import { formatCents } from './money';

/**
 * Per-client balance glance (sponsor request 2026-08-29): one signed number
 * per client — held deposits minus what is outstanding on sent invoices.
 * Positive = the client's money we hold (credit, green); negative = they owe
 * (red); zero/absent = settled, and the glance shows nothing so only clients
 * with money in motion draw the eye.
 *
 * House rules: named columns only, business_id scoping on every query. Two
 * small queries (held deposits, sent invoices with amount embeds) — the same
 * shapes the Billing tab already reads — netted client-side; no RPC because
 * nothing here moves money.
 */

export const BALANCE_DEPOSIT_COLUMNS = 'client_id, amount_cents';
export const BALANCE_INVOICE_COLUMNS =
  'client_id, items:invoice_items(amount_cents), payments:payments(amount_cents)';

export type BalanceInputs = {
  heldDeposits: { client_id: string; amount_cents: number }[];
  sentInvoices: {
    client_id: string;
    items: { amount_cents: number }[];
    payments: { amount_cents: number }[];
  }[];
};

export async function fetchBalanceInputs(businessId: string): Promise<BalanceInputs> {
  const [depositsRes, invoicesRes] = await Promise.all([
    supabase
      .from('deposits')
      .select(BALANCE_DEPOSIT_COLUMNS)
      .eq('business_id', businessId)
      .eq('status', 'held'),
    supabase
      .from('invoices')
      .select(BALANCE_INVOICE_COLUMNS)
      .eq('business_id', businessId)
      .eq('status', 'sent'),
  ]);
  if (depositsRes.error) throw depositsRes.error;
  if (invoicesRes.error) throw invoicesRes.error;
  return {
    heldDeposits: (depositsRes.data ?? []) as BalanceInputs['heldDeposits'],
    sentInvoices: (invoicesRes.data ?? []) as unknown as BalanceInputs['sentInvoices'],
  };
}

/** client_id -> signed cents (held deposits − outstanding on sent invoices). */
export function clientBalances(inputs: BalanceInputs): Map<string, number> {
  const balances = new Map<string, number>();
  const add = (clientId: string, cents: number) =>
    balances.set(clientId, (balances.get(clientId) ?? 0) + cents);
  for (const d of inputs.heldDeposits) add(d.client_id, d.amount_cents);
  for (const inv of inputs.sentInvoices) {
    const owed =
      inv.items.reduce((sum, r) => sum + r.amount_cents, 0) -
      inv.payments.reduce((sum, r) => sum + r.amount_cents, 0);
    add(inv.client_id, -owed);
  }
  return balances;
}

export type BalanceView = { text: string; tone: 'green' | 'danger' };

/**
 * Render-ready glance: null when settled (or unknown) so list rows stay
 * quiet; '$50.00 credit' green when we hold their money; 'Owes $30.00' red
 * when they owe.
 */
export function balanceView(cents: number | undefined): BalanceView | null {
  if (!cents) return null;
  return cents > 0
    ? { text: `${formatCents(cents)} credit`, tone: 'green' }
    : { text: `Owes ${formatCents(-cents)}`, tone: 'danger' };
}

/** The shared query — one fetch per business, read by every surface. */
export function useClientBalances(businessId: string | null | undefined) {
  return useQuery({
    queryKey: ['clientBalances', businessId],
    enabled: !!businessId,
    queryFn: async () => clientBalances(await fetchBalanceInputs(businessId!)),
  });
}
