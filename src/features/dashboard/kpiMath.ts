import { formatInTimeZone } from 'date-fns-tz';

import { formatCents, invoiceBalance, unpaidTotalCents } from '@/src/features/billing/money';
import type { InvoiceStatus } from '@/src/features/billing/types';
import { embeddedCount } from '@/src/features/clients/api';
import type { CountEmbed } from '@/src/features/clients/types';
import { weekRange } from '@/src/features/schedule/weekGrid';

// Pure KPI math for the owner desktop dashboard (Plan 8b Task 1), tested in
// __tests__/kpiMath.test.ts. Queries live in kpis.ts; nothing here touches
// supabase.
//
// WEEK DEFINITION: Sunday-based, in the BUSINESS time zone — the app's one
// week convention (schedule week grid, weekGrid.ts weekRange; JS getDay()
// weekday numbering). The sponsor mockup does not define weeks; matching the
// existing grid keeps "walks this week" and the schedule screen in agreement.
// All week math delegates to weekRange — no hand-rolled tz arithmetic, so DST
// weeks (167/169 real hours) come out right for free.

const HALF_DAY_MS = 43_200_000;

export type KpiWeekWindow = {
  /** Local Sunday, 'YYYY-MM-DD' (inclusive bound for date columns). */
  startYmd: string;
  /** Next local Sunday, 'YYYY-MM-DD' (exclusive bound for date columns). */
  endYmd: string;
  /** Local Sunday 00:00 as a UTC instant (inclusive bound for timestamps). */
  fromUtc: Date;
  /** Next local Sunday 00:00 as a UTC instant (exclusive bound). */
  toUtc: Date;
};

export type KpiWeekWindows = { current: KpiWeekWindow; previous: KpiWeekWindow };

/**
 * The current and previous business weeks around `nowUtc`. The previous week's
 * anchor is 12 h before the current week's start — always inside the previous
 * week, whatever DST did to its length. The two windows are contiguous by
 * construction (previous.toUtc === current.fromUtc).
 */
export function kpiWeekWindows(nowUtc: Date, tz: string): KpiWeekWindows {
  const cur = weekRange(nowUtc, tz);
  const prev = weekRange(new Date(cur.fromUtc.getTime() - HALF_DAY_MS), tz);
  return {
    current: {
      startYmd: cur.weekStartYmd,
      endYmd: formatInTimeZone(cur.toUtc, tz, 'yyyy-MM-dd'),
      fromUtc: cur.fromUtc,
      toUtc: cur.toUtc,
    },
    previous: {
      startYmd: prev.weekStartYmd,
      endYmd: cur.weekStartYmd,
      fromUtc: prev.fromUtc,
      toUtc: cur.fromUtc,
    },
  };
}

// ---- Revenue this week ----

export type PaymentRow = { amount_cents: number; received_on: string };

export type RevenueKpi = { currentCents: number; previousCents: number; deltaCents: number };

/**
 * Payments summed into the current and previous week by `received_on` (a DATE
 * column — plain 'YYYY-MM-DD' string comparison against the local week
 * bounds). Rows outside both windows are ignored, so the caller may over-fetch.
 */
export function revenueKpi(payments: PaymentRow[], windows: KpiWeekWindows): RevenueKpi {
  const sumIn = (w: KpiWeekWindow) =>
    payments
      .filter((p) => p.received_on >= w.startYmd && p.received_on < w.endYmd)
      .reduce((sum, p) => sum + p.amount_cents, 0);
  const currentCents = sumIn(windows.current);
  const previousCents = sumIn(windows.previous);
  return { currentCents, previousCents, deltaCents: currentCents - previousCents };
}

export type DeltaTone = 'green' | 'warning' | 'muted';

/** '▲ $12.00 vs last week' (green) / '▼ …' (warning) / flat (muted). */
export function revenueDeltaLabel(deltaCents: number): { text: string; tone: DeltaTone } {
  if (deltaCents > 0) return { text: `▲ ${formatCents(deltaCents)} vs last week`, tone: 'green' };
  if (deltaCents < 0) return { text: `▼ ${formatCents(-deltaCents)} vs last week`, tone: 'warning' };
  return { text: 'Same as last week', tone: 'muted' };
}

// ---- Walks this week ----

export type WalksKpi = { completed: number; total: number };

/** completed / total for the week's visits; cancelled rows count in neither. */
export function walksKpi(visits: { status: string }[]): WalksKpi {
  const active = visits.filter((v) => v.status !== 'cancelled');
  return {
    completed: active.filter((v) => v.status === 'completed').length,
    total: active.length,
  };
}

// ---- Active clients ----

export type ClientsKpi = { clients: number; pets: number };

/** Client rows with the standard `pets(count)` embed -> counts of both. */
export function clientsKpi(rows: { pets: CountEmbed | null }[]): ClientsKpi {
  return {
    clients: rows.length,
    pets: rows.reduce((sum, r) => sum + embeddedCount(r.pets), 0),
  };
}

// ---- Outstanding ----

export type OutstandingInvoice = {
  status: InvoiceStatus;
  items: { amount_cents: number }[];
  payments: { amount_cents: number }[];
};

export type OutstandingKpi = { totalCents: number; unpaidCount: number };

/**
 * Total = unpaidTotalCents (money.ts): sum of TRUE balances across `sent`
 * invoices, over-payments included as credits. Count = sent invoices with a
 * balance still > 0 — an over-paid but still-sent invoice reduces the total
 * yet is not "an unpaid invoice" to chase. Robust to non-sent rows in input.
 */
export function outstandingKpi(invoices: OutstandingInvoice[]): OutstandingKpi {
  return {
    totalCents: unpaidTotalCents(invoices),
    unpaidCount: invoices.filter(
      (inv) => inv.status === 'sent' && invoiceBalance(inv.items, inv.payments) > 0,
    ).length,
  };
}
