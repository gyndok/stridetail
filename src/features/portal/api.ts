import { supabase } from '@/src/lib/supabase';

import type { PortalVisitStatus } from './home';

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

// ===== Task 4: dashboard reads =====
// House rules apply DOUBLY here: named columns ONLY. visits.price_cents_snapshot
// is excluded from the role-wide column grant, so selecting it (or '*') errors
// the whole query for clients; owner_notes_md / decline_reason /
// private_notes_md are technically selectable but must never be fetched or
// rendered in the portal (portalQueries.test.ts pins the shapes).

/** Branding + zone for the portal shell — the tenant's identity, not ours. */
export const PORTAL_BUSINESS_COLUMNS = 'id, name, brand_color, time_zone';

export type PortalBusiness = {
  id: string;
  name: string;
  brand_color: string;
  time_zone: string;
};

/** The linked businesses' branding rows (RLS: "client reads linked businesses"). */
export async function listPortalBusinesses(businessIds: string[]): Promise<PortalBusiness[]> {
  if (!businessIds.length) return [];
  const { data, error } = await supabase
    .from('businesses')
    .select(PORTAL_BUSINESS_COLUMNS)
    .in('id', businessIds);
  if (error) throw error;
  return (data ?? []) as PortalBusiness[];
}

export const PORTAL_VISIT_COLUMNS =
  'id, business_id, client_id, scheduled_start, scheduled_end, business_tz, status, pet_ids, ' +
  'service:services(name)';

export type PortalVisit = {
  id: string;
  business_id: string;
  client_id: string;
  scheduled_start: string;
  scheduled_end: string;
  business_tz: string;
  status: PortalVisitStatus;
  pet_ids: string[];
  /** Null when the service was deactivated (client policy reads active only). */
  service: { name: string } | null;
};

/**
 * The client's next visits: on the calendar or underway, not yet over
 * (gte scheduled_end keeps an in-progress visit visible past its start).
 */
export async function listUpcomingVisits(
  clientId: string,
  nowIso: string,
  limit = 3,
): Promise<PortalVisit[]> {
  const { data, error } = await supabase
    .from('visits')
    .select(PORTAL_VISIT_COLUMNS)
    .eq('client_id', clientId)
    .in('status', ['unassigned', 'offered', 'accepted', 'in_progress'])
    .gte('scheduled_end', nowIso)
    .order('scheduled_start', { ascending: true })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as PortalVisit[];
}

export const PORTAL_REPORT_COLUMNS =
  'id, visit_id, created_at, ' +
  'visit:visits!inner(id, client_id, scheduled_start, business_tz, status, pet_ids, ' +
  'service:services(name))';

export type PortalReport = {
  id: string;
  visit_id: string;
  created_at: string;
  visit: {
    id: string;
    client_id: string;
    scheduled_start: string;
    business_tz: string;
    status: PortalVisitStatus;
    pet_ids: string[];
    service: { name: string } | null;
  };
};

/** The client's most recent report cards, newest first. */
export async function listRecentReports(clientId: string, limit = 3): Promise<PortalReport[]> {
  const { data, error } = await supabase
    .from('visit_reports')
    .select(PORTAL_REPORT_COLUMNS)
    .eq('visit.client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as PortalReport[];
}

export const PORTAL_INVOICE_COLUMNS =
  'id, client_id, number, status, issued_on, due_on, ' +
  'items:invoice_items(amount_cents), payments:payments(amount_cents)';

export type PortalInvoice = {
  id: string;
  client_id: string;
  number: number;
  status: 'sent' | 'paid' | 'draft' | 'void';
  issued_on: string | null;
  due_on: string | null;
  items: { amount_cents: number }[];
  payments: { amount_cents: number }[];
};

/**
 * The client's outstanding invoices ('sent' only — the balance is client-side
 * math over items and payments; RLS already limits rows to sent|paid).
 */
export async function listPortalSentInvoices(clientId: string): Promise<PortalInvoice[]> {
  const { data, error } = await supabase
    .from('invoices')
    .select(PORTAL_INVOICE_COLUMNS)
    .eq('client_id', clientId)
    .eq('status', 'sent');
  if (error) throw error;
  return (data ?? []) as unknown as PortalInvoice[];
}

export type PortalPet = { id: string; name: string };

/** The client's own pets (id/name — enough to label pet_ids everywhere). */
export async function listPortalPets(clientId: string): Promise<PortalPet[]> {
  const { data, error } = await supabase
    .from('pets')
    .select('id, name')
    .eq('client_id', clientId)
    .order('name', { ascending: true });
  if (error) throw error;
  return (data ?? []) as PortalPet[];
}
