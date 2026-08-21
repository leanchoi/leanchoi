/**
 * Esquel 2027 — Facciones jugables (semilla).
 *
 * POLÍTICA EDITORIAL (vinculante para todas las fases):
 *  - Las facciones son FICCIONALES. No usan el nombre, la sigla, el logo ni los
 *    colores registrados de partidos reales.
 *  - Los personajes satirizados son COMPUESTOS ficticios asociados a un CARGO
 *    (`el Intendente`, `la Concejala`), no a personas reales identificables.
 *  - La sátira apunta a prácticas políticas, nunca a atributos personales,
 *    familiares o de salud de individuos reales.
 *  - `/docs/game-design/politica-editorial.md` detalla el proceso de moderación
 *    y el canal de reclamo. Toda carta o misión nueva pasa por ese filtro.
 */

import type { FactionId } from '../types/common.ts';

export interface FactionDefinition {
  readonly id: FactionId;
  readonly slug: string;
  readonly name: string;
  readonly shortName: string;
  readonly motto: string;
  readonly colorPrimary: string;
  readonly colorSecondary: string;
  /** Bonus pasivo de la facción (multiplicadores sobre el balance base). */
  readonly perks: {
    readonly questXp: number;
    readonly debateRhetoric: number;
    readonly debateCredibility: number;
    readonly territoryHold: number;
    readonly stipend: number;
  };
  /** Familias de carta con afinidad (+10% de poder). */
  readonly affinity: readonly string[];
  /** Barrios donde arranca con ventaja de control. */
  readonly strongholds: readonly string[];
}

export const FACTIONS: readonly FactionDefinition[] = [
  {
    id: 1 as FactionId,
    slug: 'frente_vecinal_cordillerano',
    name: 'Frente Vecinal Cordillerano',
    shortName: 'FVC',
    motto: 'La montaña primero, el asfalto después.',
    colorPrimary: '#1F6F4A',
    colorSecondary: '#E7D8A1',
    perks: { questXp: 1.05, debateRhetoric: 1.0, debateCredibility: 1.08, territoryHold: 1.1, stipend: 0.95 },
    affinity: ['empatia_vecinal', 'dato_duro'],
    strongholds: ['ceferino', 'badenes'],
  },
  {
    id: 2 as FactionId,
    slug: 'union_del_valle',
    name: 'Unión del Valle',
    shortName: 'UdV',
    motto: 'Gestión, orden y una rotonda nueva.',
    colorPrimary: '#1B4F9C',
    colorSecondary: '#FFFFFF',
    perks: { questXp: 1.0, debateRhetoric: 1.08, debateCredibility: 1.0, territoryHold: 1.05, stipend: 1.1 },
    affinity: ['promesa_inviable', 'invocar_al_lider'],
    strongholds: ['centro', 'bella_vista'],
  },
  {
    id: 3 as FactionId,
    slug: 'movimiento_trochita',
    name: 'Movimiento La Trochita',
    shortName: 'MLT',
    motto: 'Lento, pero llega.',
    colorPrimary: '#8C2F1D',
    colorSecondary: '#F2B441',
    perks: { questXp: 1.12, debateRhetoric: 1.0, debateCredibility: 0.98, territoryHold: 1.0, stipend: 1.0 },
    affinity: ['archivo_historico', 'chicana'],
    strongholds: ['estacion', 'don_bosco'],
  },
  {
    id: 4 as FactionId,
    slug: 'partido_del_viento',
    name: 'Partido del Viento',
    shortName: 'PdV',
    motto: 'Menos oficinas, más motosierra... eléctrica.',
    colorPrimary: '#5B2E90',
    colorSecondary: '#D7C7F2',
    perks: { questXp: 1.0, debateRhetoric: 1.12, debateCredibility: 0.95, territoryHold: 0.95, stipend: 1.15 },
    affinity: ['chicana', 'promesa_inviable'],
    strongholds: ['alta_esquel', 'plan_1000'],
  },
  {
    id: 5 as FactionId,
    slug: 'asamblea_del_agua',
    name: 'Asamblea del Agua',
    shortName: 'AdA',
    motto: 'El agua no se negocia.',
    colorPrimary: '#0E7C86',
    colorSecondary: '#BFF0F2',
    perks: { questXp: 1.08, debateRhetoric: 1.0, debateCredibility: 1.12, territoryHold: 1.08, stipend: 0.85 },
    affinity: ['dato_duro', 'defensa'],
    strongholds: ['zona_norte', 'valle_chico'],
  },
];

export const FACTION_BY_ID: Readonly<Record<number, FactionDefinition>> = Object.freeze(
  FACTIONS.reduce(
    (acc, f) => {
      acc[f.id as unknown as number] = f;
      return acc;
    },
    {} as Record<number, FactionDefinition>,
  ),
);

/** Días de penalización de lealtad al cambiar de facción. */
export const FACTION_SWITCH_COOLDOWN_DAYS = 7;
/** Lealtad a la que queda el personaje tras cambiar de bando. */
export const FACTION_SWITCH_LOYALTY_RESET = 0.15;
