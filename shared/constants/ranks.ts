/**
 * Esquel 2027 — Árbol de Carrera Militante (10 rangos).
 *
 * ESTA TABLA ES LA FUENTE DE VERDAD. `/backend-php/database/seeds/002_rangos.sql`
 * y `/docs/game-design/balance-formulas.md` §2 derivan de acá y deben coincidir
 * exactamente (lo verifica `npm run check:balance`).
 *
 * Curva: ΔXP(n→n+1) = redondear_a_25( 900 · n^1.6 · 1.18^(n-1) )
 * Total a rango 10: 332.450 XP ≈ 121 h de juego efectivo (ver §2.3 del doc).
 */

import type { RankId, RankLevel } from '../types/common.ts';

export interface RankDefinition {
  readonly level: RankLevel;
  readonly id: RankId;
  /** Nombre visible en el HUD. */
  readonly name: string;
  /** Descripción satírica del cargo. */
  readonly blurb: string;
  /** XP necesaria para pasar al rango siguiente (0 en el rango 10). */
  readonly xpToNext: number;
  /** XP acumulada total requerida para ALCANZAR este rango. */
  readonly xpTotal: number;
  /** Reputación mínima para ascender a este rango. */
  readonly reputationRequired: number;
  /** Lealtad mínima a la facción [0,1] para ascender. */
  readonly loyaltyRequired: number;
  /** Multiplicador de XP ganada en todas las fuentes. */
  readonly xpMultiplier: number;
  /** Estipendio diario de campaña, en centavos. */
  readonly dailyStipendCentavos: number;
  /** Peso del jugador en el cálculo de control territorial. */
  readonly territoryWeight: number;
  /** Tope de misiones diarias que otorgan recompensa completa. */
  readonly dailyQuestCap: number;
  /** Rareza máxima de carta de debate que puede llevar en el mazo. */
  readonly maxCardRarity: 'comun' | 'infrecuente' | 'rara' | 'epica' | 'mitica';
  /** Funciones desbloqueadas al alcanzar el rango. */
  readonly unlocks: readonly string[];
}

