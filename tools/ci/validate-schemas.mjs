/**
 * validate-schemas — valida los JSON Schema del proyecto y sus ejemplos.
 *
 * Ejecutar:  npm run validate:schemas
 *
 * 1. Compila `/shared/schemas/building-prefab.schema.json` con Ajv 2020-12
 *    (detecta palabras clave mal escritas o `$ref` rotas).
 * 2. Valida cada `*.example.json` de `/shared/schemas/examples/`.
 * 3. Verifica que el schema y el tipo TypeScript declaren las mismas
 *    propiedades de primer nivel (evita que uno mute sin el otro).
 */

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const schemaPath = path.join(root, 'shared/schemas/building-prefab.schema.json');
const examplesDir = path.join(root, 'shared/schemas/examples');
const typesPath = path.join(root, 'shared/types/building.ts');

const errors = [];
const notes = [];

// strictRequired queda desactivado a propósito: da falsos positivos con los
// bloques if/then, donde `required` refiere a propiedades declaradas en el
// esquema padre y no en el subesquema condicional.
const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false, allowUnionTypes: true });
addFormats(ajv);

const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
let validate;
try {
  validate = ajv.compile(schema);
  notes.push(`Schema compilado: ${schema.$id}`);
} catch (err) {
  errors.push(`No compila el schema: ${err.message}`);
}

if (validate) {
  for (const file of readdirSync(examplesDir).filter((f) => f.endsWith('.json'))) {
    const doc = JSON.parse(readFileSync(path.join(examplesDir, file), 'utf8'));
    if (validate(doc)) {
      notes.push(`Ejemplo válido: ${file}`);
    } else {
      errors.push(
        `Ejemplo inválido ${file}:\n` +
          validate.errors.map((e) => `      ${e.instancePath || '/'} ${e.message}`).join('\n'),
      );
    }
  }
}

/* Paridad schema ↔ interfaz TypeScript ------------------------------------- */
const ts = readFileSync(typesPath, 'utf8');
const ifaceMatch = ts.match(/export interface BuildingPrefabMeta \{([\s\S]*?)\n\}/);
if (!ifaceMatch) {
  errors.push('No se encontró la interfaz BuildingPrefabMeta en shared/types/building.ts');
} else {
  const tsProps = new Set(
    [...ifaceMatch[1].matchAll(/^\s{2}readonly ([A-Za-z0-9_]+)\??:/gm)].map((m) => m[1]),
  );
  const schemaProps = new Set(Object.keys(schema.properties));
  const soloTs = [...tsProps].filter((p) => !schemaProps.has(p));
  const soloSchema = [...schemaProps].filter((p) => !tsProps.has(p));
  if (soloTs.length) errors.push(`Propiedades sólo en TypeScript: ${soloTs.join(', ')}`);
  if (soloSchema.length) errors.push(`Propiedades sólo en el JSON Schema: ${soloSchema.join(', ')}`);
  if (!soloTs.length && !soloSchema.length) {
    notes.push(`Paridad TS ↔ Schema: ${tsProps.size} propiedades de primer nivel coinciden`);
  }
}

console.log('— validate:schemas —————————————————————————');
for (const n of notes) console.log(`  · ${n}`);
if (errors.length) {
  console.error('\n  FALLAS:');
  for (const e of errors) console.error(`   ✗ ${e}`);
  process.exit(1);
}
console.log('\n  ✓ Schemas y ejemplos consistentes.');
