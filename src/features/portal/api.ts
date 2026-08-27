import { supabase } from '@/src/lib/supabase';

/** One row of client_users: this auth user is a linked client of that business. */
export type ClientLink = {
  id: string;
  business_id: string;
  client_id: string;
};

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
