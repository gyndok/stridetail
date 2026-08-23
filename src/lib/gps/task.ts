import * as TaskManager from 'expo-task-manager';
import type { LocationObject } from 'expo-location';
import { getDb } from '../offline/db';
import { shouldKeep, type Pt } from './geo';

export const GPS_TASK = 'stridetail-visit-location';

type Payload = { locations: LocationObject[] };

export async function ingestLocations(locations: LocationObject[]): Promise<number> {
  const db = getDb();
  const active = await db.getFirstAsync<{ visit_id: string }>(
    'SELECT visit_id FROM active_visit WHERE id = 1',
  );
  if (!active) return 0;
  const last = await db.getFirstAsync<{ t: number; lat: number; lng: number; acc: number | null }>(
    'SELECT t, lat, lng, acc FROM track_points WHERE visit_id = $v ORDER BY seq DESC LIMIT 1',
    { $v: active.visit_id },
  );
  let prev: Pt | undefined = last ? { ...last, acc: last.acc ?? undefined } : undefined;
  let kept = 0;
  for (const l of locations) {
    const pt: Pt = {
      t: l.timestamp,
      lat: l.coords.latitude,
      lng: l.coords.longitude,
      acc: l.coords.accuracy ?? undefined,
    };
    if (!shouldKeep(prev, pt)) continue;
    await db.runAsync(
      'INSERT INTO track_points (visit_id, t, lat, lng, acc) VALUES ($v, $t, $lat, $lng, $acc)',
      { $v: active.visit_id, $t: pt.t, $lat: pt.lat, $lng: pt.lng, $acc: pt.acc ?? null },
    );
    prev = pt;
    kept++;
  }
  return kept;
}

TaskManager.defineTask(GPS_TASK, async ({ data, error }) => {
  if (error) {
    console.warn('[gps] task error', error.message);
    return;
  }
  const { locations } = (data ?? { locations: [] }) as Payload;
  try {
    await ingestLocations(locations);
  } catch (e) {
    console.warn('[gps] ingest failed', e);
  }
});
