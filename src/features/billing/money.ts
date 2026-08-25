/**
 * Pure billing math and labels (tested in __tests__/money.test.ts). Totals are
 * derived, never stored (spec §3): total = sum of items, balance = total −
 * payments. Dollars rendering reuses the services helpers — never duplicated.
 */

import { centsToDollarsString } from '@/src/features/services/form';

import type { InvoiceStatus } from './types';

export function sumCents(rows: { amount_cents: number }[]): number {
  return rows.reduce((sum, r) => sum + r.amount_cents, 0);
}

/** Invoice total: sum of item lines, negatives (credits, discounts) included. */
export function invoiceTotal(items: { amount_cents: number }[]): number {
  return sumCents(items);
}

export function paymentsTotal(payments: { amount_cents: number }[]): number {
  return sumCents(payments);
}

/**
 * True balance — NOT floored at zero: a negative balance is a real credit
 * (over-payment) and the owner should see it, not a lying $0.00.
 */
export function invoiceBalance(
  items: { amount_cents: number }[],
  payments: { amount_cents: number }[],
): number {
  return invoiceTotal(items) - paymentsTotal(payments);
}

/**
 * The DEVICE-local calendar date as 'YYYY-MM-DD'. Overdue is day-granular
 * display-only logic, so the device's own calendar day is the reference —
 * the Plan 2 Task 7 (document expiry) precedent; no hardcoded zone.
 */
function localDate(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * Overdue = due date strictly before today (due today is still on time) and
 * the invoice can still be paid (not paid, not void). Drafts count too — an
 * unsent invoice past its due date needs attention, not silence.
 */
export function isOverdue(
  invoice: { status: InvoiceStatus; due_on: string | null },
  now: Date,
): boolean {
  if (invoice.due_on === null) return false;
  if (invoice.status === 'paid' || invoice.status === 'void') return false;
  return invoice.due_on < localDate(now);
}

export type ChipTone = 'green' | 'muted' | 'danger' | 'warning' | 'neutral';

const STATUS_LABELS: Record<InvoiceStatus, string> = {
  draft: 'Draft',
  sent: 'Sent',
  paid: 'Paid',
  void: 'Void',
};

/**
 * Status chip, in precedence order: paid (green) > void (muted) > overdue
 * (danger) > partially paid (warning, 0 < payments < total) > stored status
 * (neutral). Takes both totals — balance alone cannot distinguish a partial
 * payment from no payment.
 */
export function statusChip(
  invoice: { status: InvoiceStatus; due_on: string | null },
  totals: { itemsCents: number; paymentsCents: number },
  now: Date,
): { label: string; tone: ChipTone } {
  if (invoice.status === 'paid') return { label: 'Paid', tone: 'green' };
  if (invoice.status === 'void') return { label: 'Void', tone: 'muted' };
  if (isOverdue(invoice, now)) return { label: 'Overdue', tone: 'danger' };
  if (totals.paymentsCents > 0 && totals.paymentsCents < totals.itemsCents) {
    return { label: 'Partially paid', tone: 'warning' };
  }
  return { label: STATUS_LABELS[invoice.status], tone: 'neutral' };
}

/**
 * Summary strip "Unpaid $X": sum of TRUE balances across `sent` invoices —
 * drafts are not billed yet (they have their own chip/filter) and paid/void
 * owe nothing. An over-paid but still-sent invoice reduces the total.
 */
export function unpaidTotalCents(
  invoices: {
    status: InvoiceStatus;
    items: { amount_cents: number }[];
    payments: { amount_cents: number }[];
  }[],
): number {
  return invoices
    .filter((inv) => inv.status === 'sent')
    .reduce((sum, inv) => sum + invoiceBalance(inv.items, inv.payments), 0);
}

/** Summary strip "Overdue N". */
export function overdueCount(
  invoices: { status: InvoiceStatus; due_on: string | null }[],
  now: Date,
): number {
  return invoices.filter((inv) => isOverdue(inv, now)).length;
}

/** 7 -> 'INV-0007' (spec §2.1); five-digit sequences simply outgrow the pad. */
export function invoiceNumberLabel(n: number): string {
  return `INV-${String(n).padStart(4, '0')}`;
}

/** Cents -> '$13.00' / '-$5.00' — sign outside the $, two decimals always. */
export function formatCents(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  return `${sign}$${centsToDollarsString(Math.abs(cents))}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * 'YYYY-MM-DD' -> 'Aug 25, 2026'. Calendar-only string math (date columns
 * carry no zone — Plan 2 Task 6/7 precedent); malformed input passes through.
 */
export function formatIsoDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const month = MONTHS[Number(m[2]) - 1];
  if (!month) return iso;
  return `${month} ${Number(m[3])}, ${m[1]}`;
}
