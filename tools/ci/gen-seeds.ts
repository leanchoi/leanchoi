/**
 * gen-seeds — genera los seeds SQL derivados de los contratos de `/shared`.
 *
 * Ejecutar:  node --experimental-strip-types tools/ci/gen-seeds.ts
 *
 * Los seeds de facciones, rangos y zonas NO se escriben a mano: se derivan de
 * `/shared/constants/*` para que la base de datos y el código no puedan
 * divergir. Los catálogos de contenido (ítems, cartas, misiones) sí son
 * artesanales: las cartas y las misiones las emite
 * `server-vps/scripts/gen-catalog-seeds.ts` desde su propio catálogo, y los
 * ítems siguen siendo un .sql escrito a mano.
 */

import { writeFileSync } from 'node:fs';
import { FACTIONS } from '../../shared/constants/factions.ts';
import { RANKS } from '../../shared/constants/ranks.ts';
import { TERRITORY_ZONE_SEEDS } from '../../shared/constants/world.ts';
import { SPONSORS } from '../../shared/constants/sponsors.ts';

const q = (s: string): string => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
const j = (v: unknown): string => q(JSON.stringify(v));

const header = (titulo: string): string =>
  `-- =============================================================================\n` +
  `--  ESQUEL 2027 — SEED: ${titulo}\n` +
  `--  GENERADO AUTOMÁTICAMENTE por tools/ci/gen-seeds.ts — NO EDITAR A MANO.\n` +
  `--  Fuente de verdad: /shared/constants/\n` +
  `-- =============================================================================\n` +
  `SET NAMES utf8mb4;\n\n`;

/* --- 001 facciones --------------------------------------------------------- */
const facciones =
  header('facciones') +
  `INSERT INTO \`facciones\`\n` +
  `  (\`id\`, \`slug\`, \`nombre\`, \`nombre_corto\`, \`lema\`, \`color_primario\`, \`color_secundario\`, \`perks\`, \`afinidad\`, \`bastiones\`, \`activa\`)\n` +
  `VALUES\n` +
  FACTIONS.map(
    (f) =>
      `  (${f.id}, ${q(f.slug)}, ${q(f.name)}, ${q(f.shortName)}, ${q(f.motto)}, ${q(f.colorPrimary)}, ` +
      `${q(f.colorSecondary)}, ${j(f.perks)}, ${j(f.affinity)}, ${j(f.strongholds)}, 1)`,
  ).join(',\n') +
  `\nON DUPLICATE KEY UPDATE\n` +
  `  \`nombre\` = VALUES(\`nombre\`), \`nombre_corto\` = VALUES(\`nombre_corto\`), \`lema\` = VALUES(\`lema\`),\n` +
  `  \`color_primario\` = VALUES(\`color_primario\`), \`color_secundario\` = VALUES(\`color_secundario\`),\n` +
  `  \`perks\` = VALUES(\`perks\`), \`afinidad\` = VALUES(\`afinidad\`), \`bastiones\` = VALUES(\`bastiones\`);\n`;

/* --- 002 rangos ------------------------------------------------------------ */
const rangos =
  header('rangos (árbol de carrera militante)') +
  `INSERT INTO \`rangos\`\n` +
  `  (\`nivel\`, \`slug\`, \`nombre\`, \`descripcion\`, \`xp_to_next\`, \`xp_total\`, \`reputacion_req\`, \`lealtad_req\`,\n` +
  `   \`xp_multiplicador\`, \`estipendio_centavos\`, \`peso_territorial\`, \`cupo_misiones\`, \`rareza_max\`, \`desbloqueos\`)\n` +
  `VALUES\n` +
  RANKS.map(
    (r) =>
      `  (${r.level}, ${q(r.id)}, ${q(r.name)}, ${q(r.blurb)}, ${r.xpToNext}, ${r.xpTotal}, ${r.reputationRequired}, ` +
      `${r.loyaltyRequired.toFixed(3)}, ${r.xpMultiplier.toFixed(3)}, ${r.dailyStipendCentavos}, ` +
      `${r.territoryWeight.toFixed(2)}, ${r.dailyQuestCap}, ${q(r.maxCardRarity)}, ${j(r.unlocks)})`,
  ).join(',\n') +
  `\nON DUPLICATE KEY UPDATE\n` +
  `  \`nombre\` = VALUES(\`nombre\`), \`descripcion\` = VALUES(\`descripcion\`), \`xp_to_next\` = VALUES(\`xp_to_next\`),\n` +
  `  \`xp_total\` = VALUES(\`xp_total\`), \`reputacion_req\` = VALUES(\`reputacion_req\`), \`lealtad_req\` = VALUES(\`lealtad_req\`),\n` +
  `  \`xp_multiplicador\` = VALUES(\`xp_multiplicador\`), \`estipendio_centavos\` = VALUES(\`estipendio_centavos\`),\n` +
  `  \`peso_territorial\` = VALUES(\`peso_territorial\`), \`cupo_misiones\` = VALUES(\`cupo_misiones\`),\n` +
  `  \`rareza_max\` = VALUES(\`rareza_max\`), \`desbloqueos\` = VALUES(\`desbloqueos\`);\n`;

