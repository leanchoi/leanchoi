/**
 * gen-catalog-seeds — genera los seeds SQL de los catálogos de contenido.
 *
 * Ejecutar:  npm run seeds --workspace server-vps
 *
 * Las cartas de debate y las tipologías de misión son código: viven en
 * `/shared/constants/cards.ts` y `src/quests/catalog/`. Escribir el SQL a mano
 * garantiza que en algún momento diverja, así que se emite desde la fuente.
 *
 * Convención: las columnas ENUM usan el vocabulario de la base (minúscula,
 * snake_case); las columnas JSON son un volcado literal del contrato TypeScript
 * y conservan los tokens tal cual (`"family":"CARPETAZO"`).
 *
 * Los objetivos de una misión se arman en tiempo de spawn con el clima, la hora
 * y la dificultad del momento; lo que va al seed es una **instancia de
 * referencia** (dificultad 0,5, tarde despejada) para que el panel de admin y
 * los reportes tengan de dónde leer el formato. El servidor no lee esta tabla
 * para jugar: la fuente de verdad sigue siendo el catálogo TypeScript.
 */

import { writeFileSync } from 'node:fs';
import { CARD_LIST, QUEST_BASELINES, type QuestType } from '@esquel/shared';

import { QUEST_CATALOG } from '../src/quests/catalog/index.ts';
import type { QuestContext } from '../src/quests/catalog/types.ts';

const q = (s: string): string => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
const j = (v: unknown): string => q(JSON.stringify(v));
/** Los ENUM de la base van en minúscula; las constantes TS en UPPER_SNAKE. */
const enumOf = (token: string): string => q(token.toLowerCase());

const header = (titulo: string, fuente: string): string =>
  `-- =============================================================================\n` +
  `--  ESQUEL 2027 — SEED: ${titulo}\n` +
  `--  GENERADO AUTOMÁTICAMENTE por server-vps/scripts/gen-catalog-seeds.ts.\n` +
  `--  NO EDITAR A MANO: se regenera con \`npm run seeds --workspace server-vps\`.\n` +
  `--  Fuente de verdad: ${fuente}\n` +
  `-- =============================================================================\n` +
  `SET NAMES utf8mb4;\n\n`;

/* --- 004 cartas de debate -------------------------------------------------- */

const cartas =
  header('cartas de debate (24, seis familias)', '/shared/constants/cards.ts') +
  `INSERT INTO \`cartas_debate\`\n` +
  `  (\`id\`, \`slug\`, \`nombre\`, \`flavor\`, \`familia\`, \`rareza\`, \`costo\`, \`poder\`, \`precision_base\`,\n` +
  `   \`backfire\`, \`efectos\`, \`rango_min\`, \`faccion_afinidad\`, \`cooldown\`, \`max_copias\`, \`icono\`, \`habilitada\`)\n` +
  `VALUES\n` +
  CARD_LIST.map((c, i) => {
    const afinidad = c.factionAffinity === undefined ? 'NULL' : String(c.factionAffinity);
    return (
      `  (${i + 1}, ${q(c.slug)}, ${q(c.name)}, ${q(c.flavor)}, ${enumOf(c.family)}, ${q(c.rarity)}, ` +
      `${c.cost}, ${c.power}, ${c.accuracy.toFixed(3)}, ${c.backfire.toFixed(3)}, ${j(c.effects)}, ` +
      `${c.minRank}, ${afinidad}, ${c.cooldown}, ${c.maxCopies}, ${q(c.icon)}, ${c.enabled ? 1 : 0})`
    );
  }).join(',\n') +
  `\nON DUPLICATE KEY UPDATE\n` +
  `  \`nombre\` = VALUES(\`nombre\`), \`flavor\` = VALUES(\`flavor\`), \`familia\` = VALUES(\`familia\`),\n` +
  `  \`rareza\` = VALUES(\`rareza\`), \`costo\` = VALUES(\`costo\`), \`poder\` = VALUES(\`poder\`),\n` +
  `  \`precision_base\` = VALUES(\`precision_base\`), \`backfire\` = VALUES(\`backfire\`),\n` +
  `  \`efectos\` = VALUES(\`efectos\`), \`rango_min\` = VALUES(\`rango_min\`),\n` +
  `  \`faccion_afinidad\` = VALUES(\`faccion_afinidad\`), \`cooldown\` = VALUES(\`cooldown\`),\n` +
  `  \`max_copias\` = VALUES(\`max_copias\`), \`icono\` = VALUES(\`icono\`), \`habilitada\` = VALUES(\`habilitada\`);\n`;

/* --- 005 catálogo de misiones ---------------------------------------------- */