export const RANKS: readonly RankDefinition[] = [
  {
    level: 1,
    id: 'chopanero',
    name: 'Chopanero',
    blurb: 'Cargás las sillas, servís el choripán y aprendés quién es quién en la unidad básica.',
    xpToNext: 900,
    xpTotal: 0,
    reputationRequired: 0,
    loyaltyRequired: 0,
    xpMultiplier: 1.0,
    dailyStipendCentavos: 0,
    territoryWeight: 1.0,
    dailyQuestCap: 8,
    maxCardRarity: 'comun',
    unlocks: ['misiones_basicas', 'chat_local', 'inventario'],
  },
  {
    level: 2,
    id: 'soldado',
    name: 'Soldado',
    blurb: 'Pegás afiches de madrugada y ya te reconocen en dos esquinas del barrio.',
    xpToNext: 3225,
    xpTotal: 900,
    reputationRequired: 30,
    loyaltyRequired: 0.35,
    xpMultiplier: 1.06,
    dailyStipendCentavos: 15000,
    territoryWeight: 1.3,
    dailyQuestCap: 10,
    maxCardRarity: 'comun',
    unlocks: ['duelos_debate', 'mazo_personalizado', 'voz_espacial'],
  },
  {
    level: 3,
    id: 'puntero',
    name: 'Puntero',
    blurb: 'Manejás una cuadra, dos grupos de WhatsApp y la lista de los que van al acto.',
    xpToNext: 7275,
    xpTotal: 4125,
    reputationRequired: 69,
    loyaltyRequired: 0.4,
    xpMultiplier: 1.12,
    dailyStipendCentavos: 21800,
    territoryWeight: 1.6,
    dailyQuestCap: 12,
    maxCardRarity: 'infrecuente',
    unlocks: ['convocar_movilizacion', 'reclutar_militantes', 'misiones_grupales'],
  },
  {
    level: 4,
    id: 'mano_derecha',
    name: 'Mano Derecha',
    blurb: 'Le llevás el mate al jefe y, de paso, la agenda. Sabés cosas que no se escriben.',
    xpToNext: 13600,
    xpTotal: 11400,
    reputationRequired: 112,
    loyaltyRequired: 0.45,
    xpMultiplier: 1.18,
    dailyStipendCentavos: 31500,
    territoryWeight: 1.9,
    dailyQuestCap: 12,
    maxCardRarity: 'infrecuente',
    unlocks: ['acceso_archivo_historico', 'negociar_apoyos', 'chat_faccion'],
  },
  {
    level: 5,
    id: 'concejal',
    name: 'Concejal',
    blurb: 'Bancás una banca. Ahora te filman cuando dormís en sesión.',
    xpToNext: 22925,
    xpTotal: 25000,
    reputationRequired: 158,
    loyaltyRequired: 0.5,
    xpMultiplier: 1.24,
    dailyStipendCentavos: 45700,
    territoryWeight: 2.2,
    dailyQuestCap: 14,
    maxCardRarity: 'rara',
    unlocks: ['debates_en_concejo', 'presentar_proyectos', 'oficina_propia'],
  },
  {
    level: 6,
    id: 'director',
    name: 'Director',
    blurb: 'Dirección de algo. Nadie sabe bien de qué, pero tenés sello y camioneta.',
    xpToNext: 36200,
    xpTotal: 47925,
    reputationRequired: 207,
    loyaltyRequired: 0.55,
    xpMultiplier: 1.3,
    dailyStipendCentavos: 66300,
    territoryWeight: 2.5,
    dailyQuestCap: 14,
    maxCardRarity: 'rara',
    unlocks: ['asignar_recursos', 'contratar_npc', 'obras_menores'],
  },
  {
    level: 7,
    id: 'subsecretario',
    name: 'Subsecretario',
    blurb: 'Firmás expedientes que nadie lee y cortás cintas que nadie recuerda.',
    xpToNext: 54675,
    xpTotal: 84125,
    reputationRequired: 258,
    loyaltyRequired: 0.6,
    xpMultiplier: 1.36,
    dailyStipendCentavos: 96100,
    territoryWeight: 2.8,
    dailyQuestCap: 16,
    maxCardRarity: 'epica',
    unlocks: ['anuncios_publicos', 'sponsor_deals', 'movilizacion_ampliada'],
  },
  {
    level: 8,
    id: 'secretario',
    name: 'Secretario',
    blurb: 'Tenés área, presupuesto y enemigos internos. Los tres crecen juntos.',
    xpToNext: 79875,
    xpTotal: 138800,
    reputationRequired: 310,
    loyaltyRequired: 0.65,
    xpMultiplier: 1.42,
    dailyStipendCentavos: 139400,
    territoryWeight: 3.1,
    dailyQuestCap: 16,
    maxCardRarity: 'epica',
    unlocks: ['conferencia_prensa', 'vetar_mision_rival', 'caja_de_campania'],
  },
  {
    level: 9,
    id: 'viceministro',
    name: 'Viceministro',
    blurb: 'Viajás a Rawson una vez por semana y volvés hablando de "la provincia".',
    xpToNext: 113775,
    xpTotal: 218675,
    reputationRequired: 364,
    loyaltyRequired: 0.7,
    xpMultiplier: 1.48,
    dailyStipendCentavos: 202100,
    territoryWeight: 3.4,
    dailyQuestCap: 18,
    maxCardRarity: 'mitica',
    unlocks: ['alianzas_interfaccion', 'spot_televisivo', 'territorio_provincial'],
  },
  {
    level: 10,
    id: 'candidato_provincial',
    name: 'Candidato Provincial',
    blurb: 'Tu cara está en el afiche. Ya no pegás afiches: los mandás a pegar.',
    xpToNext: 0,
    xpTotal: 332450,
    reputationRequired: 419,
    loyaltyRequired: 0.75,
    xpMultiplier: 1.54,
    dailyStipendCentavos: 293100,
    territoryWeight: 3.7,
    dailyQuestCap: 20,
    maxCardRarity: 'mitica',
    unlocks: ['campania_provincial', 'debate_estelar', 'prestigio_reinicio'],
  },
] as const;

/** Acceso O(1) por nivel. */
export const RANK_BY_LEVEL: Readonly<Record<RankLevel, RankDefinition>> = Object.freeze(
  RANKS.reduce(
    (acc, r) => {
      acc[r.level] = r;
      return acc;
    },
    {} as Record<RankLevel, RankDefinition>,
  ),
);

/** Acceso O(1) por slug. */
export const RANK_BY_ID: Readonly<Record<RankId, RankDefinition>> = Object.freeze(
  RANKS.reduce(
    (acc, r) => {
      acc[r.id] = r;
      return acc;
    },
    {} as Record<RankId, RankDefinition>,
  ),
);

/** Umbrales acumulados, ordenados: usado por la búsqueda binaria de `rankFromXp`. */
export const RANK_XP_THRESHOLDS: readonly number[] = RANKS.map((r) => r.xpTotal);

export const MAX_RANK_LEVEL: RankLevel = 10;
