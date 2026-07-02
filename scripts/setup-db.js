const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const DB_DIR = process.env.DB_DIR || path.join(process.cwd(), 'data');
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

const db = new Database(path.join(DB_DIR, 'trello.db'));
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
`);

const existingAdmin = db.prepare("SELECT id FROM users WHERE username = 'admin'").get();
if (!existingAdmin) {
  const hash = bcrypt.hashSync('admin123', 10);
  db.prepare("INSERT INTO users (username, display_name, password_hash, is_admin) VALUES (?, ?, ?, 1)")
    .run('admin', 'Administrador', hash);
  console.log('✅ Admin creado: usuario=admin, contraseña=admin123');
  console.log('⚠️  Cambiá la contraseña desde el panel de admin después del primer login.');
} else {
  console.log('ℹ️  El usuario admin ya existe, no se realizaron cambios.');
}

db.close();
