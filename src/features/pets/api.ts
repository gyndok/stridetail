import { supabase } from '@/src/lib/supabase';

import { storagePetPhotoPath } from './helpers';
import type { Pet, PetInput } from './types';

export async function listPets(businessId: string, clientId: string): Promise<Pet[]> {
  const { data, error } = await supabase
    .from('pets')
    .select('*')
    .eq('business_id', businessId)
    .eq('client_id', clientId)
    .order('name');
  if (error) throw error;
  return (data ?? []) as unknown as Pet[];
}

export async function getPet(businessId: string, id: string): Promise<Pet> {
  const { data, error } = await supabase
    .from('pets')
    .select('*')
    .eq('business_id', businessId)
    .eq('id', id)
    .single();
  if (error) throw error;
  return data as unknown as Pet;
}

/**
 * Hard-delete a pet — the "no-references typo case" from the delete story
 * (beta round 3, 2026-09-02: accidental duplicates). Any visit carrying the
 * pet blocks it: history must keep its pets, and that case waits for the
 * archive feature. pet_documents rows cascade with the row; their stored
 * files and the photo are removed best-effort afterward (an orphaned object
 * costs nothing; a thrown storage error after the row is gone helps no one).
 */
export async function deletePet(
  businessId: string,
  pet: Pick<Pet, 'id' | 'photo_path'>,
): Promise<void> {
  const { count, error: refError } = await supabase
    .from('visits')
    .select('id', { count: 'exact', head: true })
    .eq('business_id', businessId)
    .contains('pet_ids', [pet.id]);
  if (refError) throw refError;
  if ((count ?? 0) > 0) {
    throw new Error(
      `This pet is on ${count} visit${count === 1 ? '' : 's'} and can't be deleted — ` +
        'that history has to stay intact. (Archiving pets is coming; for now, ask support.)',
    );
  }

  const { data: docs, error: docsError } = await supabase
    .from('pet_documents')
    .select('storage_path')
    .eq('business_id', businessId)
    .eq('pet_id', pet.id);
  if (docsError) throw docsError;

  const { error } = await supabase
    .from('pets')
    .delete()
    .eq('business_id', businessId)
    .eq('id', pet.id);
  if (error) throw error;

  const paths = [
    ...(pet.photo_path ? [pet.photo_path] : []),
    ...(docs ?? []).map((d) => (d as { storage_path: string }).storage_path),
  ];
  if (paths.length > 0) {
    await supabase.storage
      .from('media')
      .remove(paths)
      .catch(() => undefined);
  }
}

export async function createPet(
  businessId: string,
  clientId: string,
  input: PetInput,
): Promise<Pet> {
  const { data, error } = await supabase
    .from('pets')
    .insert({ ...input, business_id: businessId, client_id: clientId })
    .select()
    .single();
  if (error) throw error;
  return data as unknown as Pet;
}

export async function updatePet(
  businessId: string,
  id: string,
  patch: Partial<PetInput>,
): Promise<Pet> {
  const { data, error } = await supabase
    .from('pets')
    .update(patch)
    .eq('business_id', businessId)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as unknown as Pet;
}

/**
 * Upload a picked photo to the `media` bucket at the tenant-scoped path and
 * record it on the pet row. React Native supabase-js pattern: fetch the local
 * file uri and upload its ArrayBuffer (FormData/Blob uploads are unreliable in RN).
 */
export async function uploadPetPhoto(businessId: string, petId: string, uri: string): Promise<Pet> {
  const response = await fetch(uri);
  const body = await response.arrayBuffer();
  const path = storagePetPhotoPath(businessId, petId);
  const { error } = await supabase.storage
    .from('media')
    .upload(path, body, { contentType: 'image/jpeg', upsert: true });
  if (error) throw error;
  return updatePet(businessId, petId, { photo_path: path });
}

/** Signed url (1 hour) for a stored pet photo; the `media` bucket is private. */
export async function petPhotoUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from('media').createSignedUrl(path, 3600);
  if (error) throw error;
  return data.signedUrl;
}
