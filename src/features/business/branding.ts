import { supabase } from '@/src/lib/supabase';

/**
 * Client-facing brand color (2026-08-30, sponsor request). businesses.brand_color
 * flows to every surface a CLIENT sees — report pages, invoice pages, the
 * portal header, and the branded email shell. The app's own chrome stays on
 * Stridetail tokens.
 *
 * CURATED palette, not a free hex field: every swatch is dark enough that the
 * white header/button text on those surfaces stays readable (the email shell
 * and public pages always set white text on this color). The rose entry
 * echoes the first tenant's logo heart, darkened for contrast.
 */
export const BRAND_COLORS: { hex: string; label: string }[] = [
  { hex: '#E8642C', label: 'Sunset (default)' },
  { hex: '#C94F4D', label: 'Rose' },
  { hex: '#B04A6F', label: 'Berry' },
  { hex: '#3A7D5C', label: 'Forest' },
  { hex: '#2F8F83', label: 'Teal' },
  { hex: '#3B6EA5', label: 'Lake' },
  { hex: '#7C5CB8', label: 'Violet' },
  { hex: '#4A4038', label: 'Charcoal' },
];

export const DEFAULT_BRAND_COLOR = BRAND_COLORS[0]!.hex;

export function brandColorLabel(value: string | null | undefined): string | null {
  return BRAND_COLORS.find((c) => c.hex === value)?.label ?? null;
}

/**
 * Owner-only direct update under the core "owner updates business" RLS policy
 * (the billing-settings write pattern — no amounts move, no RPC needed).
 */
export async function updateBrandColor(businessId: string, color: string): Promise<void> {
  const { error } = await supabase
    .from('businesses')
    .update({ brand_color: color })
    .eq('id', businessId);
  if (error) throw error;
}
