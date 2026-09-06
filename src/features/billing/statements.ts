import { formatInTimeZone } from 'date-fns-tz';

import { formatCents, invoiceNumberLabel, methodLabel } from './money';

import type { PaymentMethod } from './types';

/**
 * Account-statement builders (Transactions page, 2026-09-05 — sponsor:
 * FreshBooks-style granular line items per client, plus a walkers toggle).
 * Pure functions: the page fetches rows, these turn them into a dated ledger
 * with a RUNNING BALANCE and a summary that never nets what must stay apart —
 * held deposits and tips live OUTSIDE the balance (the clientBalances rule).
 * Client side: charge = invoiced, credit = payments + applied deposits.
 * Walker side: charge = earned (wages/tips/adjustments), credit = payouts —
 * so "balance" reads as what the business still owes, both directions.
 *
 * Dates (finding 4, 2026-09-06 review): every timestamptz instant buckets to
 * a calendar day in the BUSINESS time zone — never `.slice(0, 10)` (UTC) and
 * never the viewing device's zone, so an evening walk stays on its own day
 * and the statement reads the same from any device. Values that are already
 * dates (issued_on, received_on) pass through untouched.
 */

export type StatementRange = { from?: string; to?: string }; // 'YYYY-MM-DD', inclusive

/** Calendar day of a timestamptz instant in the business time zone. */
export const ymdInZone = (at: string | Date, timeZone: string): string =>
  formatInTimeZone(new Date(at), timeZone, 'yyyy-MM-dd');

export type StatementRow = {
  date: string; // 'YYYY-MM-DD'
  kind:
    | 'invoice'
    | 'deposit_credit'
    | 'payment'
    | 'deposit_info'
    | 'wage'
    | 'tip'
    | 'adjustment'
    | 'payout';
  description: string;
  /** Sub-line, e.g. the tip annotation that never touches the balance. */
  note?: string;
  invoiceId?: string;
  chargeCents: number;
  creditCents: number;
  /** Running balance AFTER this row; info rows repeat the previous value. */
  balanceCents: number;
  /** True = narrative only (held deposit received/refunded), no money moved. */
  info: boolean;
};

export type StatementSummary = {
  forwardCents: number;
  chargedCents: number;
  creditedCents: number;
  balanceCents: number;
  /** Info only — tips seen in range. Never part of the balance. */
  tipsCents: number;
  /** Client statements only: deposits held right now (point-in-time). */
  heldCents?: number;
};

export type Statement = { summary: StatementSummary; rows: StatementRow[] };

type Event = Omit<StatementRow, 'balanceCents'> & { prio: number };

/** Fold events into forward balance + in-range rows with running balance. */
function assemble(events: Event[], range: StatementRange, tipsInRange: number): Statement {
  const sorted = [...events].sort(
    (a, b) => a.date.localeCompare(b.date) || a.prio - b.prio || a.description.localeCompare(b.description),
  );
  let forward = 0;
  let charged = 0;
  let credited = 0;
  let balance = 0;
  const rows: StatementRow[] = [];
  for (const e of sorted) {
    const before = range.from ? e.date < range.from : false;
    const after = range.to ? e.date > range.to : false;
    if (before) {
      forward += e.chargeCents - e.creditCents;
      continue;
    }
    if (after) continue;
    if (rows.length === 0) balance = forward;
    balance += e.chargeCents - e.creditCents;
    charged += e.chargeCents;
    credited += e.creditCents;
    rows.push({ ...e, balanceCents: balance });
  }
  return {
    summary: {
      forwardCents: forward,
      chargedCents: charged,
      creditedCents: credited,
      balanceCents: forward + charged - credited,
      tipsCents: tipsInRange,
    },
    rows,
  };
}

const inRange = (date: string, range: StatementRange): boolean =>
  (!range.from || date >= range.from) && (!range.to || date <= range.to);

// ---- range presets (Transactions page) ----

export type PresetKey = 'month' | 'last' | 'year' | 'all' | 'custom';

/**
 * Presets anchor on "today" in the BUSINESS time zone (finding 4): near
 * midnight, a device in another zone must not flip which month "This month"
 * means. Month boundaries are pure calendar string math from that anchor.
 */
export function presetRange(
  key: PresetKey,
  custom: { from: string; to: string },
  timeZone: string,
): StatementRange {
  const today = ymdInZone(new Date(), timeZone);
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7)); // 1-12
  const pad2 = (n: number) => String(n).padStart(2, '0');
  if (key === 'month') return { from: `${y}-${pad2(m)}-01` };
  if (key === 'last') {
    const py = m === 1 ? y - 1 : y;
    const pm = m === 1 ? 12 : m - 1;
    // Date.UTC day 0 of this month = the last day of the previous month;
    // UTC-only fields, so the device zone never touches the arithmetic.
    const lastDay = new Date(Date.UTC(y, m - 1, 0)).getUTCDate();
    return { from: `${py}-${pad2(pm)}-01`, to: `${py}-${pad2(pm)}-${pad2(lastDay)}` };
  }
  if (key === 'year') return { from: `${y}-01-01` };
  if (key === 'custom')
    return {
      ...(custom.from.trim() && { from: custom.from.trim() }),
      ...(custom.to.trim() && { to: custom.to.trim() }),
    };
  return {};
}

