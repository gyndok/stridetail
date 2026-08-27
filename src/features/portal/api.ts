import { supabase } from '@/src/lib/supabase';

/** One row of client_users: this auth user is a linked client of that business. */
export type ClientLink = {
  id: string;
  business_id: string;
  client_id: string;
};

/** claim_client_links() RPC result (Plan 8 Task 3). */
export type ClaimResult = {
  linked: number;
  links: { client_id: string; business_id: string }[];
};

/**
 * Link the signed-in OTP user to every client row their auth email matches in
 * businesses that INVITED it (definer RPC; idempotent, cheap). Runs after each
 * portal OTP login and again from portal home when no links are found.
 */
export async function claimClientLinks(): Promise<ClaimResult> {
  const { data, error } = await supabase.rpc('claim_client_links');
  if (error) throw error;
  const d = data as Partial<ClaimResult> | null;
  return { linked: d?.linked ?? 0, links: d?.links ?? [] };
}

export async function listMyClientLinks(): Promise<ClientLink[]> {
  // Owners can also read links for their businesses (they manage them), so
  // filter to the caller's own rows — mirrors listMyMemberships.
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return [];
  const { data, error } = await supabase
    .from('client_users')
    .select('id, business_id, client_id')
    .eq('user_id', session.user.id);
  if (error) throw error;
  return (data ?? []) as ClientLink[];
}
