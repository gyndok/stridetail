import { supabase } from '@/src/lib/supabase';

export type MemberRole = 'owner' | 'walker';
export type MembershipStatus = 'invited' | 'active' | 'inactive';

export type Membership = {
  id: string;
  business_id: string;
  role: MemberRole;
  status: MembershipStatus;
  business: {
    id: string;
    name: string;
    brand_color: string;
    time_zone: string;
    logo_path: string | null;
  };
};

export async function listMyMemberships(): Promise<Membership[]> {
  // RLS lets members read every membership in their businesses (Team screen), so filter to
  // the caller's own rows here or a walker would pick up the owner's membership as home.
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return [];
  const { data, error } = await supabase
    .from('memberships')
    .select('id, business_id, role, status, business:businesses(id, name, brand_color, time_zone, logo_path)')
    .eq('user_id', session.user.id)
    .eq('status', 'active');
  if (error) throw error;
  return (data ?? []) as unknown as Membership[];
}

export async function createBusiness(input: {
  name: string;
  timeZone: string;
  brandColor?: string;
}): Promise<string> {
  const { data, error } = await supabase.rpc('create_business', {
    p_name: input.name.trim(),
    p_time_zone: input.timeZone,
    p_brand_color: input.brandColor ?? null,
  });
  if (error) throw error;
  return data as string;
}

export async function createInvite(
  businessId: string,
  role: MemberRole,
  contact: { phone?: string; email?: string },
): Promise<string> {
  const { data, error } = await supabase.rpc('create_invite', {
    p_business: businessId,
    p_role: role,
    p_phone: contact.phone ?? null,
    p_email: contact.email ?? null,
  });
  if (error) throw error;
  return data as string;
}
