import { randomUUID } from 'expo-crypto';

import { supabase } from '@/src/lib/supabase';

import { parseDateOnly } from './helpers';

/** Mirrors public.doc_type (supabase/migrations/20260824000001_clients_pets.sql). */
export const DOC_TYPES = ['rabies', 'dhpp', 'lepto', 'bordetella', 'fvrcp', 'other'] as const;
export type DocType = (typeof DOC_TYPES)[number];

/** Mirrors public.pet_documents. */
export type PetDocument = {
  id: string;
  pet_id: string;
  business_id: string;
  type: DocType;
  storage_path: string;
  expires_on: string | null; // date column → 'YYYY-MM-DD'
  created_at: string;
  updated_at: string;
};

const LABELS: Record<DocType, string> = {
  rabies: 'Rabies',
  dhpp: 'DHPP',
  lepto: 'Leptospirosis',
  bordetella: 'Bordetella',
  fvrcp: 'FVRCP (feline)',
  other: 'Other',
};

export function docTypeLabel(type: DocType): string {
  return LABELS[type];
}

export type ExpiryState = 'expired' | 'warning' | 'ok' | 'none';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Badge state for a document expiry date — display only, computed on the
 * device's local calendar day (per plan: device tz for display).
 * 'expired' strictly before today; 'warning' from today up to 29 days out;
 * 'ok' from 30 days; 'none' when unset or malformed.
 */
export function expiryState(
  expiresOn: string | null | undefined,
  now: Date = new Date(),
): ExpiryState {
  if (!expiresOn) return 'none';
  const p = parseDateOnly(expiresOn);
  if (!p) return 'none';
  const expires = new Date(p.y, p.m - 1, p.d);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round((expires.getTime() - today.getTime()) / MS_PER_DAY);
  if (diffDays < 0) return 'expired';
  if (diffDays < 30) return 'warning';
  return 'ok';
}

/** Object path in the `media` bucket; first segment must be the business id (storage RLS). */
export function storagePetDocPath(businessId: string, petId: string, ext: string): string {
  return `${businessId}/pets/${petId}/docs/${randomUUID()}.${ext}`;
}

/** A locally picked file: a camera/library image or a PDF from the document picker. */
export type PickedDocSource = { uri: string; kind: 'image' | 'pdf' };

export async function listDocuments(businessId: string, petId: string): Promise<PetDocument[]> {
  const { data, error } = await supabase
    .from('pet_documents')
    .select('*')
    .eq('business_id', businessId)
    .eq('pet_id', petId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as PetDocument[];
}

/**
 * Upload the picked file to the tenant-scoped docs path, then record the row.
 * RN supabase-js pattern: fetch the local uri and upload its ArrayBuffer.
 */
export async function addDocument(args: {
  businessId: string;
  petId: string;
  type: DocType;
  expiresOn: string | null;
  source: PickedDocSource;
}): Promise<PetDocument> {
  const { businessId, petId, type, expiresOn, source } = args;
  const ext = source.kind === 'pdf' ? 'pdf' : 'jpg';
  const contentType = source.kind === 'pdf' ? 'application/pdf' : 'image/jpeg';
  const path = storagePetDocPath(businessId, petId, ext);

  const response = await fetch(source.uri);
  const body = await response.arrayBuffer();
  const { error: uploadError } = await supabase.storage
    .from('media')
    .upload(path, body, { contentType });
  if (uploadError) throw uploadError;

  const { data, error } = await supabase
    .from('pet_documents')
    .insert({
      pet_id: petId,
      business_id: businessId,
      type,
      storage_path: path,
      expires_on: expiresOn,
    })
    .select()
    .single();
  if (error) throw error;
  return data as unknown as PetDocument;
}

/** Delete the row (authorization happens here via RLS) then the stored object. */
export async function deleteDocument(
  businessId: string,
  doc: Pick<PetDocument, 'id' | 'storage_path'>,
): Promise<void> {
  const { error } = await supabase
    .from('pet_documents')
    .delete()
    .eq('business_id', businessId)
    .eq('id', doc.id);
  if (error) throw error;
  const { error: removeError } = await supabase.storage.from('media').remove([doc.storage_path]);
  if (removeError) throw removeError;
}

/** Signed url (1 hour) for a stored document; the `media` bucket is private. */
export async function signedDocumentUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from('media').createSignedUrl(path, 3600);
  if (error) throw error;
  return data.signedUrl;
}
