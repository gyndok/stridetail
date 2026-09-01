import { buildInviteLink } from '@/src/features/business/inviteLink';
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
    /** Grace window (hours) for the offline reveal cache (spec §8). */
    access_grace_hours: number;
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
    .select(
      'id, business_id, role, status, ' +
        'business:businesses(id, name, brand_color, time_zone, logo_path, access_grace_hours)',
    )
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

/**
 * Walker offboarding (20260901000001): atomic definer RPC — future
 * offered/accepted visits return to the pool (history keeps the walker),
 * the membership (or unaccepted invite) is deleted, audited. Owner-only,
 * walker-rows only; blocked while a visit is in progress. Returns how many
 * visits went back to unassigned.
 */
export async function removeWalker(membershipId: string): Promise<number> {
  const { data, error } = await supabase.rpc('remove_walker', { p_membership: membershipId });
  if (error) throw error;
  return (data ?? 0) as number;
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

/**
 * Queue an invite SMS through the Plan-4 notifications queue (spec §2 item 2).
 * The 0011 owner insert policy allows exactly this row shape: sms channel,
 * invite template, own business, born 'queued'. The per-minute send-sms cron
 * drains it (skipped_no_provider until Twilio credentials land).
 */
export async function queueInviteSms(businessId: string, phone: string, token: string): Promise<void> {
  const { error } = await supabase.from('notifications').insert({
    business_id: businessId,
    channel: 'sms',
    to: phone,
    template: 'invite',
    payload: { token, link: buildInviteLink(token) },
    next_attempt_at: new Date().toISOString(),
  });
  if (error) throw error;
}
