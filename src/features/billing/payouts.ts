import { supabase } from '@/src/lib/supabase';

import { formatIsoDate, type ChipTone } from './money';

import { dollarsStringToCents } from '@/src/features/services/form';

// Payout statements (Plan 6 Task 2). Same house rules as api.ts: named columns
// only, named embeds, business_id scoping on every owner query. Walker names
// are NOT embedded — payout_statements.walker_id references auth.users with no
// profiles FK (visits precedent), so screens join client-side via memberName().
// Amount-bearing mutations go through the Task 1 definer RPCs exclusively.

export type PayoutStatus = 'draft' | 'finalized' | 'paid';

export type PayoutStatement = {
  id: string;
  business_id: string;
  walker_id: string;
  period_start: string;
  period_end: string;
  status: PayoutStatus;
  /** Maintained by the RPCs on every item change and recomputed at finalize. */
  total_cents: number;
  finalized_at: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PayoutItem = {
  id: string;
  business_id: string;
  statement_id: string;
  /** null = manual adjustment; set = one visit's payout share (unique). */
  visit_id: string | null;
  description: string;
  /** Signed: manual corrections may be negative. */
  amount_cents: number;
  created_at: string;
  updated_at: string;
};

export const PAYOUT_LIST_COLUMNS =
  'id, business_id, walker_id, period_start, period_end, status, total_cents, ' +
  'finalized_at, paid_at, created_at';

export type PayoutListItem = Pick<
  PayoutStatement,
  | 'id'
  | 'business_id'
  | 'walker_id'
  | 'period_start'
  | 'period_end'
  | 'status'
  | 'total_cents'
  | 'finalized_at'
  | 'paid_at'
  | 'created_at'
>;

/** Newest statement first. */
export async function listPayoutStatements(businessId: string): Promise<PayoutListItem[]> {
  const { data, error } = await supabase
    .from('payout_statements')
    .select(PAYOUT_LIST_COLUMNS)
    .eq('business_id', businessId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as PayoutListItem[];
}

export const PAYOUT_DETAIL_COLUMNS =
  PAYOUT_LIST_COLUMNS +
  ', updated_at, items:payout_items(id, visit_id, description, amount_cents, created_at)';

export type PayoutDetail = PayoutStatement & {
  items: Pick<PayoutItem, 'id' | 'visit_id' | 'description' | 'amount_cents' | 'created_at'>[];
};

export async function getPayoutStatement(businessId: string, id: string): Promise<PayoutDetail> {
  const { data, error } = await supabase
    .from('payout_statements')
    .select(PAYOUT_DETAIL_COLUMNS)
    .eq('business_id', businessId)
    .eq('id', id)
    .single();
  if (error) throw error;
  return data as unknown as PayoutDetail;
}

/**
 * Walker read side ("Earnings"): the caller's own statements. RLS already
 * hides drafts and other walkers' rows; the walker_id and status filters are
 * restated here so the query says what it means (and an owner reading their
 * own earnings never sees team drafts through the owner policy).
 */
export async function listMyPayoutStatements(businessId: string): Promise<PayoutDetail[]> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return [];
  const { data, error } = await supabase
    .from('payout_statements')
    .select(PAYOUT_DETAIL_COLUMNS)
    .eq('business_id', businessId)
    .eq('walker_id', session.user.id)
    .neq('status', 'draft')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as PayoutDetail[];
}

// ---- RPC wrappers (Task 1 definer functions; every one audited server-side) ----

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw error;
  return data as T;
}

/**
 * Draft statement for one walker over a local-date period: one item per
 * completed, not-yet-paid-out visit at round(price × payout_percent / 100).
 * The RPC derives the business from the walker's membership. Returns the id.
 */
export async function createPayoutStatement(
  walkerId: string,
  from: string,
  to: string,
): Promise<string> {
  return rpc<string>('create_payout_statement', { p_walker: walkerId, p_from: from, p_to: to });
}

/** Manual signed adjustment (bonus positive, correction negative); draft only. */
export async function addPayoutItem(
  statementId: string,
  description: string,
  amountCents: number,
): Promise<string> {
  return rpc<string>('add_payout_item', {
    p_statement: statementId,
    p_description: description,
    p_amount_cents: amountCents,
  });
}

/** draft -> finalized: freezes the total and makes it walker-visible. */
export async function finalizePayout(statementId: string): Promise<void> {
  await rpc('finalize_payout', { p_statement: statementId });
}

/** finalized -> paid (recorded manually; the money moves in her own app). */
export async function markPayoutPaid(statementId: string): Promise<void> {
  await rpc('mark_payout_paid', { p_statement: statementId });
}

/** Draft only. Deletes items AND the row, releasing the visits (Task 1 rule). */
export async function voidPayoutStatement(statementId: string): Promise<void> {
  await rpc('void_payout_statement', { p_statement: statementId });
}

// ---- Pure helpers (tested in __tests__/payouts.test.ts) ----

/**
 * Payout chip: draft = owner-only work in progress (muted), finalized = the
 * walker sees it and is waiting on money (warning), paid = done (green).
 */
export function payoutStatusChip(status: PayoutStatus): { label: string; tone: ChipTone } {
  const map: Record<PayoutStatus, { label: string; tone: ChipTone }> = {
    draft: { label: 'Draft', tone: 'muted' },
    finalized: { label: 'Awaiting payment', tone: 'warning' },
    paid: { label: 'Paid', tone: 'green' },
  };
  return map[status];
}

/**
 * 'YYYY-MM-DD' × 2 -> 'Aug 1 – Aug 15, 2026' (year stated once when shared,
 * on both ends when the period crosses New Year). Calendar-only string math
 * (date columns carry no zone); malformed input passes through.
 */
export function periodLabel(from: string, to: string): string {
  const mFrom = /^(\d{4})-\d{2}-\d{2}$/.exec(from);
  const mTo = /^(\d{4})-\d{2}-\d{2}$/.exec(to);
  if (!mFrom || !mTo) return `${from} – ${to}`;
  const start = formatIsoDate(from);
  // Same year: drop ', YYYY' (always the trailing 6 chars) from the start date.
  const startLabel = mFrom[1] === mTo[1] ? start.slice(0, -6) : start;
  return `${startLabel} – ${formatIsoDate(to)}`;
}

/**
 * Signed dollars for payout adjustments: an optional leading '-' wraps the
 * strict positive parser (dollarsStringToCents rejects negatives itself).
 * '5' -> 500, '-5.25' -> -525, junk -> null. Zero parses; the RPC rejects it.
 */
export function signedDollarsToCents(text: string): number | null {
  const trimmed = text.trim();
  const negative = trimmed.startsWith('-');
  const cents = dollarsStringToCents(negative ? trimmed.slice(1) : trimmed);
  if (cents === null) return null;
  return negative ? -cents : cents;
}

/** "Owed now" (round 7c): what the next statement per member would sweep. */
export type WalkerOwed = {
  walker_id: string;
  display_name: string;
  payout_percent: number;
  wages_cents: number;
  tips_cents: number;
};

export async function walkerOwedNow(businessId: string): Promise<WalkerOwed[]> {
  const { data, error } = await supabase.rpc('walker_owed_now', { p_business: businessId });
  if (error) throw error;
  return (data ?? []) as WalkerOwed[];
}
