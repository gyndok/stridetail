import type { SQLiteDatabase } from 'expo-sqlite';
import * as Crypto from 'expo-crypto';

export type OutboxKind = 'visit.start' | 'visit.event' | 'visit.track' | 'visit.finish';
/**
 * 'failed' = gave up after MAX_ATTEMPTS retryable failures;
 * 'error'  = parked by the sync worker on a permanent (non-retryable) server
 *            rejection — kept for surfacing in the UI, never retried.
 */
export type OutboxState = 'pending' | 'sent' | 'failed' | 'error';
export type OutboxItem = {
  id: string;
  kind: OutboxKind;
  payload: unknown;
  createdAt: number;
  attempts: number;
  state: OutboxState;
};

export const MAX_ATTEMPTS = 10;

export interface OutboxStore {
  enqueue(kind: OutboxKind, payload: unknown, id?: string): Promise<OutboxItem>;
  nextPending(limit?: number): Promise<OutboxItem[]>;
  markSent(id: string): Promise<void>;
  markFailed(id: string): Promise<void>;
  markError(id: string): Promise<void>;
  /** With visitId: only items whose payload targets that visit (sync badge). */
  countPending(visitId?: string): Promise<number>;
  countErrors(): Promise<number>;
  /**
   * Remove a still-pending visit.event by its payload clientUuid (event
   * deletion, wish list #2). True = the item was pending and is gone (the
   * server never saw it); false = not found or already past 'pending' — the
   * caller must delete the server row instead.
   */
  removePendingEvent(clientUuid: string): Promise<boolean>;
}

export class MemoryOutbox implements OutboxStore {
  private items = new Map<string, OutboxItem>();
  constructor(public now: () => number = () => Date.now()) {}

  async enqueue(kind: OutboxKind, payload: unknown, id = Crypto.randomUUID()) {
    const item: OutboxItem = { id, kind, payload, createdAt: this.now(), attempts: 0, state: 'pending' };
    this.items.set(id, item);
    return item;
  }
  async nextPending(limit = 50) {
    return [...this.items.values()]
      .filter((i) => i.state === 'pending')
      .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
      .slice(0, limit);
  }
  async markSent(id: string) {
    const i = this.items.get(id);
    if (i) i.state = 'sent';
  }
  async markFailed(id: string) {
    const i = this.items.get(id);
    if (!i) return;
    i.attempts += 1;
    if (i.attempts >= MAX_ATTEMPTS) i.state = 'failed';
  }
  async markError(id: string) {
    const i = this.items.get(id);
    if (i) i.state = 'error';
  }
  async countPending(visitId?: string) {
    const pending = await this.nextPending(Number.MAX_SAFE_INTEGER);
    if (visitId === undefined) return pending.length;
    return pending.filter((i) => (i.payload as { visitId?: string } | null)?.visitId === visitId)
      .length;
  }
  async countErrors() {
    return [...this.items.values()].filter((i) => i.state === 'error').length;
  }
  async removePendingEvent(clientUuid: string) {
    for (const [id, item] of this.items) {
      if (
        item.kind === 'visit.event' &&
        item.state === 'pending' &&
        (item.payload as { clientUuid?: string } | null)?.clientUuid === clientUuid
      ) {
        this.items.delete(id);
        return true;
      }
    }
    return false;
  }
}

type Row = {
  id: string;
  kind: OutboxKind;
  payload: string;
  created_at: number;
  attempts: number;
  state: OutboxState;
};

export class SqliteOutbox implements OutboxStore {
  constructor(
    private db: SQLiteDatabase,
    private now: () => number = () => Date.now(),
  ) {}

  async enqueue(kind: OutboxKind, payload: unknown, id = Crypto.randomUUID()) {
    const createdAt = this.now();
    await this.db.runAsync(
      'INSERT OR IGNORE INTO outbox (id, kind, payload, created_at) VALUES ($id, $kind, $payload, $createdAt)',
      { $id: id, $kind: kind, $payload: JSON.stringify(payload), $createdAt: createdAt },
    );
    return { id, kind, payload, createdAt, attempts: 0, state: 'pending' as const };
  }
  async nextPending(limit = 50) {
    const rows = await this.db.getAllAsync<Row>(
      "SELECT * FROM outbox WHERE state = 'pending' ORDER BY created_at, id LIMIT $limit",
      { $limit: limit },
    );
    return rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      payload: JSON.parse(r.payload) as unknown,
      createdAt: r.created_at,
      attempts: r.attempts,
      state: r.state,
    }));
  }
  async markSent(id: string) {
    await this.db.runAsync("UPDATE outbox SET state = 'sent' WHERE id = $id", { $id: id });
  }
  async markFailed(id: string) {
    await this.db.runAsync(
      `UPDATE outbox SET attempts = attempts + 1,
         state = CASE WHEN attempts + 1 >= $max THEN 'failed' ELSE state END WHERE id = $id`,
      { $id: id, $max: MAX_ATTEMPTS },
    );
  }
  async markError(id: string) {
    await this.db.runAsync("UPDATE outbox SET state = 'error' WHERE id = $id", { $id: id });
  }
  async countPending(visitId?: string) {
    if (visitId === undefined) {
      const r = await this.db.getFirstAsync<{ n: number }>(
        "SELECT COUNT(*) AS n FROM outbox WHERE state = 'pending'",
      );
      return r?.n ?? 0;
    }
    // Payloads are JSON.stringify output, so the visit id appears exactly as
    // "visitId":"<uuid>" — a LIKE match is cheap and index-free but the outbox
    // is tiny (it drains continuously).
    const r = await this.db.getFirstAsync<{ n: number }>(
      "SELECT COUNT(*) AS n FROM outbox WHERE state = 'pending' AND payload LIKE $p",
      { $p: `%"visitId":"${visitId}"%` },
    );
    return r?.n ?? 0;
  }
  async countErrors() {
    const r = await this.db.getFirstAsync<{ n: number }>(
      "SELECT COUNT(*) AS n FROM outbox WHERE state = 'error'",
    );
    return r?.n ?? 0;
  }
  async removePendingEvent(clientUuid: string) {
    // Same JSON.stringify-shape LIKE trick as countPending — the uuid appears
    // exactly as "clientUuid":"<uuid>" in the stored payload.
    const r = await this.db.runAsync(
      "DELETE FROM outbox WHERE state = 'pending' AND kind = 'visit.event' AND payload LIKE $p",
      { $p: `%"clientUuid":"${clientUuid}"%` },
    );
    return r.changes > 0;
  }
}
