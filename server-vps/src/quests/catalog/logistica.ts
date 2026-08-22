/**
 * Misiones de logística: las que se ganan con la camioneta.
 *
 *   REPARTO_BARRIAL      bolsones del depósito al Badén o a Ceferino
 *   CARAVANA_DE_BLOQUES  seis puestos de control sin bajarse
 *   CORTE_DE_CINTA       inaugurar la obra antes que la oposición
 */

import { BARRIO_BY_ID, CELL_PITCH_M, type Barrio, type GridCell, type Vec3 } from '@esquel/shared';
import type { QuestBlueprint, QuestPlacement } from './types.ts';
import { withinQuest } from './types.ts';

/** Depósito central del comité: media cuadra al sur de la plaza. */
export const DEPOSITO_CENTRAL: Vec3 = { x: -40, y: 0, z: -120 };

const barrioPlacement = (barrio: Barrio, radiusM = 100): QuestPlacement => {
  const def = BARRIO_BY_ID[barrio];
  const center: Vec3 = { x: def.spawnCell.col * CELL_PITCH_M, y: 0, z: def.spawnCell.row * CELL_PITCH_M };
  const cells: GridCell[] = [{ col: def.spawnCell.col, row: def.spawnCell.row }];
  return { barrio, center, radiusM, cells };
};

export const REPARTO_BARRIAL: QuestBlueprint = {
  type: 'REPARTO_BARRIAL',
  slug: 'reparto_barrial',
  title: 'Reparto barrial',
  description: (_ctx, p) =>
    `Cargá los bolsones en el depósito y llevalos a ${BARRIO_BY_ID[p.barrio].name}. Ojo con el barro de la entrada.`,
  minRank: 4,
  requiredCareerItem: 'camioneta_bloques',
  group: false,
  contested: false,
  durationS: 600,
  capacity: 0,
  autoSpawn: (ctx) => ctx.localHour >= 9 && ctx.localHour <= 19,
  place: (_ctx, rng) => barrioPlacement(rng() > 0.5 ? 'badenes' : 'ceferino'),
  objectives: (_ctx, p, difficulty) => [
    {
      id: 'cargar',
      kind: 'transportar',
      label: 'Cargá los bolsones en el depósito central',
      target: Math.round(8 * (0.75 + difficulty * 0.5)),
      position: DEPOSITO_CENTRAL,
      radiusM: 25 as never,
      optional: false,
      weight: 0.3,
      order: 1,
    },
    {
      id: 'entregar',
      kind: 'entregar',
      label: `Entregá los bolsones en ${BARRIO_BY_ID[p.barrio].name}`,
      target: Math.round(8 * (0.75 + difficulty * 0.5)),
      position: p.center,
      radiusM: p.radiusM as never,
      optional: false,
      weight: 0.7,
      order: 2,
    },
  ],
  onEvent: (event, quest) => {
    if (event.kind !== 'bulto_entregado') return null;
    const enDeposito =
      Math.hypot(event.at.x - DEPOSITO_CENTRAL.x, event.at.z - DEPOSITO_CENTRAL.z) <= 25;
    if (enDeposito) return { objectiveId: 'cargar', amount: event.amount ?? 1 };
    if (withinQuest(event, quest)) return { objectiveId: 'entregar', amount: event.amount ?? 1 };
    return null;
  },
};

export const CARAVANA_DE_BLOQUES: QuestBlueprint = {
  type: 'CARAVANA_DE_BLOQUES',
  slug: 'caravana_de_bloques',
  title: 'Caravana de bloques',
  description: () =>
    'Seis puntos de la ciudad, bocina y bandera, sin bajarse de la camioneta. El que se baja, no cuenta.',
  minRank: 4,
  requiredCareerItem: 'camioneta_bloques',
  group: true,
  contested: false,
  durationS: 540,
  capacity: 20,
  autoSpawn: (ctx) => ctx.electionPhase === 'OFFICIAL_CAMPAIGN' && ctx.localHour >= 16,
  place: () => ({
    barrio: 'centro',
    center: { x: 0, y: 0, z: 0 },
    radiusM: 900,
    cells: [{ col: 0, row: 0 }],
  }),
  objectives: (ctx) => {
    // Seis puestos: las cinco zonas de disputa más la plaza como cierre.
    const puestos = ctx.zones.slice(0, 5);
    const objetivos = puestos.map((zona, i) => ({
      id: `checkpoint_${i + 1}`,
      kind: 'checkpoint' as const,
      label: `Pasá por ${zona.name}`,
      target: 1,
      position: { x: zona.centerX, y: 0, z: zona.centerZ },
      radiusM: (zona.radiusM + 15) as never,
      optional: false,
      weight: 1 / 6,
      order: i + 1,
    }));
    objetivos.push({
      id: 'checkpoint_6',
      kind: 'checkpoint' as const,
      label: 'Cerrá la caravana en la Plaza San Martín',
      target: 1,
      position: { x: 0, y: 0, z: 0 },
      radiusM: 60 as never,
      optional: false,
      weight: 1 / 6,
      order: 6,
    });
    return objetivos;
  },
  onEvent: (event, quest) => {
    if (event.kind !== 'checkpoint' || !event.ref) return null;
    const objetivo = quest.objectives.find((o) => o.id === event.ref);
    if (!objetivo) return null;
    return { objectiveId: objetivo.id, amount: 1 };
  },
};

export const CORTE_DE_CINTA: QuestBlueprint = {
  type: 'CORTE_DE_CINTA',
  slug: 'corte_de_cinta',
  title: 'Corte de cinta',
  description: () =>
    'La obra está al 90% desde hace dos años. Terminala y cortá la cinta antes de que la inaugure la oposición.',
  minRank: 6,
  requiredCareerItem: 'sello_de_area',
  group: true,
  contested: true,
  durationS: 720,
  capacity: 25,
  autoSpawn: (ctx) => Boolean(ctx.news?.topics.includes('obras')),
  place: (ctx, rng) => {
    const zona = ctx.zones[Math.floor(rng() * ctx.zones.length)];
    if (!zona) return barrioPlacement('centro', 70);
    return {
      barrio: 'centro',
      zoneId: zona.id,
      center: { x: zona.centerX, y: 0, z: zona.centerZ },
      radiusM: zona.radiusM,
      cells: [{ col: Math.round(zona.centerX / CELL_PITCH_M), row: Math.round(zona.centerZ / CELL_PITCH_M) }],
    };
  },
  objectives: (_ctx, p, difficulty) => [
    {
      id: 'obra',
      kind: 'inaugurar',
      label: `Poné los ${Math.round(12 * (0.8 + difficulty * 0.6))} bloques que faltan`,
      target: Math.round(12 * (0.8 + difficulty * 0.6)),
      position: p.center,
      radiusM: p.radiusM as never,
      optional: false,
      weight: 0.7,
    },
    {
      id: 'cinta',
      kind: 'inaugurar',
      label: 'Cortá la cinta con la prensa presente',
      target: 1,
      position: p.center,
      radiusM: 20 as never,
      optional: false,
      weight: 0.3,
      order: 2,
    },
  ],
  onEvent: (event, quest) => {
    if (event.kind !== 'obra_avanzada' || !withinQuest(event, quest)) return null;
    return { objectiveId: event.ref === 'cinta' ? 'cinta' : 'obra', amount: event.amount ?? 1 };
  },
};
