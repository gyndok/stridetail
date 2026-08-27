import { useQuery } from '@tanstack/react-query';

import { getPortalPet, listPortalPetCards, portalPetPhotoUrl } from './petsApi';

/**
 * Portal pets queries (Plan 8 Task 6). Keys are 'portal-*' prefixed and NOT in
 * the offline persist whitelist — same web-first stance as hooks.ts. Lives in
 * its own file because Task 5/7 siblings own edits to hooks.ts-adjacent code.
 */

export function usePortalPetCards(clientId: string | null) {
  return useQuery({
    queryKey: ['portal-pet-cards', clientId],
    queryFn: () => listPortalPetCards(clientId as string),
    enabled: Boolean(clientId),
  });
}

export function usePortalPet(clientId: string | null, petId: string | null) {
  return useQuery({
    queryKey: ['portal-pet', clientId, petId],
    queryFn: () => getPortalPet(clientId as string, petId as string),
    enabled: Boolean(clientId && petId),
  });
}

/** Signed url (1h) for the private media bucket; re-signed per path change. */
export function usePortalPetPhoto(path: string | null | undefined) {
  return useQuery({
    queryKey: ['portal-pet-photo', path],
    queryFn: () => portalPetPhotoUrl(path as string),
    enabled: Boolean(path),
    staleTime: 55 * 60 * 1000,
  });
}
