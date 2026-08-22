/**
 * Misiones de calle: las que se ganan con las patas.
 *
 *   PEGATINA_RELAMPAGO   quince afiches en una manzana, contra reloj
 *   BANDERAZO_CALLEJERO  cinco militantes con bombo en una esquina
 *   GUERRA_DE_PUNTEROS   desafiar al puntero rival que maneja un comercio
 */

import type { Barrio, GridCell, Vec3 } from '@esquel/shared';
import { BARRIO_DEFS, CELL_PITCH_M } from '@esquel/shared';
import type { QuestBlueprint, QuestContext, QuestPlacement } from './types.ts';
import { withinQuest } from './types.ts';

const cellsAround = (center: Vec3): GridCell[] => [
  { col: Math.round(center.x / CELL_PITCH_M), row: Math.round(center.z / CELL_PITCH_M) },
];

/** Elige una zona de disputa al azar; si no hay, cae al centro. */
const pickZone = (ctx: QuestContext, rng: () => number): QuestPlacement => {
  const zona = ctx.zones[Math.floor(rng() * ctx.zones.length)];
  if (!zona) {
    return { barrio: 'centro', center: { x: 0, y: 0, z: 0 }, radiusM: 60, cells: [{ col: 0, row: 0 }] };
  }
  const center: Vec3 = { x: zona.centerX, y: 0, z: zona.centerZ };
  return { barrio: 'centro', zoneId: zona.id, center, radiusM: zona.radiusM, cells: cellsAround(center) };
};

/** Elige un barrio residencial al azar. */
const pickBarrio = (rng: () => number): QuestPlacement => {
  const candidatos = BARRIO_DEFS.filter((b) => b.id !== 'otro' && b.id !== 'centro');
  const barrio = candidatos[Math.floor(rng() * candidatos.length)] ?? candidatos[0];
  const center: Vec3 = {
    x: (barrio?.spawnCell.col ?? 0) * CELL_PITCH_M,
    y: 0,
    z: (barrio?.spawnCell.row ?? 0) * CELL_PITCH_M,
  };
  return { barrio: (barrio?.id ?? 'centro') as Barrio, center, radiusM: 90, cells: cellsAround(center) };
};

export const PEGATINA_RELAMPAGO: QuestBlueprint = {
  type: 'PEGATINA_RELAMPAGO',
  slug: 'pegatina_relampago',
  title: 'Pegatina relámpago',
  description: (ctx, p) =>
    ctx.news
      ? `Salió "${ctx.news.headline}" y hay que tapar la ciudad antes del mediodía. Balde, afiche y a ${p.barrio}.`
      : 'El comité mandó afiches nuevos y hay que dejarlos pegados antes de que se entere la competencia.',
  minRank: 2,
  requiredCareerItem: 'engrudo_y_rodillo',
  group: false,
  contested: true,
  durationS: 300,
  capacity: 0,
  autoSpawn: (ctx) =>
    ctx.electionPhase === 'OFFICIAL_CAMPAIGN' && ctx.localHour >= 5 && ctx.localHour <= 9,
  place: pickZone,
  objectives: (_ctx, p, difficulty) => [
    {
      id: 'pegar',
      kind: 'pegar',
      label: `Pegá ${Math.round(15 * (0.7 + difficulty * 0.6))} afiches en la manzana`,
      target: Math.round(15 * (0.7 + difficulty * 0.6)),
      position: p.center,
      radiusM: p.radiusM as never,
      optional: false,
      weight: 0.85,
    },
    {
      id: 'sin_testigos',
      kind: 'evitar',
      label: 'Que no te vea ningún militante rival',
      target: 1,
      optional: true,
      weight: 0.15,
    },
  ],
  onEvent: (event, quest) => {
    if (!withinQuest(event, quest)) return null;
    if (event.kind === 'afiche_pegado') return { objectiveId: 'pegar', amount: event.amount ?? 1 };
    if (event.kind === 'visto_por_rival') return { objectiveId: 'sin_testigos', amount: 0, fail: true };
    return null;
  },
};

export const BANDERAZO_CALLEJERO: QuestBlueprint = {
  type: 'BANDERAZO_CALLEJERO',
  slug: 'banderazo_callejero',
  title: 'Banderazo callejero',
  description: (_ctx, p) =>
    `Hay que llenar ${p.zoneId ? 'la esquina' : 'la cuadra'} de bombos y banderas. Cinco militantes, y que se escuche.`,
  minRank: 3,
  requiredCareerItem: 'megafono',
  group: true,
  contested: true,
  durationS: 480,
  capacity: 40,
  autoSpawn: (ctx) => {
    const total = Object.values(ctx.online).reduce((a, b) => a + b, 0);
    return total >= 6 && ctx.localHour >= 17 && ctx.localHour <= 22;
  },
  place: pickZone,
  objectives: (_ctx, p, difficulty) => [
    {
      id: 'concentrar',
      kind: 'concentrar',
      label: `Juntá ${Math.max(5, Math.round(5 * (0.8 + difficulty)))} militantes en la esquina`,
      target: Math.max(5, Math.round(5 * (0.8 + difficulty))),
      position: p.center,
      radiusM: p.radiusM as never,
      optional: false,
      weight: 0.6,
    },
    {
      id: 'aguantar',
      kind: 'permanecer',
      label: 'Aguantá la esquina 3 minutos',
      target: 180,
      position: p.center,
      radiusM: p.radiusM as never,
      optional: false,
      weight: 0.4,
    },
  ],
  onEvent: (event, quest) => {
    if (!withinQuest(event, quest)) return null;
    if (event.kind === 'presencia') return { objectiveId: 'aguantar', amount: event.amount ?? 1 };
    return null;
  },
};

export const GUERRA_DE_PUNTEROS: QuestBlueprint = {
  type: 'GUERRA_DE_PUNTEROS',
  slug: 'guerra_de_punteros',
  title: 'Guerra de punteros',
  description: () =>
    'El puntero del bando de enfrente se hizo fuerte en un comercio del barrio. Andá a discutirle la esquina.',
  minRank: 3,
  group: false,
  contested: true,
  durationS: 420,
  capacity: 0,
  autoSpawn: (ctx) => ctx.zones.some((z) => z.controlledBy !== 0),
  place: (_ctx, rng) => pickBarrio(rng),
  objectives: (_ctx, _p, difficulty) => [
    {
      id: 'ganar',
      kind: 'ganar_duelo',
      label: `Ganale ${difficulty > 0.6 ? 2 : 1} duelo(s) al puntero rival`,
      target: difficulty > 0.6 ? 2 : 1,
      optional: false,
      weight: 1,
    },
  ],
  onEvent: (event, quest) => {
    if (event.kind !== 'duelo_ganado') return null;
    if (!withinQuest(event, quest)) return null;
    return { objectiveId: 'ganar', amount: 1 };
  },
};
