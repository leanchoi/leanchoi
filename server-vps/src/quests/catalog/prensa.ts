/**
 * Misiones de prensa y territorio blando: las que se ganan hablando.
 *
 *   OPERACION_DESMENTIDA  tres duelos ganados en el Centro tras un escándalo
 *   CONFERENCIA_PRENSA    cinco preguntas sin perder la credibilidad
 *   SONDEO_VECINAL        ocho encuestas puerta a puerta
 */

import { BARRIO_DEFS, CELL_PITCH_M, type Barrio, type Vec3 } from '@esquel/shared';
import type { QuestBlueprint, QuestPlacement } from './types.ts';
import { withinQuest } from './types.ts';

const CENTRO: QuestPlacement = {
  barrio: 'centro',
  center: { x: 0, y: 0, z: 0 },
  radiusM: 240,
  cells: [
    { col: 0, row: 0 },
    { col: 0, row: -1 },
    { col: -1, row: 0 },
  ],
};

const barrioAlAzar = (rng: () => number): QuestPlacement => {
  const candidatos = BARRIO_DEFS.filter((b) => b.id !== 'otro');
  const barrio = candidatos[Math.floor(rng() * candidatos.length)] ?? candidatos[0];
  const center: Vec3 = {
    x: (barrio?.spawnCell.col ?? 0) * CELL_PITCH_M,
    y: 0,
    z: (barrio?.spawnCell.row ?? 0) * CELL_PITCH_M,
  };
  return { barrio: (barrio?.id ?? 'centro') as Barrio, center, radiusM: 110, cells: [] };
};

export const OPERACION_DESMENTIDA: QuestBlueprint = {
  type: 'OPERACION_DESMENTIDA',
  slug: 'operacion_desmentida',
  title: 'Operación desmentida',
  description: (ctx) =>
    ctx.news
      ? `Salió "${ctx.news.headline}" y hay que salir a bancar los trapos. Tres duelos en el Centro, y ganados.`
      : 'Se armó un quilombo mediático. Salí a discutir al Centro y no vuelvas sin tres victorias.',
  minRank: 3,
  group: false,
  contested: true,
  durationS: 900,
  capacity: 0,
  autoSpawn: (ctx) => Boolean(ctx.news && ctx.news.sentiment < -0.3 && ctx.news.salience > 0.5),
  place: () => CENTRO,
  objectives: (_ctx, _p, difficulty) => [
    {
      id: 'duelos',
      kind: 'ganar_duelo',
      label: `Ganá ${difficulty > 0.7 ? 4 : 3} duelos de chicanas en el Centro`,
      target: difficulty > 0.7 ? 4 : 3,
      position: CENTRO.center,
      radiusM: CENTRO.radiusM as never,
      optional: false,
      weight: 1,
    },
  ],
  onEvent: (event, quest) => {
    if (event.kind !== 'duelo_ganado' || !withinQuest(event, quest)) return null;
    return { objectiveId: 'duelos', amount: 1 };
  },
};

export const CONFERENCIA_PRENSA: QuestBlueprint = {
  type: 'CONFERENCIA_PRENSA',
  slug: 'conferencia_prensa',
  title: 'Conferencia de prensa',
  description: () =>
    'Cinco preguntas, cinco. Los periodistas ya saben dónde apretar; vos tratá de no bajar del 50% de credibilidad.',
  minRank: 5,
  requiredCareerItem: 'credencial_concejo',
  group: false,
  contested: false,
  durationS: 240,
  capacity: 1,
  autoSpawn: (ctx) => Boolean(ctx.news && ctx.news.salience > 0.4) || ctx.electionPhase === 'OFFICIAL_CAMPAIGN',
  place: () => ({
    barrio: 'centro',
    zoneId: 'zone:explanada-municipalidad',
    center: { x: -62, y: 0, z: 0 },
    radiusM: 42,
    cells: [{ col: -1, row: 0 }],
  }),
  objectives: (_ctx, p) => [
    {
      id: 'preguntas',
      kind: 'responder',
      label: 'Contestá las 5 preguntas de la prensa',
      target: 5,
      position: p.center,
      radiusM: p.radiusM as never,
      optional: false,
      weight: 0.75,
    },
    {
      id: 'credibilidad',
      kind: 'evitar',
      label: 'No bajes del 50% de credibilidad',
      target: 1,
      optional: false,
      weight: 0.25,
    },
  ],
  onEvent: (event, quest) => {
    if (!withinQuest(event, quest)) return null;
    if (event.kind === 'pregunta_respondida') return { objectiveId: 'preguntas', amount: 1 };
    if (event.kind === 'credibilidad_baja') return { objectiveId: 'credibilidad', amount: 0, fail: true };
    return null;
  },
};

export const SONDEO_VECINAL: QuestBlueprint = {
  type: 'SONDEO_VECINAL',
  slug: 'sondeo_vecinal',
  title: 'Sondeo vecinal',
  description: (_ctx, p) =>
    `Ocho puertas en ${p.barrio}. La mitad no abre, un tercio te putea y el resto te cuenta la vida entera.`,
  minRank: 1,
  group: false,
  contested: false,
  durationS: 420,
  capacity: 0,
  autoSpawn: (ctx) => ctx.localHour >= 10 && ctx.localHour <= 20,
  place: (_ctx, rng) => barrioAlAzar(rng),
  objectives: (_ctx, p) => [
    {
      id: 'encuestas',
      kind: 'encuestar',
      label: 'Completá 8 encuestas puerta a puerta',
      target: 8,
      position: p.center,
      radiusM: p.radiusM as never,
      optional: false,
      weight: 0.85,
    },
    {
      id: 'cobertura',
      kind: 'encuestar',
      label: 'Cubrí al menos 3 manzanas distintas',
      target: 3,
      optional: true,
      weight: 0.15,
    },
  ],
  onEvent: (event, quest) => {
    if (event.kind !== 'encuesta_completada' || !withinQuest(event, quest)) return null;
    return { objectiveId: 'encuestas', amount: 1 };
  },
};
