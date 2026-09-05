import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/src/lib/supabase';

import { formatCents } from './money';

/**
 * Per-client balance glance (sponsor request 2026-08-29; reshaped 2026-09-05,
 * money-review fix B): TWO numbers per client, never netted. A held deposit is
 * money reserved for FUTURE care — subtracting it from an unpaid invoice hid
 * the debt ("$50 deposit − $25 unpaid walk" used to show as "+$25 credit").
 * Now: owedCents = outstanding on sent invoices; heldCents = deposits still
 * held. A client can owe for Friday's walk AND have money held for next week,
 * and the glance says both. Zero/absent = settled, and the glance shows
 * nothing so only clients with money in motion draw the eye.
 *
 * House rules: named columns only, business_id scoping on every query. Two
 * small queries (held deposits, sent invoices with amount embeds) — the same
 * shapes the Billing tab already reads — summed client-side; no RPC because
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

export type ClientBalance = {
  /** Outstanding on sent invoices. Negative = overpaid (a real credit). */
  owedCents: number;
  /** Deposits still held for future care. Never nets against owedCents. */
  heldCents: number;
};

/** client_id -> { owedCents, heldCents } — the two sides, kept apart. */
export function clientBalances(inputs: BalanceInputs): Map<string, ClientBalance> {
  const balances = new Map<string, ClientBalance>();
  const at = (clientId: string): ClientBalance => {
    let b = balances.get(clientId);
    if (!b) {
      b = { owedCents: 0, heldCents: 0 };
      balances.set(clientId, b);
    }
    return b;
  };
  for (const d of inputs.heldDeposits) at(d.client_id).heldCents += d.amount_cents;
  for (const inv of inputs.sentInvoices) {
    at(inv.client_id).owedCents +=
      inv.items.reduce((sum, r) => sum + r.amount_cents, 0) -
      inv.payments.reduce((sum, r) => sum + r.amount_cents, 0);
  }
  return balances;
}

export type BalanceView = { text: string; tone: 'green' | 'danger' };

/**
 * Render-ready glance: null when settled (or unknown) so list rows stay
 * quiet; otherwise up to two parts, shown together — 'Owes $25.00' red for
 * unpaid invoices (or '$5.00 credit' green if they overpaid), plus
 * 'Holding $50.00' green for deposits reserved for future care.
 */
export function balanceView(balance: ClientBalance | undefined): BalanceView[] | null {
  if (!balance) return null;
  const parts: BalanceView[] = [];
  if (balance.owedCents > 0) {
    parts.push({ text: `Owes ${formatCents(balance.owedCents)}`, tone: 'danger' });
  } else if (balance.owedCents < 0) {
    parts.push({ text: `${formatCents(-balance.owedCents)} credit`, tone: 'green' });
  }
  if (balance.heldCents > 0) {
    parts.push({ text: `Holding ${formatCents(balance.heldCents)}`, tone: 'green' });
  }
  return parts.length ? parts : null;
}

/** The shared query — one fetch per business, read by every surface. */
export function useClientBalances(businessId: string | null | undefined) {
  return useQuery({
    queryKey: ['clientBalances', businessId],
    enabled: !!businessId,
    queryFn: async () => clientBalances(await fetchBalanceInputs(businessId!)),
  });
}
