import { supabase } from '@/src/lib/supabase';

/**
 * Per-client price overrides (round 6a — Alexandria's grandfathered-price
 * report). An override replaces the service's BASE price for that client; the
 * extra-pet formula still applies on top. Owner-only by RLS.
 */

export type ClientPrice = {
  id: string;
  client_id: string;
  service_id: string;
  base_price_cents: number;
};

/** Effective base for a (client, service): the override when set, else the service base. */
export function effectiveBaseCents(
  override: number | null | undefined,
  serviceBaseCents: number,
): number {
  return override ?? serviceBaseCents;
}

export async function listClientPrices(
  businessId: string,
  clientId: string,
): Promise<ClientPrice[]> {
  const { data, error } = await supabase
    .from('client_prices')
    .select('id, client_id, service_id, base_price_cents')
    .eq('business_id', businessId)
    .eq('client_id', clientId);
  if (error) throw error;
  return (data ?? []) as ClientPrice[];
}

export async function setClientPrice(
  businessId: string,
  clientId: string,
  serviceId: string,
  baseCents: number,
): Promise<void> {
  if (!Number.isFinite(baseCents) || baseCents < 0) {
    throw new Error('Price must be zero or more.');
  }
  const { error } = await supabase.from('client_prices').upsert(
    {
      business_id: businessId,
      client_id: clientId,
      service_id: serviceId,
      base_price_cents: Math.round(baseCents),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'client_id,service_id' },
  );
  if (error) throw error;
}

export async function clearClientPrice(
  businessId: string,
  clientId: string,
  serviceId: string,
): Promise<void> {
  const { error } = await supabase
    .from('client_prices')
    .delete()
    .eq('business_id', businessId)
    .eq('client_id', clientId)
    .eq('service_id', serviceId);
  if (error) throw error;
}
