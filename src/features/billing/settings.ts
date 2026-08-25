import { supabase } from '@/src/lib/supabase';

// Billing settings (Plan 6 Task 2): the per-business auto-invoice mode, Venmo
// handle, and payment instructions. Reads use a dedicated named-column query —
// the memberships business embed (useMemberships) deliberately does NOT carry
// these columns. Writes go straight at businesses under the core migration's
// "owner updates business" RLS policy (no amounts move here, so no RPC).

export type AutoInvoiceMode = 'per_visit' | 'per_sitting' | 'manual';

/** Mode choices for the settings card, in display order, with one-line hints. */
export const AUTO_INVOICE_MODES: { value: AutoInvoiceMode; label: string; hint: string }[] = [
  {
    value: 'per_visit',
    label: 'Invoice each visit',
    hint: 'Every finished visit sends its own invoice to the client automatically.',
  },
  {
    value: 'per_sitting',
    label: 'Add to open draft',
    hint: 'Finished visits collect on one draft invoice you review and send.',
  },
  {
    value: 'manual',
    label: 'Manual',
    hint: 'Nothing automatic — you create and send every invoice yourself.',
  },
];

export const BUSINESS_BILLING_COLUMNS =
  'id, auto_invoice, venmo_handle, payment_instructions_md';

export type BusinessBilling = {
  id: string;
  auto_invoice: AutoInvoiceMode;
  venmo_handle: string | null;
  payment_instructions_md: string | null;
};

export async function getBusinessBilling(businessId: string): Promise<BusinessBilling> {
  const { data, error } = await supabase
    .from('businesses')
    .select(BUSINESS_BILLING_COLUMNS)
    .eq('id', businessId)
    .single();
  if (error) throw error;
  return data as unknown as BusinessBilling;
}

/**
 * '@alex' / ' @alex ' / 'alex' -> 'alex'; blank (or bare '@') -> null, which
 * hides the public page's Venmo button. The deep link needs the bare handle,
 * so the leading '@' people naturally type is stripped at save time.
 */
export function normalizeVenmoHandle(text: string): string | null {
  const trimmed = text.trim().replace(/^@+/, '');
  return trimmed === '' ? null : trimmed;
}

export async function updateBusinessBilling(
  businessId: string,
  patch: {
    auto_invoice: AutoInvoiceMode;
    venmo_handle: string | null;
    payment_instructions_md: string | null;
  },
): Promise<void> {
  const { error } = await supabase.from('businesses').update(patch).eq('id', businessId);
  if (error) throw error;
}
