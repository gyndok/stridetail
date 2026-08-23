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
