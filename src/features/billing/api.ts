import { supabase } from '@/src/lib/supabase';

import type {
  Deposit,
  Invoice,
  InvoiceItem,
  Payment,
  PaymentMethod,
} from './types';

// Billing queries and RPC wrappers (Plan 5 Task 3). House rules: named columns
// only (never '*'), named embeds, business_id scoping on every query even
// though RLS is owner-only — a stale/foreign id must not cross tenants.
// Amount-bearing mutations go through the Task 2 definer RPCs exclusively;
// this module never writes billing tables directly.

/** List row: header columns + amounts only — totals are client-side math. */
export const INVOICE_LIST_COLUMNS =
  'id, business_id, client_id, number, status, issued_on, due_on, sent_at, paid_at, ' +
  'client:clients(name), items:invoice_items(amount_cents), payments:payments(amount_cents)';

export type InvoiceListItem = Pick<
  Invoice,
  'id' | 'business_id' | 'client_id' | 'number' | 'status' | 'issued_on' | 'due_on' | 'sent_at' | 'paid_at'
> & {
  client: { name: string } | null;
  items: { amount_cents: number }[];
  payments: { amount_cents: number }[];
};

/** Newest invoice first (the per-business number is strictly increasing). */
export async function listInvoices(businessId: string): Promise<InvoiceListItem[]> {
  const { data, error } = await supabase
    .from('invoices')
    .select(INVOICE_LIST_COLUMNS)
    .eq('business_id', businessId)
    .order('number', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as InvoiceListItem[];
}

// The client embed carries phones so the detail screen's "Text the client"
// can compose a device SMS (report-card parity) — Task 4 addition.
export const INVOICE_DETAIL_COLUMNS =
  'id, business_id, client_id, number, status, issued_on, due_on, public_token, ' +
  'sent_at, paid_at, revoked_at, notes_md, created_at, updated_at, ' +
  'client:clients(name, phones), ' +
  'items:invoice_items(id, visit_id, description, amount_cents, kind, created_at), ' +
  'payments:payments(id, method, amount_cents, tip_cents, received_on, memo, created_at)';

export type InvoiceDetail = Invoice & {
  client: { name: string; phones: string[] | null } | null;
  items: Pick<InvoiceItem, 'id' | 'visit_id' | 'description' | 'amount_cents' | 'kind' | 'created_at'>[];
  payments: Pick<Payment, 'id' | 'method' | 'amount_cents' | 'tip_cents' | 'received_on' | 'memo' | 'created_at'>[];
};

export async function getInvoice(businessId: string, id: string): Promise<InvoiceDetail> {
  const { data, error } = await supabase
    .from('invoices')
    .select(INVOICE_DETAIL_COLUMNS)
    .eq('business_id', businessId)
    .eq('id', id)
    .single();
  if (error) throw error;
  return data as unknown as InvoiceDetail;
}

export type HeldDeposit = Pick<
  Deposit,
  'id' | 'client_id' | 'amount_cents' | 'status' | 'method' | 'received_on' | 'memo' | 'created_at'
> & { client: { name: string } | null };

/**
 * The held ledger, oldest received first (nulls last) then created — the same
 * order create_invoice consumes them in, so the list reads as the queue.
 */
export async function listHeldDeposits(businessId: string): Promise<HeldDeposit[]> {
  const { data, error } = await supabase
    .from('deposits')
    .select(
      'id, client_id, amount_cents, status, method, received_on, memo, created_at, client:clients(name)',
    )
    .eq('business_id', businessId)
    .eq('status', 'held')
    .order('received_on', { ascending: true, nullsFirst: false })
    .order('created_at', {});
  if (error) throw error;
  return (data ?? []) as unknown as HeldDeposit[];
}

/**
 * Full deposit ledger (every status) in the SAME queue order as the held
 * view, so toggling held/all never reshuffles rows within a client group.
 */
export async function listAllDeposits(businessId: string): Promise<HeldDeposit[]> {
  const { data, error } = await supabase
    .from('deposits')
    .select(
      'id, client_id, amount_cents, status, method, received_on, memo, created_at, client:clients(name)',
    )
    .eq('business_id', businessId)
    .order('received_on', { ascending: true, nullsFirst: false })
    .order('created_at', {});
  if (error) throw error;
  return (data ?? []) as unknown as HeldDeposit[];
}

export type DepositGroup = {
  clientId: string;
  clientName: string;
  totalCents: number;
  deposits: HeldDeposit[];
};

/** Group a held ledger per client (name-sorted), preserving the queue order. */
export function groupHeldDeposits(deposits: HeldDeposit[]): DepositGroup[] {
  const byClient = new Map<string, DepositGroup>();
  for (const d of deposits) {
    const group = byClient.get(d.client_id) ?? {
      clientId: d.client_id,
      clientName: d.client?.name ?? 'Client',
      totalCents: 0,
      deposits: [],
    };
    group.totalCents += d.amount_cents;
    group.deposits.push(d);
    byClient.set(d.client_id, group);
  }
  return [...byClient.values()].sort((a, b) => a.clientName.localeCompare(b.clientName));
}

// ---- New-invoice flow reads (Task 4) ----

/**
 * Named columns for the new-invoice preview. The services embed carries the
 * NAME only (line descriptions): visits.price_cents_snapshot has NO client
 * select grant, and since Plan 6 Task 4 the TRUE amounts come from the
 * uninvoiced_visit_amounts definer RPC instead of a current-price recompute.
 */
export const UNINVOICED_VISIT_COLUMNS =
  'id, business_id, client_id, pet_ids, scheduled_start, business_tz, status, ' +
  'service:services(name)';

export type UninvoicedVisitRow = {
  id: string;
  business_id: string;
  client_id: string;
  pet_ids: string[];
  scheduled_start: string;
  business_tz: string;
  status: string;
  service: { name: string } | null;
};

/**
 * Completed visits for the client with no invoice_items row — the same
 * eligibility as create_invoice's NOT EXISTS. PostgREST cannot express the
 * anti-join in one query, so this fetches the business's invoiced visit ids
 * (invoice_items where visit_id is set) and filters client-side; both reads
 * are owner-RLS'd and business-scoped.
 */
export async function listUninvoicedVisits(
  businessId: string,
  clientId: string,
): Promise<UninvoicedVisitRow[]> {
  const [visitsRes, invoicedRes] = await Promise.all([
    supabase
      .from('visits')
      .select(UNINVOICED_VISIT_COLUMNS)
      .eq('business_id', businessId)
      .eq('client_id', clientId)
      .eq('status', 'completed')
      .order('scheduled_start', { ascending: true }),
    supabase
      .from('invoice_items')
      .select('visit_id')
      .eq('business_id', businessId)
      .not('visit_id', 'is', null),
  ]);
  if (visitsRes.error) throw visitsRes.error;
  if (invoicedRes.error) throw invoicedRes.error;
  const invoiced = new Set(
    ((invoicedRes.data ?? []) as { visit_id: string | null }[]).map((r) => r.visit_id),
  );
  return ((visitsRes.data ?? []) as unknown as UninvoicedVisitRow[]).filter(
    (v) => !invoiced.has(v.id),
  );
}

/** Cheap invoiced check for the visit screen's "Add to an invoice →" row. */
export async function isVisitInvoiced(businessId: string, visitId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('invoice_items')
    .select('id')
    .eq('business_id', businessId)
    .eq('visit_id', visitId)
    .limit(1);
  if (error) throw error;
  return ((data ?? []) as unknown[]).length > 0;
}

// ---- RPC wrappers (Task 2 definer functions; every one audited server-side) ----

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw error;
  return data as T;
}

