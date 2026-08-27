import { useQuery } from '@tanstack/react-query';

import {
  listPortalBusinesses,
  listPortalPets,
  listPortalSentInvoices,
  listRecentReports,
  listUpcomingVisits,
  type ClientLink,
  type PortalBusiness,
} from './api';
import { resolvePortalLink, usePortalScopeStore } from './scope';
import { useClientLinks } from './useClientLinks';

/**
 * Portal dashboard queries (Plan 8 Task 4). Keys are 'portal-*' prefixed and
 * deliberately NOT in the offline persist whitelist (queryPersister.ts): the
 * portal is a web-first, online-first surface — nothing here needs to survive
 * an offline relaunch (recorded in DEVIATIONS.md).
 */

export function usePortalBusinesses(businessIds: string[]) {
  const ids = [...businessIds].sort();
  return useQuery({
    queryKey: ['portal-businesses', ids],
    queryFn: () => listPortalBusinesses(ids),
    enabled: ids.length > 0,
  });
}

export function useUpcomingVisits(clientId: string | null) {
  return useQuery({
    queryKey: ['portal-upcoming-visits', clientId],
    queryFn: () => listUpcomingVisits(clientId as string, new Date().toISOString()),
    enabled: Boolean(clientId),
  });
}

export function useRecentReports(clientId: string | null) {
  return useQuery({
    queryKey: ['portal-recent-reports', clientId],
    queryFn: () => listRecentReports(clientId as string),
    enabled: Boolean(clientId),
  });
}

export function usePortalSentInvoices(clientId: string | null) {
  return useQuery({
    queryKey: ['portal-sent-invoices', clientId],
    queryFn: () => listPortalSentInvoices(clientId as string),
    enabled: Boolean(clientId),
  });
}

export function usePortalPets(clientId: string | null) {
  return useQuery({
    queryKey: ['portal-pets', clientId],
    queryFn: () => listPortalPets(clientId as string),
    enabled: Boolean(clientId),
  });
}

export type PortalScope = {
  /** The link every portal tab scopes to (selected, else first, else null). */
  link: ClientLink | null;
  links: ClientLink[];
  /** Branding row of the scoped link's business (null while loading). */
  business: PortalBusiness | null;
  businesses: PortalBusiness[];
  setLinkId: (id: string | null) => Promise<void>;
};

/**
 * The portal's single scoping hook: which client link (and so which business)
 * every tab shows. Multi-business clients pick via the Home switcher row; the
 * choice persists like activeBusinessId (scope.ts).
 */
export function usePortalScope(): PortalScope {
  const linksQuery = useClientLinks();
  const { linkId, setLinkId } = usePortalScopeStore();
  const links = linksQuery.isSuccess ? linksQuery.data : [];
  const link = resolvePortalLink(links, linkId);
  const businesses = usePortalBusinesses(links.map((l) => l.business_id));
  const business = businesses.data?.find((b) => b.id === link?.business_id) ?? null;
  return { link, links, business, businesses: businesses.data ?? [], setLinkId };
}
