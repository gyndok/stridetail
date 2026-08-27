import type { Membership } from '@/src/features/business/api';
import { resolveHome, type HomeHref } from '@/src/features/business/resolveHome';

import type { ClientLink } from './api';

export type EntryHref = HomeHref | '/(portal)/home';

/**
 * Where a signed-in user belongs (Plan 8 Task 2).
 * - Any membership → the existing staff resolution (resolveHome, unchanged);
 *   a dual-role user (staff + client) deliberately lands on staff.
 * - No memberships but linked as a client → the portal.
 * - Neither: `viaPortal` (the persisted portal-login door flag) sends them to
 *   the portal's "no account found" state instead of business onboarding.
 */
export function resolveEntry(
  memberships: Membership[],
  clientLinks: ClientLink[],
  activeId: string | null,
  viaPortal: boolean,
): { href: EntryHref; businessId: string | null } {
  if (memberships.length) return resolveHome(memberships, activeId);
  if (clientLinks.length || viaPortal) return { href: '/(portal)/home', businessId: null };
  return { href: '/onboarding/create-business', businessId: null };
}
