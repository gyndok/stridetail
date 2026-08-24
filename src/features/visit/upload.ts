import { supabase } from '@/src/lib/supabase';

/** One GPS point, matching the shape `recompute_visit_distance` filters on. */
export type TrackPoint = { t: number; lat: number; lng: number; acc?: number };

/** One outbox track segment; clientUuid is the server-side idempotency key. */
export type TrackSegment = { segmentNo: number; points: TrackPoint[]; clientUuid: string };

export type IngestResult = { distanceM: number; inserted: number };

/**
 * Push track segments to the ingest-track edge function (walker JWT attached by
 * supabase-js). Replays are safe: the function upserts on client_uuid with
 * ignoreDuplicates, so a re-send inserts nothing and the distance is unchanged.
 */
export async function pushTrackSegments(
  visitId: string,
  segments: TrackSegment[],
): Promise<IngestResult> {
  const { data, error } = await supabase.functions.invoke('ingest-track', {
    body: { visitId, segments },
  });
  if (error) throw error;
  return data as IngestResult;
}

/** Storage path for a visit photo: `business_id/visit_id/<client_uuid>.jpg`. */
export function storageVisitPhotoPath(
  businessId: string,
  visitId: string,
  clientUuid: string,
): string {
  return `${businessId}/${visitId}/${clientUuid}.jpg`;
}

/**
 * Upload a visit photo to the `media` bucket under the visit's prefix — the
 * walker insert policy allows this only while the visit is in_progress. Same
 * RN ArrayBuffer pattern as uploadPetPhoto (fetch the local uri; FormData/Blob
 * uploads are unreliable in RN). Returns the storage path for the event row.
 */
export async function uploadVisitPhoto(
  businessId: string,
  visitId: string,
  clientUuid: string,
  uri: string,
): Promise<string> {
  const response = await fetch(uri);
  const body = await response.arrayBuffer();
  const path = storageVisitPhotoPath(businessId, visitId, clientUuid);
  const { error } = await supabase.storage
    .from('media')
    .upload(path, body, { contentType: 'image/jpeg', upsert: true });
  if (error) throw error;
  return path;
}
