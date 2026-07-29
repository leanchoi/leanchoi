const Database = require('better-sqlite3');
const path = require('path');

const DB_DIR = process.env.DB_DIR || '/var/lib/docker/volumes/leanboard_leanboard-data/_data';
const db = new Database(path.join(DB_DIR, 'trello.db'));

console.log('🔄 Recoloreando opciones del campo PRODUCTOS...');

const fieldId = 'vaa2hzW1KoJg'; // PRODUCTOS field ID
const field = db.prepare("SELECT options FROM base_fields WHERE id = ?").get(fieldId);

if (field) {
  const options = JSON.parse(field.options || '{}');
  const choices = options.choices || [];
  
  const colors = [
    'red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal', 'cyan', 'sky', 
    'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose', 'slate', 'stone', 'zinc', 'neutral'
  ];

  choices.forEach((choice, index) => {
    choice.color = colors[index % colors.length];
  });

  options.choices = choices;

  db.prepare("UPDATE base_fields SET options = ? WHERE id = ?").run(JSON.stringify(options), fieldId);
  console.log('✅ Opciones del campo PRODUCTOS actualizadas con colores únicos exitosamente.');
} else {
  console.log('❌ No se encontró el campo PRODUCTOS.');
}

db.close();
