import * as SQLite from 'expo-sqlite';

let db: SQLite.SQLiteDatabase | null = null;

export const LOCAL_SCHEMA = `
PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS outbox (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  state TEXT NOT NULL DEFAULT 'pending'
);
CREATE INDEX IF NOT EXISTS outbox_pending ON outbox(state, created_at);
CREATE TABLE IF NOT EXISTS track_points (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  visit_id TEXT NOT NULL,
  t INTEGER NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  acc REAL,
  rolled INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS track_points_visit ON track_points(visit_id, rolled, seq);
CREATE TABLE IF NOT EXISTS active_visit (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  visit_id TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  requires_gps INTEGER NOT NULL
);
-- Legacy 'failed' rows (terminal after ten retries, pre review fix #2) are
-- restored to the queue on every open; nothing writes 'failed' anymore.
UPDATE outbox SET state = 'pending' WHERE state = 'failed';
`;

export function getDb(): SQLite.SQLiteDatabase {
  if (!db) {
    db = SQLite.openDatabaseSync('stridetail.db');
    db.execSync(LOCAL_SCHEMA);
  }
  return db;
}
