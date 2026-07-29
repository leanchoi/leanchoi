/**
 * Datos de prueba para revisar la interfaz con contenido realista.
 * No se usa en producción: sólo para desarrollo y capturas.
 *
 *   DB_DIR=./.devdata node scripts/seed-demo.js
 */
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');

const DB_DIR = process.env.DB_DIR || path.join(process.cwd(), 'data');
const db = new Database(path.join(DB_DIR, 'trello.db'));

const hash = (p) => bcrypt.hashSync(p, 10);

// ── Usuarios ────────────────────────────────────────────────────────────
const gente = [
  ['leandro', 'Leandro Choi', 1, 0],   // admin, con contraseña propia
  ['sofia', 'Sofía Miranda', 0, 1],    // sigue con la default
  ['martin', 'Martín Quiroga', 0, 0],
  ['carla', 'Carla Benítez', 0, 1],
];
for (const [username, display, isAdmin, isDefault] of gente) {
  const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (exists) continue;
  db.prepare(
    'INSERT INTO users (username, display_name, password_hash, is_admin, tenant_id, password_is_default) VALUES (?, ?, ?, ?, 1, ?)'
  ).run(username, display, hash(isDefault ? '123456789' : 'unaClaveLarga2026'), isAdmin, isDefault);
}
const uid = (u) => db.prepare('SELECT id FROM users WHERE username = ?').get(u).id;

// ── Tablero de temporada ────────────────────────────────────────────────
let board = db.prepare("SELECT id FROM boards WHERE title = 'Temporada Alta 2026'").get();
if (!board) {
  const r = db
    .prepare('INSERT INTO boards (title, background, tenant_id, created_by, is_public) VALUES (?, ?, 1, ?, 1)')
    .run('Temporada Alta 2026', '#0d9488', uid('leandro'));
  board = { id: r.lastInsertRowid };
  for (const u of ['leandro', 'sofia', 'martin', 'carla'])
    db.prepare('INSERT OR IGNORE INTO user_boards (user_id, board_id) VALUES (?, ?)').run(uid(u), board.id);

  for (const [name, color] of [['Contenido', '#0ea5e9'], ['Urgente', '#ef4444'], ['Glaciar', '#22d3ee'], ['Trekking', '#84cc16']])
    db.prepare('INSERT INTO board_labels (board_id, name, color) VALUES (?, ?, ?)').run(board.id, name, color);

  const listas = ['Ideas', 'En producción', 'Revisión', 'Publicado'];
  const ids = listas.map((t, i) => {
    const r = db.prepare('INSERT INTO lists (board_id, title, position) VALUES (?, ?, ?)').run(board.id, t, i + 1);
    return r.lastInsertRowid;
  });

  const hoy = new Date();
  const dia = (n) => new Date(hoy.getTime() + n * 86400000).toISOString().slice(0, 10);

  const tarjetas = [
    [0, 'Reel del Glaciar Torrecillas', 'Bajada del sendero + drone sobre el lago. Buscar la luz de las 8 am.', dia(6), 'leandro', ['#22d3ee']],
    [0, 'Guía de alojamientos en Esquel', null, null, 'sofia', ['#0ea5e9']],
    [1, 'Carrusel Parque Nacional Los Alerces', 'Cinco fotos: alerce milenario, muelle, sendero, mirador, atardecer.', dia(1), 'sofia', ['#0ea5e9', '#84cc16']],
    [1, 'Nota de prensa: apertura de temporada', 'Coordinar con la secretaría de turismo.', dia(-2), 'martin', ['#ef4444']],
    [2, 'Video trekking Cerro La Hoya', 'Falta corregir el color del minuto 2.', dia(0), 'carla', ['#84cc16']],
    [2, 'Actualizar tarifario de excursiones', null, dia(3), 'leandro', []],
    [3, 'Campaña Semana Santa', 'Cerrada. Alcance 42k en IG.', null, 'sofia', ['#0ea5e9']],
    [3, 'Fotos de la Trochita', null, null, 'martin', []],
  ];

  for (const [li, title, desc, due, autor, labels] of tarjetas) {
    const maxPos = db.prepare('SELECT COALESCE(MAX(position), 0) m FROM cards WHERE list_id = ?').get(ids[li]).m;
    const r = db
      .prepare('INSERT INTO cards (list_id, title, description, due_date, position, created_by) VALUES (?, ?, ?, ?, ?, ?)')
      .run(ids[li], title, desc, due, maxPos + 1, uid(autor));
    const cardId = r.lastInsertRowid;
    db.prepare('INSERT OR IGNORE INTO card_members (card_id, user_id) VALUES (?, ?)').run(cardId, uid(autor));
    for (const c of labels) {
      const bl = db.prepare('SELECT name FROM board_labels WHERE board_id = ? AND color = ?').get(board.id, c);
      db.prepare('INSERT INTO labels (card_id, color, text) VALUES (?, ?, ?)').run(cardId, c, bl ? bl.name : '');
    }
  }

  // Un checklist con ítems, algunos completados
  const primera = db.prepare('SELECT id FROM cards WHERE list_id = ? ORDER BY position LIMIT 1').get(ids[1]);
  if (primera) {
    const cl = db.prepare('INSERT INTO checklists (card_id, title) VALUES (?, ?)').run(primera.id, 'Producción');
    const items = [
      ['Guion aprobado', 1, 'sofia'],
      ['Sesión de fotos', 1, 'sofia'],
      ['Edición', 0, 'carla'],
      ['Copy final', 0, 'martin'],
    ];
    items.forEach(([txt, done, quien], i) => {
      db.prepare(
        `INSERT INTO checklist_items (checklist_id, text, is_checked, position, created_by, created_at, completed_by, completed_at, assigned_user_id, due_date)
         VALUES (?, ?, ?, ?, ?, datetime('now','-4 days'), ?, ?, ?, ?)`
      ).run(cl.lastInsertRowid, txt, done, i + 1, uid('sofia'),
            done ? uid(quien) : null,
            done ? new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 19).replace('T', ' ') : null,
            uid(quien), i === 2 ? dia(-1) : null);
    });
  }
}

// ── Tiempo online y logueos, para que el resumen diario tenga qué mostrar ──
const hoyArt = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
const minutos = { leandro: 210, sofia: 320, martin: 95, carla: 180 };
for (const [u, min] of Object.entries(minutos)) {
  for (let d = 0; d < 5; d++) {
    const day = new Date(new Date(hoyArt).getTime() - d * 86400000).toISOString().slice(0, 10);
    db.prepare(
      `INSERT INTO online_time (user_id, day, seconds) VALUES (?, ?, ?)
       ON CONFLICT(user_id, day) DO UPDATE SET seconds = excluded.seconds`
    ).run(uid(u), day, Math.round((min / 5) * 60));
    db.prepare("INSERT INTO logins (user_id, created_at) VALUES (?, datetime('now', ?))").run(uid(u), `-${d} days`);
  }
}

console.log('Datos de prueba listos. Entrá como leandro / unaClaveLarga2026 (o sofia / 123456789 para ver el bloqueo).');
db.close();