/**
 * Draft invoice for a client: completed un-invoiced visits in the LOCAL-date
 * range (all when the range is null) plus auto-applied held deposits. Returns
 * the new invoice id.
 */
export async function createInvoice(
  clientId: string,
  from?: string | null,
  to?: string | null,
): Promise<string> {
  return rpc<string>('create_invoice', {
    p_client: clientId,
    p_from: from ?? null,
    p_to: to ?? null,
  });
}

/**
 * Backdate (or re-date) a DRAFT invoice (Alexandria, 2026-09-05: "forgot to
 * start it 9/4 and it won't let me backdate it"). Plain owner-RLS update —
 * drafts are pre-send working documents; the status machine is untouched.
 */
export async function setInvoiceIssuedOn(invoiceId: string, issuedOn: string): Promise<void> {
  const { error } = await supabase
    .from('invoices')
    .update({ issued_on: issuedOn })
    .eq('id', invoiceId);
  if (error) throw error;
}

/** Manual line (signed cents — negatives are discounts/tips given). */
export async function addInvoiceItem(
  invoiceId: string,
  description: string,
  amountCents: number,
): Promise<string> {
  return rpc<string>('add_invoice_item', {
    p_invoice: invoiceId,
    p_description: description,
    p_amount_cents: amountCents,
  });
}

/** Manual lines only — visit/deposit lines leave via voidInvoice (Task 2 rule). */
export async function removeInvoiceItem(itemId: string): Promise<void> {
  await rpc('remove_invoice_item', { p_item: itemId });
}

/** draft -> sent: mints the public token and queues the invoice_ready email. */
export async function sendInvoice(invoiceId: string): Promise<void> {
  await rpc('send_invoice', { p_invoice: invoiceId });
}

/**
 * Re-queue the invoice_ready email for a SENT or PAID invoice with the
 * existing token (never rotated — send_invoice stays drafts-only). The RPC
 * raises when the invoice is draft/void, the link is revoked, or the client
 * has no email on file (an explicit resend must not silently no-op).
 */
export async function resendInvoiceEmail(invoiceId: string): Promise<void> {
  await rpc('resend_invoice_email', { p_invoice: invoiceId });
}