/* --- 006 zonas ------------------------------------------------------------- */
const zonas =
  header('zonas de disputa territorial') +
  `INSERT INTO \`zonas_territorio\`\n` +
  `  (\`id\`, \`nombre\`, \`barrio\`, \`celdas\`, \`centro_x\`, \`centro_z\`, \`radio_m\`, \`peso\`)\n` +
  `VALUES\n` +
  // El centro y el radio son los que fija la constante: cada zona está plantada
  // sobre un punto real del pueblo, no en el promedio de sus manzanas.
  TERRITORY_ZONE_SEEDS.map(
    (z) =>
      `  (${q(z.id)}, ${q(z.name)}, ${q(z.barrio)}, ${j(z.cells)}, ${z.centerX.toFixed(3)}, ` +
      `${z.centerZ.toFixed(3)}, ${Math.round(z.radiusM)}, ${z.weight.toFixed(2)})`,
  ).join(',\n') +
  `\nON DUPLICATE KEY UPDATE\n` +
  `  \`nombre\` = VALUES(\`nombre\`), \`barrio\` = VALUES(\`barrio\`), \`celdas\` = VALUES(\`celdas\`),\n` +
  `  \`centro_x\` = VALUES(\`centro_x\`), \`centro_z\` = VALUES(\`centro_z\`),\n` +
  `  \`radio_m\` = VALUES(\`radio_m\`), \`peso\` = VALUES(\`peso\`);\n`;

/* --- 007 comercios auspiciados --------------------------------------------- */

/**
 * Los tres locales del catálogo compartido.
 *
 * Son **arquetipos del comercio de Esquel** —la chocolatería del centro, el café
 * de la estación, la casa de indumentaria de montaña—, no comercios
 * identificados: el nombre describe el rubro y la cuadra, no a un titular. Para
 * cargar un comercio real hace falta contrato firmado y consentimiento expreso
 * de uso de nombre, marca y fachada; eso no se genera, se carga a mano.
 */
const comercios =
  header('comercios auspiciados') +
  `-- Arquetipos, no comercios identificados. Un comercio real entra sólo con\n` +
  `-- contrato firmado y consentimiento de uso de nombre, marca y fachada.\n\n` +
  `INSERT INTO \`comercios_patrocinados\`\n` +
  `  (\`id\`, \`slug\`, \`razon_social\`, \`nombre_fantasia\`, \`rubro\`, \`calle\`, \`altura\`, \`barrio\`,\n` +
  `   \`marquesina_texto\`, \`marquesina_color\`, \`marquesina_alto_m\`, \`radio_impresion_m\`,\n` +
  `   \`buff_slug\`, \`buff_config\`, \`plan\`, \`estado\`, \`apertura_minuto\`, \`cierre_minuto\`,\n` +
  `   \`dias_apertura\`, \`monto_mensual_centavos\`)\n` +
  `VALUES\n` +
  SPONSORS.map((c) => {
    const buff = {
      label: c.buff.name,
      kind: c.buff.kind,
      description: c.buff.description,
      magnitude: c.buff.magnitude,
      durationSeconds: c.buff.seconds,
      priceCentavos: c.buff.priceCentavos,
    };
    const color = `#${c.marqueeColor.toString(16).padStart(6, '0')}`;
    return (
      `  (${c.id}, ${q(c.slug)}, ${q(`${c.name} (arquetipo)`)}, ${q(c.name)}, ${q(c.rubro)}, ${q(c.street)}, ` +
      `${c.streetNumber}, ${q(c.barrio)}, ${q(c.marqueeText)}, ${q(color)}, 1.20, ${c.impressionRadiusM}, ` +
      `${q(c.buff.slug)}, ${j(buff)}, 'basico', 'activo', ${c.opensAt}, ${c.closesAt}, 127, 0)`
    );
  }).join(',\n') +
  `\nON DUPLICATE KEY UPDATE\n` +
  `  \`nombre_fantasia\` = VALUES(\`nombre_fantasia\`), \`rubro\` = VALUES(\`rubro\`),\n` +
  `  \`calle\` = VALUES(\`calle\`), \`altura\` = VALUES(\`altura\`), \`barrio\` = VALUES(\`barrio\`),\n` +
  `  \`marquesina_texto\` = VALUES(\`marquesina_texto\`), \`marquesina_color\` = VALUES(\`marquesina_color\`),\n` +
  `  \`radio_impresion_m\` = VALUES(\`radio_impresion_m\`),\n` +
  `  \`buff_slug\` = VALUES(\`buff_slug\`), \`buff_config\` = VALUES(\`buff_config\`),\n` +
  `  \`apertura_minuto\` = VALUES(\`apertura_minuto\`), \`cierre_minuto\` = VALUES(\`cierre_minuto\`);\n`;

const out = new URL('../../backend-php/database/seeds/', import.meta.url);
writeFileSync(new URL('001_facciones.sql', out), facciones, 'utf8');
writeFileSync(new URL('002_rangos.sql', out), rangos, 'utf8');
writeFileSync(new URL('006_zonas_territorio.sql', out), zonas, 'utf8');
writeFileSync(new URL('007_comercios_demo.sql', out), comercios, 'utf8');
console.log('Seeds generados: 001_facciones.sql, 002_rangos.sql, 006_zonas_territorio.sql, 007_comercios_demo.sql');