// ---- client side ----

export type StatementInvoice = {
  id: string;
  number: number;
  status: string;
  issued_on: string;
  items: { amount_cents: number; kind: string }[];
};
export type StatementPayment = {
  invoice_id: string;
  amount_cents: number;
  tip_cents: number;
  method: PaymentMethod;
  received_on: string;
};
export type StatementDeposit = {
  amount_cents: number;
  status: string;
  received_on: string | null;
  created_at: string;
  updated_at: string;
  memo: string | null;
};

export function buildClientStatement(input: {
  invoices: StatementInvoice[];
  payments: StatementPayment[];
  deposits: StatementDeposit[];
  range: StatementRange;
  timeZone: string;
}): Statement {
  const events: Event[] = [];
  const labelById = new Map<string, string>();
  for (const inv of input.invoices) {
    // Drafts are working documents and voids are reversed history — neither
    // belongs on a client-facing statement.
    if (inv.status !== 'sent' && inv.status !== 'paid') continue;
    const label = invoiceNumberLabel(inv.number);
    labelById.set(inv.id, label);
    const gross = inv.items
      .filter((i) => i.kind !== 'deposit_credit')
      .reduce((s, i) => s + i.amount_cents, 0);
    const depositCredit = -inv.items
      .filter((i) => i.kind === 'deposit_credit')
      .reduce((s, i) => s + i.amount_cents, 0);
    events.push({
      date: inv.issued_on,
      prio: 0,
      kind: 'invoice',
      description: `Invoice ${label}`,
      invoiceId: inv.id,
      chargeCents: gross,
      creditCents: 0,
      info: false,
    });
    if (depositCredit > 0) {
      events.push({
        date: inv.issued_on,
        prio: 1,
        kind: 'deposit_credit',
        description: `Deposit applied to ${label}`,
        invoiceId: inv.id,
        chargeCents: 0,
        creditCents: depositCredit,
        info: false,
      });
    }
  }
  let tips = 0;
  for (const p of input.payments) {
    if (!labelById.has(p.invoice_id)) continue; // draft/void invoice payments never show
    if (p.tip_cents > 0 && inRange(p.received_on, input.range)) tips += p.tip_cents;
    events.push({
      date: p.received_on,
      prio: 2,
      kind: 'payment',
      description: `Payment · ${methodLabel(p.method)} · ${labelById.get(p.invoice_id)!}`,
      invoiceId: p.invoice_id,
      ...(p.tip_cents > 0 && {
        note: `includes ${formatCents(p.tip_cents)} tip — not counted toward the balance`,
      }),
      chargeCents: 0,
      creditCents: p.amount_cents,
      info: false,
    });
  }
  let held = 0;
  for (const d of input.deposits) {
    if (d.status === 'held') held += d.amount_cents;
    // received_on is already a date; only the created_at fallback is an
    // instant needing the business-tz conversion.
    const receivedDate = d.received_on ?? ymdInZone(d.created_at, input.timeZone);
    events.push({
      date: receivedDate,
      prio: 3,
      kind: 'deposit_info',
      description: `Deposit received — ${formatCents(d.amount_cents)} held for future care`,
      ...(d.memo ? { note: d.memo } : {}),
      chargeCents: 0,
      creditCents: 0,
      info: true,
    });
    if (d.status === 'refunded' || d.status === 'forfeited') {
      events.push({
        date: ymdInZone(d.updated_at, input.timeZone),
        prio: 3,
        kind: 'deposit_info',
        description: `Deposit ${d.status} — ${formatCents(d.amount_cents)}`,
        chargeCents: 0,
        creditCents: 0,
        info: true,
      });
    }
  }
  const statement = assemble(events, input.range, tips);
  statement.summary.heldCents = held;
  return statement;
}

// ---- walker side ----

export type WalkerLedgerRow = {
  kind: 'wage' | 'tip' | 'adjustment' | 'payout';
  at: string;
  detail: string;
  amount_cents: number;
  statement_id: string | null;
};

export function buildWalkerStatement(input: {
  rows: WalkerLedgerRow[];
  range: StatementRange;
  timeZone: string;
}): Statement {
  const events: Event[] = [];
  let tips = 0;
  for (const r of input.rows) {
    const date = ymdInZone(r.at, input.timeZone);
    const earned = r.kind !== 'payout';
    if (r.kind === 'tip' && inRange(date, input.range)) tips += r.amount_cents;
    events.push({
      date,
      prio: earned ? 0 : 1,
      kind: r.kind,
      description:
        r.kind === 'payout'
          ? `Paid out — ${r.detail}`
          : r.kind === 'adjustment'
            ? `${r.detail} (adjustment)`
            : r.kind === 'tip'
              ? r.detail
              : r.detail,
      ...(r.statement_id === null && r.kind !== 'payout' ? { note: 'not yet on a statement' } : {}),
      chargeCents: earned ? r.amount_cents : 0,
      creditCents: earned ? 0 : r.amount_cents,
      info: false,
    });
  }
  return assemble(events, input.range, tips);
}
