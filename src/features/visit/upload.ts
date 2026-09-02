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

export type VisitMediaKind = 'photo' | 'video';

/**
 * Storage path for visit media: `business_id/visit_id/<client_uuid>.<ext>`.
 * Photos are always jpg; a video keeps its recorded container (iOS camera
 * hands back .mov, Android .mp4) so playback matches the bytes.
 */
export function storageVisitMediaPath(
  businessId: string,
  visitId: string,
  clientUuid: string,
  kind: VisitMediaKind = 'photo',
  uri = '',
): string {
  const ext = kind === 'photo' ? 'jpg' : /\.mov$/i.test(uri) ? 'mov' : 'mp4';
  return `${businessId}/${visitId}/${clientUuid}.${ext}`;
}

export function visitMediaContentType(kind: VisitMediaKind, uri = ''): string {
  if (kind === 'photo') return 'image/jpeg';
  return /\.mov$/i.test(uri) ? 'video/quicktime' : 'video/mp4';
}

/**
 * Upload visit media (photo or ≤10s video, wish list #7) to the `media`
 * bucket under the visit's prefix — the walker insert policy allows this only
 * while the visit is in_progress. Same RN ArrayBuffer pattern as
 * uploadPetPhoto (fetch the local uri; FormData/Blob uploads are unreliable
 * in RN). Returns the storage path for the event row.
 */
export async function uploadVisitMedia(
  businessId: string,
  visitId: string,
  clientUuid: string,
  uri: string,
  kind: VisitMediaKind = 'photo',
): Promise<string> {
  const response = await fetch(uri);
  const body = await response.arrayBuffer();
  const path = storageVisitMediaPath(businessId, visitId, clientUuid, kind, uri);
  const { error } = await supabase.storage
    .from('media')
    .upload(path, body, { contentType: visitMediaContentType(kind, uri), upsert: true });
  if (error) throw error;
  return path;
}