/** Tarde de abril despejada en la plaza: el contexto de referencia del seed. */
const CTX_REFERENCIA: QuestContext = {
  now: Date.parse('2027-04-15T18:00:00-03:00'),
  weather: 'despejado',
  snowCoverage: 0,
  windGustKph: 12,
  localHour: 18,
  electionPhase: 'PRE_CAMPAIGN',
  online: { 1: 12, 2: 12, 3: 12, 4: 12 },
  zones: [
    { id: 'zone:plaza-san-martin', name: 'Plaza San Martín', centerX: 0, centerZ: 0, radiusM: 55, controlledBy: 0 },
  ],
};

/** RNG fijo: el seed tiene que ser byte a byte reproducible. */
const rngFijo = (): number => 0.5;
const DIFICULTAD_REFERENCIA = 0.5;

const misiones =
  header('catálogo de misiones (10 tipologías Live-Ops)', '/server-vps/src/quests/catalog/') +
  `-- \`objetivos\` es una instancia de referencia (dificultad 0,5, tarde despejada):\n` +
  `-- el servidor arma los objetivos reales al spawnear, con el contexto del momento.\n` +
  `-- \`recompensas_base\` sale de QUEST_BASELINES en /shared/constants/balance.ts.\n\n` +
  `INSERT INTO \`misiones_catalogo\`\n` +
  `  (\`id\`, \`slug\`, \`tipo\`, \`titulo\`, \`descripcion\`, \`objetivos\`, \`requisitos\`, \`recompensas_base\`,\n` +
  `   \`duracion_s\`, \`grupal\`, \`disputada\`, \`item_requerido\`, \`rango_min\`, \`cupo\`, \`exterior\`,\n` +
  `   \`peso_seleccion\`, \`habilitada\`)\n` +
  `VALUES\n` +
  (Object.entries(QUEST_CATALOG) as [QuestType, (typeof QUEST_CATALOG)[QuestType]][])
    .map(([tipo, bp], i) => {
      const base = QUEST_BASELINES[tipo];
      const placement = bp.place(CTX_REFERENCIA, rngFijo);
      const objetivos = bp.objectives(CTX_REFERENCIA, placement, DIFICULTAD_REFERENCIA);
      const requisitos = {
        minRank: bp.minRank,
        ...(bp.requiredCareerItem ? { requiredItem: bp.requiredCareerItem } : {}),
      };
      const recompensas = {
        xp: base.xp,
        reputation: base.reputation,
        money: base.money,
        items: [],
        territoryScore: base.territory,
        factionTreasury: Math.round(base.money * 0.15),
      };
      const item = bp.requiredCareerItem ? q(bp.requiredCareerItem) : 'NULL';
      return (
        `  (${i + 1}, ${q(bp.slug)}, ${enumOf(tipo)}, ${q(bp.title)},\n` +
        `   ${q(bp.description(CTX_REFERENCIA, placement))},\n` +
        `   ${j(objetivos)},\n` +
        `   ${j(requisitos)},\n` +
        `   ${j(recompensas)},\n` +
        `   ${bp.durationS}, ${bp.group ? 1 : 0}, ${bp.contested ? 1 : 0}, ${item}, ${bp.minRank}, ` +
        `${bp.capacity}, ${base.outdoor ? 1 : 0}, 1.000, 1)`
      );
    })
    .join(',\n') +
  `\nON DUPLICATE KEY UPDATE\n` +
  `  \`tipo\` = VALUES(\`tipo\`), \`titulo\` = VALUES(\`titulo\`), \`descripcion\` = VALUES(\`descripcion\`),\n` +
  `  \`objetivos\` = VALUES(\`objetivos\`), \`requisitos\` = VALUES(\`requisitos\`),\n` +
  `  \`recompensas_base\` = VALUES(\`recompensas_base\`), \`duracion_s\` = VALUES(\`duracion_s\`),\n` +
  `  \`grupal\` = VALUES(\`grupal\`), \`disputada\` = VALUES(\`disputada\`),\n` +
  `  \`item_requerido\` = VALUES(\`item_requerido\`), \`rango_min\` = VALUES(\`rango_min\`),\n` +
  `  \`cupo\` = VALUES(\`cupo\`), \`exterior\` = VALUES(\`exterior\`), \`habilitada\` = VALUES(\`habilitada\`);\n`;

/* --- salida ---------------------------------------------------------------- */

const dir = new URL('../../backend-php/database/seeds/', import.meta.url);
writeFileSync(new URL('004_cartas_debate.sql', dir), cartas, 'utf8');
writeFileSync(new URL('005_misiones_catalogo.sql', dir), misiones, 'utf8');

console.log(`✓ 004_cartas_debate.sql       — ${CARD_LIST.length} cartas`);
console.log(`✓ 005_misiones_catalogo.sql   — ${Object.keys(QUEST_CATALOG).length} tipologías`);
