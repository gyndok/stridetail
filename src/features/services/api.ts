import { supabase } from '@/src/lib/supabase';

import type { Service, ServiceInput } from './types';

/**
 * Owner-side catalog read: the owner select policy on `services` exposes the
 * full row including prices (Plan 1 core migration), so `select('*')` is fine
 * here — the visits column grant only restricts `visits.price_cents_snapshot`.
 * Active services sort first, then by name.
 */
export async function listServices(businessId: string): Promise<Service[]> {
  const { data, error } = await supabase
    .from('services')
    .select('*')
    .eq('business_id', businessId)
    .order('active', { ascending: false })
    .order('name');
  if (error) throw error;
  return (data ?? []) as unknown as Service[];
}

export async function createService(businessId: string, input: ServiceInput): Promise<Service> {
  const { data, error } = await supabase
    .from('services')
    .insert({ ...input, business_id: businessId })
    .select()
    .single();
  if (error) throw error;
  return data as unknown as Service;
}

export async function updateService(
  businessId: string,
  id: string,
  patch: Partial<ServiceInput>,
): Promise<Service> {
  const { data, error } = await supabase
    .from('services')
    .update(patch)
    .eq('business_id', businessId)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as unknown as Service;
}
