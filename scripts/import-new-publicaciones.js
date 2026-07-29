const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const DB_DIR = process.env.DB_DIR || '/var/lib/docker/volumes/leanboard_leanboard-data/_data';
const db = new Database(path.join(DB_DIR, 'trello.db'));
db.pragma('busy_timeout = 15000');

const uid = () => crypto.randomBytes(9).toString('base64url');
const now = () => new Date().toISOString();

const BASE_NAME = 'REDES TURISMO ESQUEL';
const BASE_ID = '35JZzATXWukh';
const TABLE_ID = 'lJqfw81iX7eM';

console.log('🔄 Borrando base de datos de redes sociales antigua...');

try {
  // Eliminar registros antiguos asociados a la base
  db.prepare("DELETE FROM base_records WHERE table_id IN (SELECT id FROM base_tables WHERE base_id = ?)").run(BASE_ID);
  db.prepare("DELETE FROM base_views WHERE table_id IN (SELECT id FROM base_tables WHERE base_id = ?)").run(BASE_ID);
  db.prepare("DELETE FROM base_fields WHERE table_id IN (SELECT id FROM base_tables WHERE base_id = ?)").run(BASE_ID);
  db.prepare("DELETE FROM base_tables WHERE base_id = ?").run(BASE_ID);
  db.prepare("DELETE FROM base_collaborators WHERE base_id = ?").run(BASE_ID);
  db.prepare("DELETE FROM bases WHERE id = ?").run(BASE_ID);
  
  // También eliminar la tabla CAMPAÑAS antigua por si acaso
  db.prepare("DELETE FROM base_records WHERE table_id = 'table_campanas'").run();
  db.prepare("DELETE FROM base_views WHERE table_id = 'table_campanas'").run();
  db.prepare("DELETE FROM base_fields WHERE table_id = 'table_campanas'").run();
  db.prepare("DELETE FROM base_tables WHERE id = 'table_campanas'").run();
  
  console.log('✅ Base antigua borrada con éxito.');
} catch (e) {
  console.log('⚠️  Nota al borrar base antigua (puede no haber existido):', e.message);
}

// ── Parser CSV mínimo ──
function parseCSV(text) {
  const rows = [];
  let row = [], cell = '', inQuotes = false;
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // BOM
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }
        else inQuotes = false;
      } else cell += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some(x => x.trim() !== '')) rows.push(row);
      row = [];
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); if (row.some(x => x.trim() !== '')) rows.push(row); }
  return rows;
}

// d/m/yyyy → yyyy-mm-dd
function parseFecha(s) {
  const clean = String(s || '').trim();
  if (!clean) return null;
  // Soportar formato d/m/yyyy
  const m = clean.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  // Soportar formato yyyy-mm-dd
  if (clean.match(/^\d{4}-\d{2}-\d{2}$/)) {
    return clean;
  }
  return null;
}

