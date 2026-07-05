import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

const DB_DIR = process.env.DB_DIR || path.join(process.cwd(), 'data');
const DB_PATH = path.join(DB_DIR, 'trello.db');

if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('busy_timeout = 10000');
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    is_admin INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS boards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    background TEXT DEFAULT '#0079bf',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS user_boards (
    user_id INTEGER NOT NULL,
    board_id INTEGER NOT NULL,
    PRIMARY KEY (user_id, board_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS lists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    board_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    position REAL NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    list_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    due_date TEXT,
    position REAL NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (list_id) REFERENCES lists(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS labels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    card_id INTEGER NOT NULL,
    color TEXT NOT NULL,
    text TEXT,
    FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS checklists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    card_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS checklist_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    checklist_id INTEGER NOT NULL,
    text TEXT NOT NULL,
    is_checked INTEGER DEFAULT 0,
    position REAL DEFAULT 0,
    FOREIGN KEY (checklist_id) REFERENCES checklists(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    card_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    text TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS card_members (
    card_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    PRIMARY KEY (card_id, user_id),
    FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS attachments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    card_id INTEGER NOT NULL,
    filename TEXT NOT NULL,
    stored_name TEXT NOT NULL,
    size INTEGER NOT NULL,
    mime TEXT,
    uploaded_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS board_labels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    board_id INTEGER NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    color TEXT NOT NULL,
    FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    text TEXT NOT NULL,
    board_id INTEGER,
    card_id INTEGER,
    is_read INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS logins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS online_time (
    user_id INTEGER NOT NULL,
    day TEXT NOT NULL,
    seconds INTEGER DEFAULT 0,
    PRIMARY KEY (user_id, day),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS weekly_awards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    week_start TEXT NOT NULL,
    user_id INTEGER NOT NULL,
    position INTEGER NOT NULL,
    points INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

export const UPLOADS_DIR = path.join(DB_DIR, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// ── Módulo Arrayán (bases estilo Airtable) ──────────────────────────────
// Las entidades usan ids de texto; las referencias a usuarios son INTEGER
// (ids de la tabla users de Trochi).
db.exec(`
  CREATE TABLE IF NOT EXISTS bases (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT 'teal',
    icon TEXT NOT NULL DEFAULT '📊',
    owner_id INTEGER NOT NULL,
    tenant_id INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS base_collaborators (
    id TEXT PRIMARY KEY,
    base_id TEXT NOT NULL,
    user_id INTEGER NOT NULL,
    role TEXT NOT NULL DEFAULT 'editor',
    UNIQUE(base_id, user_id)
  );
  CREATE TABLE IF NOT EXISTS base_tables (
    id TEXT PRIMARY KEY,
    base_id TEXT NOT NULL,
    name TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS base_fields (
    id TEXT PRIMARY KEY,
    table_id TEXT NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'text',
    options TEXT NOT NULL DEFAULT '{}',
    position INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS base_records (
    id TEXT PRIMARY KEY,
    table_id TEXT NOT NULL,
    data TEXT NOT NULL DEFAULT '{}',
    position INTEGER NOT NULL DEFAULT 0,
    created_by INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS base_views (
    id TEXT PRIMARY KEY,
    table_id TEXT NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'grid',
    config TEXT NOT NULL DEFAULT '{}',
    position INTEGER NOT NULL DEFAULT 0,
    created_by INTEGER,
    personal INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS record_comments (
    id TEXT PRIMARY KEY,
    record_id TEXT NOT NULL,
    table_id TEXT NOT NULL,
    user_id INTEGER NOT NULL,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_base_records_table ON base_records(table_id);
  CREATE INDEX IF NOT EXISTS idx_base_fields_table ON base_fields(table_id);
  CREATE INDEX IF NOT EXISTS idx_base_views_table ON base_views(table_id);
  CREATE INDEX IF NOT EXISTS idx_record_comments_record ON record_comments(record_id);
`);

// ── Ramas (tenants) para el Admin Master ────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS tenants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    max_users INTEGER NOT NULL DEFAULT 10,
    storage_mb INTEGER NOT NULL DEFAULT 500,
    expires_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS storage_files (
    id TEXT PRIMARY KEY,
    tenant_id INTEGER NOT NULL,
    user_id INTEGER,
    ref TEXT,
    size INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Migrations: add columns if they don't exist yet
try { db.exec('ALTER TABLE checklist_items ADD COLUMN due_date TEXT'); } catch {}
try { db.exec('ALTER TABLE checklist_items ADD COLUMN assigned_user_id INTEGER'); } catch {}
try { db.exec('ALTER TABLE cards ADD COLUMN cover_attachment_id INTEGER'); } catch {}
try { db.exec('ALTER TABLE checklists ADD COLUMN parent_item_id INTEGER'); } catch {}
try { db.exec('ALTER TABLE cards ADD COLUMN created_by INTEGER'); } catch {}
try { db.exec('ALTER TABLE checklist_items ADD COLUMN created_by INTEGER'); } catch {}
try { db.exec('ALTER TABLE checklist_items ADD COLUMN created_at TEXT'); } catch {}
try { db.exec('ALTER TABLE checklist_items ADD COLUMN completed_by INTEGER'); } catch {}
try { db.exec('ALTER TABLE checklist_items ADD COLUMN completed_at TEXT'); } catch {}
try { db.exec('ALTER TABLE boards ADD COLUMN is_public INTEGER DEFAULT 0'); } catch {}
try { db.exec('ALTER TABLE users ADD COLUMN avatar TEXT'); } catch {}
try { db.exec('ALTER TABLE attachments ADD COLUMN comment_id INTEGER'); } catch {}

// Migraciones de la fusión Arrayán + ramas (idempotentes)
try { db.exec('ALTER TABLE notifications ADD COLUMN link TEXT'); } catch {}
try { db.exec('ALTER TABLE users ADD COLUMN tenant_id INTEGER NOT NULL DEFAULT 1'); } catch {}
try { db.exec('ALTER TABLE users ADD COLUMN is_master INTEGER NOT NULL DEFAULT 0'); } catch {}
try { db.exec('ALTER TABLE boards ADD COLUMN tenant_id INTEGER NOT NULL DEFAULT 1'); } catch {}

// La rama Principal (id 1) siempre existe; los usuarios preexistentes caen ahí
// y los admins históricos pasan a ser Admin Master.
try {
  const principal = db.prepare('SELECT id FROM tenants WHERE id = 1').get();
  if (!principal) {
    db.prepare(
      "INSERT INTO tenants (id, name, max_users, storage_mb, expires_at) VALUES (1, 'Principal', 999, 100000, NULL)"
    ).run();
    db.exec('UPDATE users SET is_master = 1 WHERE is_admin = 1');
  }
} catch {}

export function notify(userId: number, type: string, text: string, boardId?: number | null, cardId?: number | null, link?: string | null) {
  db.prepare('INSERT INTO notifications (user_id, type, text, board_id, card_id, link) VALUES (?, ?, ?, ?, ?, ?)')
    .run(userId, type, text, boardId ?? null, cardId ?? null, link ?? null);
}

// Ids de texto para las entidades del módulo Arrayán
export function uid() {
  return crypto.randomBytes(9).toString('base64url');
}
export function now() {
  return new Date().toISOString();
}

export function boardIdOfCard(cardId: number | string): number | null {
  const row = db.prepare('SELECT li.board_id as bid FROM cards c JOIN lists li ON c.list_id = li.id WHERE c.id = ?').get(cardId) as any;
  return row?.bid ?? null;
}

export default db;
