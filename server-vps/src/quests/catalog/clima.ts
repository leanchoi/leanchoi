/**
 * Misión climática: la única que dispara la naturaleza.
 *
 *   TEMPORAL_CORDILLERANO — si la API de clima detecta nieve o helada de verdad
 *   en Esquel, el juego lo sabe: hay que despejar accesos y repartir leña.
 *
 * Es la misión que mejor muestra de qué se trata el proyecto: mientras afuera
 * está nevando, adentro del juego también, y la militancia se mide en leña
 * repartida y no en afiches pegados.
 */

import { BARRIO_BY_ID, CELL_PITCH_M, type Barrio, type Vec3 } from '@esquel/shared';
import type { QuestBlueprint, QuestPlacement } from './types.ts';
import { withinQuest } from './types.ts';

/** Barrios que se complican primero cuando baja la nieve. */
const BARRIOS_CRITICOS: readonly Barrio[] = ['badenes', 'ceferino', 'plan_1000', 'valle_chico'];

const placementFor = (barrio: Barrio): QuestPlacement => {
  const def = BARRIO_BY_ID[barrio];
  const center: Vec3 = { x: def.spawnCell.col * CELL_PITCH_M, y: 0, z: def.spawnCell.row * CELL_PITCH_M };
  return { barrio, center, radiusM: 120, cells: [{ col: def.spawnCell.col, row: def.spawnCell.row }] };
};

export const TEMPORAL_CORDILLERANO: QuestBlueprint = {
  type: 'TEMPORAL_CORDILLERANO',
  slug: 'temporal_cordillerano',
  title: 'Temporal cordillerano',
  description: (ctx, p) => {
    const nieve = ctx.weather === 'nieve' || ctx.weather === 'aguanieve';
    const barrio = BARRIO_BY_ID[p.barrio].name;
    return nieve
      ? `Está cayendo nieve de verdad sobre Esquel. En ${barrio} hay veredas tapadas y gente sin leña. Acá no hay bandos.`
      : `Bajó la helada y el viento no afloja. En ${barrio} necesitan una mano con los accesos y la leña.`;
  },
  minRank: 1,
  group: true,
  contested: false,
  durationS: 600,
  capacity: 50,
  /**
   * Se dispara sola con el clima **real**: nieve, aguanieve, o frío con viento
   * fuerte. No hace falta que un admin la publique: la publica la cordillera.
   */
  autoSpawn: (ctx) =>
    ctx.weather === 'nieve' ||
    ctx.weather === 'aguanieve' ||
    ctx.snowCoverage > 0.35 ||
    (ctx.weather === 'viento_fuerte' && ctx.windGustKph > 70),
  place: (_ctx, rng) => placementFor(BARRIOS_CRITICOS[Math.floor(rng() * BARRIOS_CRITICOS.length)] ?? 'badenes'),
  objectives: (ctx, p, difficulty) => {
    const escala = 0.8 + difficulty * 0.6;
    const objetivos = [
      {
        id: 'lenia',
        kind: 'entregar' as const,
        label: `Repartí ${Math.round(20 * escala)} cargas de leña`,
        target: Math.round(20 * escala),
        position: p.center,
        radiusM: p.radiusM as never,
        optional: false,
        weight: 0.55,
      },
      {
        id: 'despejar',
        kind: 'despejar' as const,
        label: `Despejá ${Math.round(6 * escala)} veredas`,
        target: Math.round(6 * escala),
        position: p.center,
        radiusM: p.radiusM as never,
        optional: false,
        weight: 0.45,
      },
    ];
    // Con nieve pesada, además hay que abrir el acceso principal del barrio.
    if (ctx.snowCoverage > 0.6) {
      objetivos.push({
        id: 'acceso',
        kind: 'despejar' as const,
        label: 'Abrí el acceso principal del barrio',
        target: 3,
        position: p.center,
        radiusM: 40 as never,
        optional: true,
        weight: 0.15,
      });
    }
    return objetivos;
  },
  onEvent: (event, quest) => {
    if (!withinQuest(event, quest)) return null;
    if (event.kind === 'lenia_entregada') return { objectiveId: 'lenia', amount: event.amount ?? 1 };
    if (event.kind === 'vereda_despejada') return { objectiveId: 'despejar', amount: event.amount ?? 1 };
    return null;
  },
};
