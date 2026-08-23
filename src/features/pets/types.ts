/** Mirrors public.pets (supabase/migrations/20260824000001_clients_pets.sql). */
export type Pet = {
  id: string;
  client_id: string;
  business_id: string;
  name: string;
  species: string | null;
  breed: string | null;
  birthdate: string | null; // date column → 'YYYY-MM-DD'
  feeding_md: string | null;
  meds_md: string | null;
  allergies: string | null;
  reactivity_md: string | null;
  vet_name: string | null;
  vet_phone: string | null;
  vet_address: string | null;
  photo_path: string | null;
  created_at: string;
  updated_at: string;
};

/** Caller-writable columns; business_id/client_id are supplied by the api functions. */
export type PetInput = {
  name: string;
  species?: string | null;
  breed?: string | null;
  birthdate?: string | null;
  feeding_md?: string | null;
  meds_md?: string | null;
  allergies?: string | null;
  reactivity_md?: string | null;
  vet_name?: string | null;
  vet_phone?: string | null;
  vet_address?: string | null;
  photo_path?: string | null;
};