export type UninvoicedAmount = { visit_id: string; amount_cents: number };

/**
 * True price snapshots for the client's completed un-invoiced visits (the
 * same eligibility as create_invoice), via the owner-guarded definer RPC —
 * the price column grant hides the snapshot from every client role.
 */
export async function uninvoicedVisitAmounts(clientId: string): Promise<UninvoicedAmount[]> {
  const data = await rpc<UninvoicedAmount[] | null>('uninvoiced_visit_amounts', {
    p_client: clientId,
  });
  return data ?? [];
}

export async function recordPayment(
  invoiceId: string,
  method: PaymentMethod,
  amountCents: number,
  receivedOn: string,
  memo?: string | null,
  tipCents = 0,
): Promise<string> {
  return rpc<string>('record_payment', {
    p_invoice: invoiceId,
    p_method: method,
    p_amount_cents: amountCents,
    p_received_on: receivedOn,
    p_memo: memo ?? null,
    p_tip_cents: tipCents,
  });
}

/**
 * Remove a mis-recorded payment (round 7d). Reverts paid -> sent when the
 * invoice drops below its total; refuses when the payment's tip is already
 * on a payout statement. Correction model: remove, then re-record right.
 */
export async function removePayment(paymentId: string): Promise<void> {
  await rpc('remove_payment', { p_payment: paymentId });
}

/** Releases visit lines for re-invoicing, returns deposits to held, revokes the link. */
export async function voidInvoice(invoiceId: string): Promise<void> {
  await rpc('void_invoice', { p_invoice: invoiceId });
}

/** Records an already-received deposit straight into `held` (Task 2 rule). */
export async function recordDeposit(
  clientId: string,
  amountCents: number,
  opts?: { method?: PaymentMethod | null; receivedOn?: string | null; memo?: string | null },
): Promise<string> {
  return rpc<string>('record_deposit', {
    p_client: clientId,
    p_amount_cents: amountCents,
    p_method: opts?.method ?? null,
    p_received_on: opts?.receivedOn ?? null,
    p_memo: opts?.memo ?? null,
  });
}

export async function forfeitDeposit(depositId: string): Promise<void> {
  await rpc('forfeit_deposit', { p_deposit: depositId });
}

export async function refundDeposit(depositId: string): Promise<void> {
  await rpc('refund_deposit', { p_deposit: depositId });
}

// ---- Transactions page (2026-09-05): statement fetches ----

/** One walker's money lines — wages, tips, adjustments, payouts (owner-gated
 * definer RPC: per-visit wages need the price column the client can't read). */
export async function walkerLedger(
  businessId: string,
  walkerId: string,
): Promise<import('./statements').WalkerLedgerRow[]> {
  const { data, error } = await supabase.rpc('walker_ledger', {
    p_business: businessId,
    p_walker: walkerId,
  });
  if (error) throw error;
  return (data ?? []) as import('./statements').WalkerLedgerRow[];
}

export type LedgerWalker = { walker_id: string; display_name: string; active: boolean };

/**
 * The owner pickers' walker roster: active members PLUS anyone with financial
 * history — statements, or snapshot-stamped completed visits (finding 1,
 * 2026-09-06 review: removing a walker must never hide what they earned).
 */
export async function ledgerWalkers(businessId: string): Promise<LedgerWalker[]> {
  const { data, error } = await supabase.rpc('ledger_walkers', { p_business: businessId });
  if (error) throw error;
  return (data ?? []) as LedgerWalker[];
}

/** Everything the client statement needs, named columns only. */
export async function fetchClientStatementData(
  businessId: string,
  clientId: string,
): Promise<{
  invoices: import('./statements').StatementInvoice[];
  payments: import('./statements').StatementPayment[];
  deposits: import('./statements').StatementDeposit[];
}> {
  const [invRes, depRes] = await Promise.all([
    supabase
      .from('invoices')
      .select('id, number, status, issued_on, items:invoice_items(amount_cents, kind)')
      .eq('business_id', businessId)
      .eq('client_id', clientId),
    supabase
      .from('deposits')
      .select('amount_cents, status, received_on, created_at, updated_at, memo')
      .eq('business_id', businessId)
      .eq('client_id', clientId),
  ]);
  if (invRes.error) throw invRes.error;
  if (depRes.error) throw depRes.error;
  const invoices = (invRes.data ?? []) as unknown as import('./statements').StatementInvoice[];
  const ids = invoices.map((i) => i.id);
  let payments: import('./statements').StatementPayment[] = [];
  if (ids.length > 0) {
    const payRes = await supabase
      .from('payments')
      .select('invoice_id, amount_cents, tip_cents, method, received_on')
      .eq('business_id', businessId)
      .in('invoice_id', ids);
    if (payRes.error) throw payRes.error;
    payments = (payRes.data ?? []) as import('./statements').StatementPayment[];
  }
  return { invoices, payments, deposits: (depRes.data ?? []) as import('./statements').StatementDeposit[] };
}
