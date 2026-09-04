/**
 * Mirrors the billing tables (supabase/migrations/20260825000001_billing.sql).
 * Status/method unions mirror the enums; invoice_items.kind is a text column
 * with a check constraint, not an enum (Plan 5 Task 1 deviation).
 */

export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'void';
export type DepositStatus = 'requested' | 'held' | 'applied' | 'refunded' | 'forfeited';
export type PaymentMethod = 'venmo' | 'zelle' | 'apple_pay' | 'cash' | 'check' | 'other';
export type InvoiceItemKind = 'visit' | 'manual' | 'deposit_credit';

export type Invoice = {
  id: string;
  business_id: string;
  client_id: string;
  /** Per-business INV-0001 sequence (see invoiceNumberLabel in money.ts). */
  number: number;
  status: InvoiceStatus;
  issued_on: string;
  due_on: string | null;
  public_token: string | null;
  sent_at: string | null;
  paid_at: string | null;
  revoked_at: string | null;
  notes_md: string | null;
  created_at: string;
  updated_at: string;
};

export type InvoiceItem = {
  id: string;
  business_id: string;
  invoice_id: string;
  /** Unique when set — a visit is invoiced once; void releases the slot. */
  visit_id: string | null;
  description: string;
  /** May be negative: manual discounts and deposit_credit lines. */
  amount_cents: number;
  kind: InvoiceItemKind;
  created_at: string;
  updated_at: string;
};

export type Deposit = {
  id: string;
  business_id: string;
  client_id: string;
  amount_cents: number;
  status: DepositStatus;
  method: PaymentMethod | null;
  received_on: string | null;
  applied_invoice_id: string | null;
  memo: string | null;
  created_at: string;
  updated_at: string;
};

export type Payment = {
  id: string;
  business_id: string;
  invoice_id: string;
  method: PaymentMethod;
  amount_cents: number;
  /** Gratuity portion (round 7): excluded from invoice balance, 100% to the walker. */
  tip_cents: number;
  received_on: string;
  memo: string | null;
  created_at: string;
  updated_at: string;
};
