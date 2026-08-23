import type { Membership } from './api';

export type HomeHref = '/onboarding/create-business' | '/(owner)/today' | '/(walker)/today';

export function resolveHome(
  memberships: Membership[],
  activeId: string | null,
): { href: HomeHref; businessId: string | null } {
  if (!memberships.length) return { href: '/onboarding/create-business', businessId: null };
  const chosen = memberships.find((m) => m.business_id === activeId) ?? memberships[0]!;
  return {
    href: chosen.role === 'owner' ? '/(owner)/today' : '/(walker)/today',
    businessId: chosen.business_id,
  };
}
