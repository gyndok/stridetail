import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { getDb } from '../offline/db';
import { SqliteOutbox, type OutboxStore } from '../offline/outbox';
import { tokens } from '../../ui/tokens';
import { GPS_TASK } from './task';
import type { Pt } from './geo';

export interface PointStore {
  append(visitId: string, pt: Pt): Promise<void>;
  unrolled(visitId: string): Promise<{ seq: number; pt: Pt }[]>;
  markRolled(seqs: number[]): Promise<void>;
  all(visitId: string): Promise<Pt[]>;
}

export class MemoryPointStore implements PointStore {
  private rows: { seq: number; visitId: string; pt: Pt; rolled: boolean }[] = [];
  async append(visitId: string, pt: Pt) {
    this.rows.push({ seq: this.rows.length + 1, visitId, pt, rolled: false });
  }
  async unrolled(visitId: string) {
    return this.rows
      .filter((r) => r.visitId === visitId && !r.rolled)
      .map((r) => ({ seq: r.seq, pt: r.pt }));
  }
  async markRolled(seqs: number[]) {
    for (const r of this.rows) if (seqs.includes(r.seq)) r.rolled = true;
  }
  async all(visitId: string) {
    return this.rows.filter((r) => r.visitId === visitId).map((r) => r.pt);
  }
}

type PointRow = { seq: number; t: number; lat: number; lng: number; acc: number | null };

export class SqlitePointStore implements PointStore {
  constructor(private db = getDb()) {}
  async append(visitId: string, pt: Pt) {
    await this.db.runAsync(
      'INSERT INTO track_points (visit_id, t, lat, lng, acc) VALUES ($v,$t,$lat,$lng,$acc)',
      { $v: visitId, $t: pt.t, $lat: pt.lat, $lng: pt.lng, $acc: pt.acc ?? null },
    );
  }
  async unrolled(visitId: string) {
    const rows = await this.db.getAllAsync<PointRow>(
      'SELECT seq, t, lat, lng, acc FROM track_points WHERE visit_id = $v AND rolled = 0 ORDER BY seq',
      { $v: visitId },
    );
    return rows.map((r) => ({
      seq: r.seq,
      pt: { t: r.t, lat: r.lat, lng: r.lng, acc: r.acc ?? undefined },
    }));
  }
  async markRolled(seqs: number[]) {
    if (!seqs.length) return;
    await this.db.runAsync(`UPDATE track_points SET rolled = 1 WHERE seq IN (${seqs.join(',')})`);
  }
  async all(visitId: string) {
    const rows = await this.db.getAllAsync<Omit<PointRow, 'seq'>>(
      'SELECT t, lat, lng, acc FROM track_points WHERE visit_id = $v ORDER BY seq',
      { $v: visitId },
    );
    return rows.map((r) => ({ t: r.t, lat: r.lat, lng: r.lng, acc: r.acc ?? undefined }));
  }
}

let segmentCounter = 0;

export async function rollSegmentWith(
  visitId: string,
  points: PointStore,
  outbox: OutboxStore,
): Promise<number> {
  const rows = await points.unrolled(visitId);
  if (!rows.length) return 0;
  segmentCounter += 1;
  await outbox.enqueue('visit.track', {
    visitId,
    segmentNo: segmentCounter,
    points: rows.map((r) => r.pt),
  });
  await points.markRolled(rows.map((r) => r.seq));
  return rows.length;
}

export const rollSegment = (visitId: string) =>
  rollSegmentWith(visitId, new SqlitePointStore(), new SqliteOutbox(getDb()));
export const getLocalTrack = (visitId: string) => new SqlitePointStore().all(visitId);

const ROLL_INTERVAL_MS = 60_000;
let rollTimer: ReturnType<typeof setInterval> | null = null;

function ensureRollTimer(visitId: string) {
  if (rollTimer) return;
  rollTimer = setInterval(() => {
    void rollSegment(visitId);
  }, ROLL_INTERVAL_MS);
}

async function ensurePermissions() {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== 'granted') {
    throw new Error('Location permission (while using) is required to record a visit.');
  }
  const bg = await Location.requestBackgroundPermissionsAsync();
  if (bg.status !== 'granted') {
    throw new Error('Allow location "Always" so the route keeps recording when the screen is off.');
  }
}

export async function startVisitTracking(visitId: string) {
  await ensurePermissions();
  const db = getDb();
  await db.runAsync(
    'INSERT OR REPLACE INTO active_visit (id, visit_id, started_at, requires_gps) VALUES (1, $v, $t, 1)',
    { $v: visitId, $t: Date.now() },
  );
  if (!(await Location.hasStartedLocationUpdatesAsync(GPS_TASK))) {
    await Location.startLocationUpdatesAsync(GPS_TASK, {
      accuracy: Location.Accuracy.High,
      timeInterval: 5000,
      distanceInterval: 10,
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: 'Visit in progress',
        notificationBody: 'Recording your route',
        notificationColor: tokens.colors.primary,
      },
    });
  }
  ensureRollTimer(visitId);
}

export async function stopVisitTracking() {
  const db = getDb();
  const active = await db.getFirstAsync<{ visit_id: string }>(
    'SELECT visit_id FROM active_visit WHERE id = 1',
  );
  if (rollTimer) {
    clearInterval(rollTimer);
    rollTimer = null;
  }
  if (await Location.hasStartedLocationUpdatesAsync(GPS_TASK)) {
    await Location.stopLocationUpdatesAsync(GPS_TASK);
  }
  if (active) await rollSegment(active.visit_id);
  await db.runAsync('DELETE FROM active_visit WHERE id = 1');
}

export async function recoverActiveVisit(): Promise<{ visitId: string } | null> {
  const active = await getDb().getFirstAsync<{ visit_id: string }>(
    'SELECT visit_id FROM active_visit WHERE id = 1',
  );
  if (!active) return null;
  const registered = await TaskManager.isTaskRegisteredAsync(GPS_TASK);
  if (!registered) await startVisitTracking(active.visit_id);
  else ensureRollTimer(active.visit_id);
  return { visitId: active.visit_id };
}
