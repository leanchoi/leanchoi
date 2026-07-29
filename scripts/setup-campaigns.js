const Database = require('better-sqlite3');
const path = require('path');

const DB_DIR = process.env.DB_DIR || '/var/lib/docker/volumes/leanboard_leanboard-data/_data';
const db = new Database(path.join(DB_DIR, 'trello.db'));
db.pragma('foreign_keys = ON');

console.log('🔄 Iniciando configuración de la tabla de Campañas y relaciones...');

try {
  // 1. Crear tabla de Campañas en la base de datos trello.db si no existe
  const tableExists = db.prepare("SELECT 1 FROM base_tables WHERE id = 'table_campanas'").get();
  if (!tableExists) {
    db.prepare("INSERT INTO base_tables (id, base_id, name, position) VALUES ('table_campanas', '35JZzATXWukh', 'CAMPAÑAS', 1)").run();
    console.log('✅ Tabla CAMPAÑAS creada en la base de datos.');
  }

  // 2. Crear campos de la tabla Campañas
  const fields = [
    { id: 'c_name', name: 'Nombre de Campaña', type: 'text', position: 0, options: '{}' },
    { id: 'c_status', name: 'Estado', type: 'select', position: 1, options: JSON.stringify({
        choices: [
          { id: 'c_status_plan', name: 'Planificada', color: 'blue' },
          { id: 'c_status_prog', name: 'En progreso', color: 'orange' },
          { id: 'c_status_fin', name: 'Finalizada', color: 'green' }
        ]
      })
    },
    { id: 'c_start', name: 'Fecha Inicio', type: 'date', position: 2, options: '{}' },
    { id: 'c_end', name: 'Fecha Fin', type: 'date', position: 3, options: '{}' },
    { id: 'c_goal', name: 'Objetivo', type: 'longtext', position: 4, options: '{}' }
  ];

  for (const f of fields) {
    const exists = db.prepare("SELECT 1 FROM base_fields WHERE id = ?").get(f.id);
    if (!exists) {
      db.prepare("INSERT INTO base_fields (id, table_id, name, type, options, position) VALUES (?, 'table_campanas', ?, ?, ?, ?)").run(
        f.id, f.name, f.type, f.options, f.position
      );
      console.log(`✅ Campo '${f.name}' agregado a CAMPAÑAS.`);
    }
  }

  // 3. Crear registros iniciales en Campañas
  const recordsExist = db.prepare("SELECT 1 FROM base_records WHERE table_id = 'table_campanas'").get();
  if (!recordsExist) {
    const records = [
      {
        id: 'rec_camp_invierno',
        data: {
          c_name: 'Temporada Alta de Invierno 2026 ❄️',
          c_status: 'En progreso',
          c_start: '2026-06-01',
          c_end: '2026-09-30',
          c_goal: 'Promocionar las pistas de esquí en La Hoya, la gastronomía de montaña y los paseos invernales en Esquel para atraer turistas nacionales y regionales.'
        },
        position: 0
      },
      {
        id: 'rec_camp_primavera',
        data: {
          c_name: 'Primavera & Aventura en Esquel 🌿',
          c_status: 'Planificada',
          c_start: '2026-09-21',
          c_end: '2026-12-21',
          c_goal: 'Fomentar el senderismo, el turismo aventura (canopy, rafting, cabalgatas) y las visitas al Parque Nacional Los Alerces durante la primavera.'
        },
        position: 1
      },
      {
        id: 'rec_camp_comunidad',
        data: {
          c_name: 'Efemérides y Comunidad 2026 📅',
          c_status: 'En progreso',
          c_start: '2026-01-01',
          c_end: '2026-12-31',
          c_goal: 'Conectar con fechas especiales de turismo, promover conciencia ambiental y potenciar la comunidad compartiendo fotos de turistas en Esquel.'
        },
        position: 2
      }
    ];

    for (const r of records) {
      db.prepare("INSERT INTO base_records (id, table_id, data, position, created_by) VALUES (?, 'table_campanas', ?, ?, 1)").run(
        r.id, JSON.stringify(r.data), r.position
      );
    }
    console.log('✅ Registros iniciales agregados a la tabla CAMPAÑAS.');
  }

  // 4. Crear campo de vínculo (Link) en la tabla PUBLICACIONES que apunte a CAMPAÑAS
  const linkFieldExists = db.prepare("SELECT 1 FROM base_fields WHERE id = 'link_campana'").get();
  if (!linkFieldExists) {
    db.prepare("INSERT INTO base_fields (id, table_id, name, type, options, position) VALUES ('link_campana', 'lJqfw81iX7eM', 'Campaña Relacionada', 'link', ?, 12)").run(
      JSON.stringify({ tableId: 'table_campanas' })
    );
    console.log("✅ Campo relacional 'Campaña Relacionada' agregado a la tabla PUBLICACIONES.");
  }

  // 5. Vincular registros existentes de PUBLICACIONES con campañas
  console.log('🔄 Vinculando publicaciones existentes...');
  const recordsToUpdate = db.prepare("SELECT id, data FROM base_records WHERE table_id = 'lJqfw81iX7eM'").all();
  let updatedCount = 0;
  for (const r of recordsToUpdate) {
    const data = JSON.parse(r.data || '{}');
    if (!data.link_campana) {
      const text = ((data['-e-Aa4UHE3fz'] || '') + ' ' + (data['6T_EE6y31JqH'] || '')).toLowerCase();
      let campaignId = 'rec_camp_comunidad'; // Default to comunidad
      if (text.includes('glaciar') || text.includes('hoya') || text.includes('invierno') || text.includes('nieve') || text.includes('esquí')) {
        campaignId = 'rec_camp_invierno';
      } else if (text.includes('aventura') || text.includes('circuito') || text.includes('parque') || text.includes('alerc') || text.includes('sender')) {
        campaignId = 'rec_camp_primavera';
      }
      data.link_campana = [campaignId];
      db.prepare("UPDATE base_records SET data = ? WHERE id = ?").run(JSON.stringify(data), r.id);
      updatedCount++;
    }
  }
  console.log(`✅ ${updatedCount} publicaciones vinculadas automáticamente a sus respectivas campañas.`);

  // 6. Crear la vista Grid principal de Campañas si no existe
  const viewExists = db.prepare("SELECT 1 FROM base_views WHERE table_id = 'table_campanas'").get();
  if (!viewExists) {
    db.prepare("INSERT INTO base_views (id, table_id, name, type, config, position, created_by, personal) VALUES ('view_camp_grid', 'table_campanas', 'Grid principal', 'grid', '{}', 0, 1, 0)").run();
    console.log('✅ Vista Grid principal creada para CAMPAÑAS.');
  }

  console.log('🎉 Configuración finalizada con éxito.');
} catch (e) {
  console.error('❌ Error en el script:', e);
} finally {
  db.close();
}