function main() {
  const admin = db.prepare('SELECT id FROM users WHERE is_master = 1 ORDER BY id LIMIT 1').get()
    || db.prepare("SELECT id FROM users WHERE username = 'admin'").get();
  if (!admin) { console.error('✗ No hay usuario admin/master.'); process.exit(1); }

  const csvPath = '/root/leanboard/scripts/data/publicaciones_drive.csv';
  if (!fs.existsSync(csvPath)) {
    console.error(`✗ No existe el archivo CSV en ${csvPath}`);
    process.exit(1);
  }
  
  const rows = parseCSV(fs.readFileSync(csvPath, 'utf8'));
  const header = rows[0].map(h => h.trim().replace(/^\ufeff/, ''));
  const data = rows.slice(1).map(r => Object.fromEntries(header.map((h, i) => [h, (r[i] || '').trim()])));
  console.log(`· CSV cargado: ${data.length} registros detectados.`);

  // Mapeo de columnas en el CSV
  const col = {
    pauta: 'PAUTA', desc: 'BREVE DESCRIPCION', copy: 'COPY', fecha: 'FECHA DE PUBLI',
    estado: 'ESTADO', productos: 'PRODUCTOS', canal: 'CANAL', resp: 'RESPONSABLE',
    fbL: 'FB Likes', fbA: 'FB ALCANCE', igL: 'Ig Likes', igA: 'IG ALCANCE', ttL: 'TT LIKES', ttA: 'TT ALCANCE',
  };

  // set de 21 colores únicos para PRODUCTOS
  const ALL_COLORS = [
    'red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal', 'cyan', 'sky', 
    'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose', 'slate', 'stone', 'zinc', 'neutral'
  ];

  const choicesFrom = (values, colorMap = {}, forceUniqueColors = false) => {
    const list = [...new Set(values.filter(Boolean))].sort();
    return list.map((name, i) => ({ 
      id: uid(), 
      name, 
      color: colorMap[name] || (forceUniqueColors ? ALL_COLORS[i % ALL_COLORS.length] : ALL_COLORS[i % 9]) 
    }));
  };
  
  const splitMulti = (s) => String(s || '').split(',').map(x => x.trim()).filter(Boolean);

  const estadoColors = {
    'PUBLICADO': 'green', 'OK PARA PUBLICAR': 'teal', 'Programado': 'blue',
    'FALTA OK MARCE': 'orange', 'FALTA COMPLETAR ALGO': 'yellow', 'EDITAR IMAGEN': 'red',
  };
  const canalColors = { FACEBOOK: 'blue', INSTAGRAM: 'pink', TIKTOK: 'gray', YOUTUBE: 'red', HISTORIA: 'purple', META: 'teal' };

  const estadoChoices = choicesFrom(data.map(r => r[col.estado]), estadoColors);
  const pautaChoices = choicesFrom(data.map(r => r[col.pauta]));
  const productoChoices = choicesFrom(data.flatMap(r => splitMulti(r[col.productos])), {}, true); // Colores únicos para todos
  const canalChoices = choicesFrom(data.flatMap(r => splitMulti(r[col.canal])), canalColors);
  const respChoices = choicesFrom(data.map(r => r[col.resp]));

  const f = {}; // nombre → field id
  const fields = [
    ['BREVE DESCRIPCION', 'text', {}],
    ['COPY', 'longtext', {}],
    ['MATERIAL', 'attachment', {}],
    ['FECHA DE PUBLI', 'date', {}],
    ['ESTADO', 'select', { choices: estadoChoices }],
    ['PAUTA', 'select', { choices: pautaChoices }],
    ['PRODUCTOS', 'multiselect', { choices: productoChoices }],
    ['CANAL', 'multiselect', { choices: canalChoices }],
    ['RESPONSABLE', 'select', { choices: respChoices }],
    ['FB Likes', 'number', {}],
    ['FB Alcance', 'number', {}],
    ['IG Likes', 'number', {}],
    ['IG Alcance', 'number', {}],
    ['TT Likes', 'number', {}],
    ['TT Alcance', 'number', {}],
  ];

  const tx = db.transaction(() => {
    // 1. Crear la Base
    db.prepare('INSERT INTO bases (id, name, color, icon, owner_id, tenant_id) VALUES (?, ?, ?, ?, ?, 1)')
      .run(BASE_ID, BASE_NAME, 'teal', '📣', admin.id);
      
    // 2. Crear la Tabla PUBLICACIONES
    db.prepare('INSERT INTO base_tables (id, base_id, name, position) VALUES (?, ?, ?, 0)')
      .run(TABLE_ID, BASE_ID, 'PUBLICACIONES');

    // 3. Crear los campos de PUBLICACIONES
    const insF = db.prepare('INSERT INTO base_fields (id, table_id, name, type, options, position) VALUES (?, ?, ?, ?, ?, ?)');
    fields.forEach(([name, type, options], i) => {
      const id = uid(); f[name] = id;
      insF.run(id, TABLE_ID, name, type, JSON.stringify(options), i);
    });

    // 4. Cargar Registros en PUBLICACIONES
    const num = (v) => { 
      const n = parseInt(String(v).replace(/[^\d-]/g, ''), 10); 
      return Number.isFinite(n) ? n : undefined; 
    };
    const insR = db.prepare('INSERT INTO base_records (id, table_id, data, position, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
    
    let imported = 0;
    data.forEach((r, i) => {
      const d = {};
      if (r[col.desc]) d[f['BREVE DESCRIPCION']] = r[col.desc];
      if (r[col.copy]) d[f['COPY']] = r[col.copy];
      const fecha = parseFecha(r[col.fecha]); if (fecha) d[f['FECHA DE PUBLI']] = fecha;
      if (r[col.estado]) d[f['ESTADO']] = r[col.estado];
      if (r[col.pauta]) d[f['PAUTA']] = r[col.pauta];
      const prods = splitMulti(r[col.productos]); if (prods.length) d[f['PRODUCTOS']] = prods;
      const canales = splitMulti(r[col.canal]); if (canales.length) d[f['CANAL']] = canales;
      if (r[col.resp]) d[f['RESPONSABLE']] = r[col.resp];
      
      const nums = [
        [col.fbL, 'FB Likes'], [col.fbA, 'FB Alcance'], 
        [col.igL, 'IG Likes'], [col.igA, 'IG Alcance'], 
        [col.ttL, 'TT Likes'], [col.ttA, 'TT Alcance']
      ];
      for (const [src, dst] of nums) { 
        const n = num(r[src]); 
        if (n !== undefined) d[f[dst]] = n; 
      }
      
      insR.run(uid(), TABLE_ID, JSON.stringify(d), i, admin.id, now(), now());
      imported++;
    });

    // 5. Crear Vistas de PUBLICACIONES
    const insV = db.prepare('INSERT INTO base_views (id, table_id, name, type, config, position, created_by, personal) VALUES (?, ?, ?, ?, ?, ?, ?, 0)');
    let pos = 0;
    insV.run(uid(), TABLE_ID, 'Grid principal', 'grid', JSON.stringify({
      sorts: [{ fieldId: f['FECHA DE PUBLI'], dir: 'asc' }],
    }), pos++, admin.id);
    
    insV.run(uid(), TABLE_ID, 'Flujo de trabajo', 'kanban', JSON.stringify({
      stackBy: f['ESTADO'],
      hidden: [f['COPY'], f['FB Likes'], f['FB Alcance'], f['IG Likes'], f['IG Alcance'], f['TT Likes'], f['TT Alcance'], f['PAUTA'], f['RESPONSABLE']],
    }), pos++, admin.id);
    
    insV.run(uid(), TABLE_ID, 'Calendario de publicación', 'calendar', JSON.stringify({
      dateField: f['FECHA DE PUBLI'],
      colorRules: [{ color: 'green', fieldId: f['ESTADO'], op: 'eq', value: 'PUBLICADO' }],
    }), pos++, admin.id);
    
    insV.run(uid(), TABLE_ID, 'Pendientes', 'grid', JSON.stringify({
      filters: [
        { fieldId: f['ESTADO'], op: 'neq', value: 'PUBLICADO' },
      ],
      sorts: [{ fieldId: f['FECHA DE PUBLI'], dir: 'asc' }],
      groupBy: f['ESTADO'],
      colorRules: [
        { color: 'orange', fieldId: f['ESTADO'], op: 'eq', value: 'FALTA OK MARCE' },
        { color: 'yellow', fieldId: f['ESTADO'], op: 'eq', value: 'FALTA COMPLETAR ALGO' },
        { color: 'red', fieldId: f['ESTADO'], op: 'eq', value: 'EDITAR IMAGEN' },
        { color: 'teal', fieldId: f['ESTADO'], op: 'eq', value: 'OK PARA PUBLICAR' },
        { color: 'blue', fieldId: f['ESTADO'], op: 'eq', value: 'Programado' },
      ],
      hidden: [f['COPY'], f['FB Likes'], f['FB Alcance'], f['IG Likes'], f['IG Alcance'], f['TT Likes'], f['TT Alcance']],
    }), pos++, admin.id);
    
    insV.run(uid(), TABLE_ID, 'Galería de material', 'gallery', JSON.stringify({
      coverField: f['MATERIAL'],
      hidden: [f['COPY'], f['FB Likes'], f['FB Alcance'], f['IG Likes'], f['IG Alcance'], f['TT Likes'], f['TT Alcance'], f['PAUTA'], f['RESPONSABLE'], f['PRODUCTOS']],
    }), pos++, admin.id);

    // 6. Crear la Tabla CAMPAÑAS
    db.prepare("INSERT INTO base_tables (id, base_id, name, position) VALUES ('table_campanas', ?, 'CAMPAÑAS', 1)").run(BASE_ID);
    
    const campFields = [
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

    for (const cf of campFields) {
      db.prepare("INSERT INTO base_fields (id, table_id, name, type, options, position) VALUES (?, 'table_campanas', ?, ?, ?, ?)").run(
        cf.id, cf.name, cf.type, cf.options, cf.position
      );
    }

    // 7. Crear Registros en CAMPAÑAS
    const campaigns = [
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

    for (const r of campaigns) {
      db.prepare("INSERT INTO base_records (id, table_id, data, position, created_by) VALUES (?, 'table_campanas', ?, ?, ?)").run(
        r.id, JSON.stringify(r.data), r.position, admin.id
      );
    }

    // 8. Crear la relación 'Campaña Relacionada' en PUBLICACIONES
    db.prepare("INSERT INTO base_fields (id, table_id, name, type, options, position) VALUES ('link_campana', ?, 'Campaña Relacionada', 'link', ?, 15)").run(
      TABLE_ID, JSON.stringify({ tableId: 'table_campanas' })
    );

    // 9. Crear la vista de CAMPAÑAS
    db.prepare("INSERT INTO base_views (id, table_id, name, type, config, position, created_by, personal) VALUES ('view_camp_grid', 'table_campanas', 'Grid principal', 'grid', '{}', 0, ?, 0)").run(admin.id);

    return imported;
  });

  const imported = tx();
  console.log(`✔ Base "${BASE_NAME}" re-importada con éxito con ${imported} publicaciones.`);
  
  // 10. Vincular registros importados a sus campañas correspondientes en una transacción separada
  console.log('🔄 Vinculando publicaciones a las campañas relacionales...');
  const recordsToUpdate = db.prepare("SELECT id, data FROM base_records WHERE table_id = ?").all(TABLE_ID);
  let updatedCount = 0;
  
  db.transaction(() => {
    for (const r of recordsToUpdate) {
      const data = JSON.parse(r.data || '{}');
      const text = ((data[f['BREVE DESCRIPCION']] || '') + ' ' + (data[f['COPY']] || '')).toLowerCase();
      let campaignId = 'rec_camp_comunidad'; // Default
      
      if (text.includes('glaciar') || text.includes('hoya') || text.includes('invierno') || text.includes('nieve') || text.includes('esquí')) {
        campaignId = 'rec_camp_invierno';
      } else if (text.includes('aventura') || text.includes('circuito') || text.includes('parque') || text.includes('alerc') || text.includes('sender')) {
        campaignId = 'rec_camp_primavera';
      }
      
      data.link_campana = [campaignId];
      db.prepare("UPDATE base_records SET data = ? WHERE id = ?").run(JSON.stringify(data), r.id);
      updatedCount++;
    }
  })();
  
  console.log(`✅ ${updatedCount} publicaciones vinculadas con éxito a sus campañas.`);
}

try {
  main();
} catch (e) {
  console.error('❌ Error fatal en la importación:', e);
} finally {
  db.close();
}
