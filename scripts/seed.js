// Seed idempotente: crea las tablas él mismo (no asume que la app ya corrió),
// crea el usuario admin si no existe y una base de ejemplo si la DB está vacía.
const Database = require('better-sqlite3')
const bcrypt = require('bcryptjs')
const path = require('path')
const fs = require('fs')
const crypto = require('crypto')

const dataDir = process.env.DATA_DIR || path.join(process.cwd(), 'data')
fs.mkdirSync(path.join(dataDir, 'uploads'), { recursive: true })
const db = new Database(path.join(dataDir, 'arrayan.db'))
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
`)

const uid = () => crypto.randomBytes(9).toString('base64url')

// --- Admin ---
let admin = db.prepare(`SELECT * FROM users WHERE username = 'admin' COLLATE NOCASE`).get()
if (!admin) {
  const id = uid()
  db.prepare('INSERT INTO users (id, username, name, password, role) VALUES (?, ?, ?, ?, ?)').run(
    id,
    'admin',
    'Administrador',
    bcrypt.hashSync('arrayan2026', 10),
    'admin'
  )
  admin = { id }
  console.log('✔ Usuario admin creado (admin / arrayan2026)')
} else {
  console.log('· Usuario admin ya existe')
}

// --- Base de ejemplo (solo si no hay ninguna base) ---
const baseCount = db.prepare('SELECT COUNT(*) AS c FROM bases').get()
if (baseCount.c === 0) {
  const baseId = uid()
  const tableId = uid()
  db.prepare('INSERT INTO bases (id, name, color, icon, owner_id) VALUES (?, ?, ?, ?, ?)').run(
    baseId,
    'Demo · Gestión de proyectos',
    'teal',
    '🎯',
    admin.id
  )
  db.prepare('INSERT INTO tables (id, base_id, name, position) VALUES (?, ?, ?, 0)').run(
    tableId,
    baseId,
    'Tareas'
  )

  const fNombre = uid()
  const fEstado = uid()
  const fResp = uid()
  const fInicio = uid()
  const fFecha = uid()
  const fPrio = uid()
  const fNotas = uid()
  const insField = db.prepare(
    'INSERT INTO fields (id, table_id, name, type, options, position) VALUES (?, ?, ?, ?, ?, ?)'
  )
  insField.run(fNombre, tableId, 'Nombre', 'text', '{}', 0)
  insField.run(
    fEstado,
    tableId,
    'Estado',
    'select',
    JSON.stringify({
      choices: [
        { id: 'c1', name: 'Pendiente', color: 'orange' },
        { id: 'c2', name: 'En curso', color: 'blue' },
        { id: 'c3', name: 'Hecho', color: 'green' },
      ],
    }),
    1
  )
  insField.run(fResp, tableId, 'Responsable', 'user', JSON.stringify({ multiple: true }), 2)
  insField.run(fInicio, tableId, 'Inicio', 'date', '{}', 3)
  insField.run(fFecha, tableId, 'Fecha límite', 'date', '{}', 4)
  insField.run(fPrio, tableId, 'Prioridad', 'rating', JSON.stringify({ max: 5 }), 5)
  insField.run(fNotas, tableId, 'Notas', 'longtext', '{}', 6)

  const insView = db.prepare(
    'INSERT INTO views (id, table_id, name, type, config, position, created_by, personal) VALUES (?, ?, ?, ?, ?, ?, ?, 0)'
  )
  insView.run(uid(), tableId, 'Vista principal', 'grid', '{}', 0, admin.id)
  insView.run(uid(), tableId, 'Tablero', 'kanban', JSON.stringify({ stackBy: fEstado }), 1, admin.id)
  insView.run(uid(), tableId, 'Calendario', 'calendar', JSON.stringify({ dateField: fFecha }), 2, admin.id)
  insView.run(uid(), tableId, 'Cronograma', 'gantt', JSON.stringify({ startField: fInicio, endField: fFecha }), 3, admin.id)

  const today = new Date()
  const day = (offset) => {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate()
    ).padStart(2, '0')}`
  }
  const insRec = db.prepare(
    "INSERT INTO records (id, table_id, data, position, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))"
  )
  const demo = [
    ['Definir alcance del proyecto', 'Hecho', day(-6), day(-3), 5, 'Reunión inicial lista.'],
    ['Armar presupuesto', 'En curso', day(-2), day(1), 4, 'Falta cotización de proveedores.'],
    ['Diseñar la propuesta', 'En curso', day(0), day(3), 3, ''],
    ['Enviar propuesta al cliente', 'Pendiente', day(4), day(6), 5, 'Esperar OK del presupuesto.'],
    ['Coordinar reunión de cierre', 'Pendiente', day(8), day(10), 2, ''],
  ]
  demo.forEach(([nombre, estado, inicio, fecha, prio, notas], i) => {
    insRec.run(
      uid(),
      tableId,
      JSON.stringify({
        [fNombre]: nombre,
        [fEstado]: estado,
        [fResp]: [admin.id],
        [fInicio]: inicio,
        [fFecha]: fecha,
        [fPrio]: prio,
        [fNotas]: notas,
      }),
      i,
      admin.id
    )
  })
  console.log('✔ Base de ejemplo creada')
} else {
  console.log('· Ya hay bases, no se crea la demo')
}

console.log('Seed OK')
