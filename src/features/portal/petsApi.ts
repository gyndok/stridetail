import { supabase } from '@/src/lib/supabase';
import { storagePetPhotoPath } from '@/src/features/pets/helpers';

/**
 * Portal pets self-service (Plan 8 Task 6). House rules apply DOUBLY here:
 * named columns ONLY, and writes carry EXACTLY the self-service column set —
 * the RLS update policy opens the row, the pets BEFORE UPDATE trigger
 * (20260826000002) pins the columns server-side, and
 * portalPetsQueries.test.ts pins the payload shape client-side.
 *
 * meds_md / allergies are readable for clients (the pets grant is table-wide
 * and the client SELECT policy is row-level), but they are owner-curated
 * walker-safety notes: the portal renders them READ-ONLY and never writes them.
 */

export const PORTAL_PET_CARD_COLUMNS = 'id, client_id, name, species, breed, photo_path';

export type PortalPetCard = {
  id: string;
  client_id: string;
  name: string;
  species: string | null;
  breed: string | null;
  photo_path: string | null;
};

/** The client's pets for the tab's card list. */
export async function listPortalPetCards(clientId: string): Promise<PortalPetCard[]> {
  const { data, error } = await supabase
    .from('pets')
    .select(PORTAL_PET_CARD_COLUMNS)
    .eq('client_id', clientId)
    .order('name', { ascending: true });
  if (error) throw error;
  return (data ?? []) as PortalPetCard[];
}

export const PORTAL_PET_DETAIL_COLUMNS =
  'id, client_id, business_id, name, species, breed, birthdate, feeding_md, meds_md, ' +
  'allergies, reactivity_md, vet_name, vet_phone, vet_address, photo_path';

export type PortalPetDetail = PortalPetCard & {
  business_id: string;
  birthdate: string | null;
  feeding_md: string | null;
  meds_md: string | null;
  allergies: string | null;
  reactivity_md: string | null;
  vet_name: string | null;
  vet_phone: string | null;
  vet_address: string | null;
};

/** One pet for the editor — scoped to the pet id AND the portal client. */
export async function getPortalPet(clientId: string, petId: string): Promise<PortalPetDetail> {
  const { data, error } = await supabase
    .from('pets')
    .select(PORTAL_PET_DETAIL_COLUMNS)
    .eq('client_id', clientId)
    .eq('id', petId)
    .single();
  if (error) throw error;
  return data as unknown as PortalPetDetail;
}

/**
 * EXACTLY the client-updatable columns (photo_path travels separately via
 * uploadPortalPetPhoto). Anything else in an update raises server-side.
 */
export type PortalPetPatch = {
  feeding_md: string | null;
  reactivity_md: string | null;
  vet_name: string | null;
  vet_phone: string | null;
  vet_address: string | null;
};

export async function updatePortalPet(
  clientId: string,
  petId: string,
  patch: PortalPetPatch,
): Promise<PortalPetDetail> {
  const { data, error } = await supabase
    .from('pets')
    .update(patch)
    .eq('client_id', clientId)
    .eq('id', petId)
    .select(PORTAL_PET_DETAIL_COLUMNS)
    .single();
  if (error) throw error;
  return data as unknown as PortalPetDetail;
}

/**
 * Upload a picked photo to the pet's tenant-scoped media path and record it
 * on the row (the owner-side uploadPetPhoto pattern; the Task-6 storage
 * policies let the linked client write under their own pet's prefix).
 */
export async function uploadPortalPetPhoto(
  pet: Pick<PortalPetDetail, 'id' | 'client_id' | 'business_id'>,
  uri: string,
): Promise<PortalPetDetail> {
  const response = await fetch(uri);
  const body = await response.arrayBuffer();
  const path = storagePetPhotoPath(pet.business_id, pet.id);
  const { error } = await supabase.storage
    .from('media')
    .upload(path, body, { contentType: 'image/jpeg', upsert: true });
  if (error) throw error;
  const { data, error: updateError } = await supabase
    .from('pets')
    .update({ photo_path: path })
    .eq('client_id', pet.client_id)
    .eq('id', pet.id)
    .select(PORTAL_PET_DETAIL_COLUMNS)
    .single();
  if (updateError) throw updateError;
  return data as unknown as PortalPetDetail;
}

/** Signed url (1 hour) for a stored pet photo; the `media` bucket is private. */
export async function portalPetPhotoUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from('media').createSignedUrl(path, 3600);
  if (error) throw error;
  return data.signedUrl;
}
