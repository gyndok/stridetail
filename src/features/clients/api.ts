import { supabase } from '@/src/lib/supabase';

import type { Client, ClientDetail, ClientInput, ClientListItem, CountEmbed } from './types';

/** Escape ilike wildcards (%, _) and backslash so user input matches literally. */
export function escapeIlike(term: string): string {
  return term.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Build the ilike pattern for a name search; null when the term is blank. */
export function buildNameSearch(term: string | null | undefined): string | null {
  const trimmed = term?.trim();
  if (!trimmed) return null;
  return `%${escapeIlike(trimmed)}%`;
}

/** The "Meet & greet pending" badge shows while mg_completed_at is null. */
export function isMeetGreetPending(client: Pick<Client, 'mg_completed_at'>): boolean {
  return client.mg_completed_at === null;
}

/** Unwrap a supabase `pets(count)` embed ([{ count: n }]) to a plain number. */
export function embeddedCount(embed: CountEmbed | null | undefined): number {
  return embed?.[0]?.count ?? 0;
}

export function petsCountLabel(count: number): string {
  if (count === 0) return 'No pets';
  return count === 1 ? '1 pet' : `${count} pets`;
}

export function firstPhone(phones: string[] | null | undefined): string | null {
  return phones?.[0] ?? null;
}

/** How to render marketing_photos_ok wherever it appears (detail, visit brief). */
export type MarketingPhotosView = { label: string; tone: 'ok' | 'no' | 'unknown' };

export function marketingPhotosView(value: boolean | null | undefined): MarketingPhotosView {
  if (value === true) return { label: 'Marketing photos allowed', tone: 'ok' };
  if (value === false) return { label: 'No marketing photos', tone: 'no' };
  return { label: 'Marketing photos: not asked — treat as no', tone: 'unknown' };
}

/** What the client-detail "Client portal" card should offer (Plan 8 Task 3). */
export type PortalInviteState = 'needs-email' | 'invitable' | 'invited';

export function portalInviteState(
  client: Pick<Client, 'email' | 'portal_invited_at'>,
): PortalInviteState {
  if (!client.email || client.email.trim() === '') return 'needs-email';
  return client.portal_invited_at ? 'invited' : 'invitable';
}

/**
 * Owner-only definer RPC: stamps clients.portal_invited_at and queues the
 * client_invite email. Re-inviting is allowed (re-stamps + re-queues).
 */
export async function inviteClientToPortal(clientId: string): Promise<void> {
  const { error } = await supabase.rpc('invite_client_to_portal', { p_client: clientId });
  if (error) throw error;
}

export async function listClients(businessId: string, search?: string): Promise<ClientListItem[]> {
  let query = supabase
    .from('clients')
    .select('id, name, phones, mg_completed_at, lat, lng, pets(count)')
    .eq('business_id', businessId);
  const pattern = buildNameSearch(search);
  if (pattern) query = query.ilike('name', pattern);
  const { data, error } = await query.order('name');
  if (error) throw error;
  return (data ?? []) as unknown as ClientListItem[];
}

export async function getClient(businessId: string, id: string): Promise<ClientDetail> {
  const { data, error } = await supabase
    .from('clients')
    .select('*, pets(count)')
    .eq('business_id', businessId)
    .eq('id', id)
    .single();
  if (error) throw error;
  return data as unknown as ClientDetail;
}

export async function createClient(businessId: string, input: ClientInput): Promise<Client> {
  const { data, error } = await supabase
    .from('clients')
    .insert({ ...input, business_id: businessId })
    .select()
    .single();
  if (error) throw error;
  return data as unknown as Client;
}

export async function updateClient(
  businessId: string,
  id: string,
  patch: Partial<ClientInput>,
): Promise<Client> {
  const { data, error } = await supabase
    .from('clients')
    .update(patch)
    .eq('business_id', businessId)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as unknown as Client;
}
