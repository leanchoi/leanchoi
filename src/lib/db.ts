import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'

const dataDir = process.env.DATA_DIR || path.join(process.cwd(), 'data')
fs.mkdirSync(path.join(dataDir, 'uploads'), { recursive: true })

const db = new Database(path.join(dataDir, 'arrayan.db'))
// varios workers del build/arranque pueden abrir la DB a la vez: esperar el lock
db.pragma('busy_timeout = 10000')
db.pragma('journal_mode = WAL')

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  password TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  avatar TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS bases (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT 'teal',
  icon TEXT NOT NULL DEFAULT '📊',
  owner_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS collaborators (
  id TEXT PRIMARY KEY,
  base_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'editor',
  UNIQUE(base_id, user_id)
);
CREATE TABLE IF NOT EXISTS tables (
  id TEXT PRIMARY KEY,
  base_id TEXT NOT NULL,
  name TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS fields (
  id TEXT PRIMARY KEY,
  table_id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'text',
  options TEXT NOT NULL DEFAULT '{}',
  position INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS records (
  id TEXT PRIMARY KEY,
  table_id TEXT NOT NULL,
  data TEXT NOT NULL DEFAULT '{}',
  position INTEGER NOT NULL DEFAULT 0,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS views (
  id TEXT PRIMARY KEY,
  table_id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'grid',
  config TEXT NOT NULL DEFAULT '{}',
  position INTEGER NOT NULL DEFAULT 0,
  created_by TEXT,
  personal INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  record_id TEXT NOT NULL,
  table_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  actor_id TEXT,
  type TEXT NOT NULL,
  body TEXT NOT NULL,
  link TEXT,
  read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_records_table ON records(table_id);
CREATE INDEX IF NOT EXISTS idx_fields_table ON fields(table_id);
CREATE INDEX IF NOT EXISTS idx_views_table ON views(table_id);
CREATE INDEX IF NOT EXISTS idx_comments_record ON comments(record_id);
CREATE INDEX IF NOT EXISTS idx_notifs_user ON notifications(user_id);
`)

// Migraciones idempotentes: la app debe arrancar con base vieja o vacía
const addCol = (sql: string) => {
  try {
    db.exec(sql)
  } catch {}
}
addCol(`ALTER TABLE views ADD COLUMN personal INTEGER NOT NULL DEFAULT 0`)
addCol(`ALTER TABLE bases ADD COLUMN icon TEXT NOT NULL DEFAULT '📊'`)

export function uid() {
  return crypto.randomBytes(9).toString('base64url')
}

export function now() {
  return new Date().toISOString()
}

export default db
