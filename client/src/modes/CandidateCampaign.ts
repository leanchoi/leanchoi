/**
 * Modo Candidato — la campaña satírica de un jugador.
 *
 * Una partida corta de decisiones: te cae un dilema, elegís, y las cuatro
 * variables se mueven. No hay respuesta correcta; hay costos.
 *
 *   cajaCampana     la guita para operar
 *   roscaPolitica   el apoyo de punteros y concejales
 *   imagenPublica   cómo te ven en los barrios
 *   nivelEscandalo  cuánto le falta al carpetazo para explotar
 *
 * Tres arquetipos con números asimétricos, que se juegan distinto:
 *
 *   El Oficialista Eterno   caja y rosca de sobra, imagen gastada
 *   El Outsider Mesiánico   imagen y viralidad, cero rosca, propenso al quilombo
 *   El Caudillo Barrial     manda en la periferia, le falta plata
 *
 * Es determinista: con la misma semilla y las mismas decisiones sale la misma
 * partida. Por eso el servidor puede validar el resultado sin re-simular todo
 * (`ModeRegistry.settleCampaign`).
 */

import { createRng, type Rng } from '@esquel/shared';
import { ARCHETYPE_DILEMMAS, DILEMMAS, type Dilemma, type DilemmaOption } from './dilemmas.ts';

export type ArchetypeId = 'oficialista' | 'outsider' | 'caudillo';

export interface Archetype {
  readonly id: ArchetypeId;
  readonly name: string;
  readonly tagline: string;
  readonly description: string;
  readonly start: CampaignStats;
  /** Multiplicadores sobre lo que gana o pierde en cada variable. */
  readonly modifiers: { caja: number; rosca: number; imagen: number; escandalo: number };
}

export interface CampaignStats {
  cajaCampana: number;
  roscaPolitica: number;
  imagenPublica: number;
  nivelEscandalo: number;
}

export const ARCHETYPES: readonly Archetype[] = [
  {
    id: 'oficialista',
    name: 'El Oficialista Eterno',
    tagline: 'Dos mandatos, tres inauguraciones de la misma obra.',
    description:
      'Tenés la caja, tenés los punteros y tenés ocho años de fotos que te van a tirar por la cabeza en cada acto.',
    start: { cajaCampana: 72, roscaPolitica: 78, imagenPublica: 34, nivelEscandalo: 30 },
    modifiers: { caja: 1.15, rosca: 1.2, imagen: 0.85, escandalo: 1.1 },
  },
  {
    id: 'outsider',
    name: 'El Outsider Mesiánico',
    tagline: 'Vengo a romper todo. Todavía no sé con qué.',
    description:
      'La gente te quiere y te comparte, pero no tenés un solo concejal que te atienda el teléfono. Y hablás de más.',
    start: { cajaCampana: 30, roscaPolitica: 12, imagenPublica: 76, nivelEscandalo: 20 },
    modifiers: { caja: 0.85, rosca: 0.7, imagen: 1.25, escandalo: 1.35 },
  },
  {
    id: 'caudillo',
    name: 'El Caudillo Barrial',
    tagline: 'En el Badén te votan hasta los perros.',
    description:
      'Manejás la periferia como nadie, pero en el centro no te registran y la plata nunca alcanza.',
    start: { cajaCampana: 34, roscaPolitica: 58, imagenPublica: 52, nivelEscandalo: 18 },
    modifiers: { caja: 0.8, rosca: 1.1, imagen: 1.0, escandalo: 0.9 },
  },
];

export const ARCHETYPE_BY_ID: Readonly<Record<ArchetypeId, Archetype>> = Object.freeze(
  ARCHETYPES.reduce(
    (acc, a) => {
      acc[a.id] = a;
      return acc;
    },
    {} as Record<ArchetypeId, Archetype>,
  ),
);

export interface CampaignTurn {
  readonly turn: number;
  readonly dilemma: Dilemma;
  readonly options: readonly DilemmaOption[];
}

export interface CampaignSnapshot {
  readonly stats: CampaignStats;
  readonly turn: number;
  readonly maxTurns: number;
  readonly finished: boolean;
  readonly ending?: CampaignEnding;
  readonly history: readonly { readonly dilemma: string; readonly option: string; readonly outcome: string }[];
}

export interface CampaignEnding {
  readonly id: string;
  readonly title: string;
  readonly text: string;
  /** `true` si ganó la elección dentro de la ficción de la campaña. */
  readonly won: boolean;
}

/** Turnos de una campaña: doce dilemas, del arranque al cierre. */
export const CAMPAIGN_TURNS = 12;

/** Cuándo se te cae la campaña encima. */
const ESCANDALO_FATAL = 92;

export class CandidateCampaign {
  readonly archetype: Archetype;
  readonly seed: number;
  private readonly rng: Rng;
  private readonly deck: Dilemma[];
  private stats: CampaignStats;
  private turn = 0;
  private finished = false;
  private ending: CampaignEnding | undefined;
  private readonly history: { dilemma: string; option: string; outcome: string }[] = [];
  private readonly decisions: { cardId: string; optionId: string }[] = [];

  constructor(archetypeId: ArchetypeId, seed = Math.floor(Math.random() * 0xffffff)) {
    this.archetype = ARCHETYPE_BY_ID[archetypeId];
    this.seed = seed;
    this.rng = createRng(seed);
    this.stats = { ...this.archetype.start };

    // El mazo mezcla los dilemas comunes con los propios del arquetipo.
    const propios = ARCHETYPE_DILEMMAS.filter((d) => d.options.some((o) => o.onlyFor === archetypeId));
    this.deck = this.rng.shuffle([...DILEMMAS, ...propios]);
  }

  /** Dilema de este turno, con las opciones que corresponden al arquetipo. */
  current(): CampaignTurn | null {
    if (this.finished) return null;
    const dilema = this.deck.find(
      (d, i) => i >= this.turn && (d.minTurn === undefined || this.turn + 1 >= d.minTurn),
    ) ?? this.deck[this.turn % this.deck.length];
    if (!dilema) return null;

    return {
      turn: this.turn + 1,
      dilemma: dilema,
      options: dilema.options.filter((o) => !o.onlyFor || o.onlyFor === this.archetype.id),
    };
  }

  /** Resuelve el turno. Devuelve el texto de lo que pasó. */
  choose(optionId: string): { ok: true; outcome: string; snapshot: CampaignSnapshot } | { ok: false; error: string } {
    const actual = this.current();
    if (!actual) return { ok: false, error: 'La campaña ya terminó.' };

    const opcion = actual.options.find((o) => o.id === optionId);
    if (!opcion) return { ok: false, error: 'Esa opción no está sobre la mesa.' };

    const m = this.archetype.modifiers;
    const aplicar = (valor: number, delta: number | undefined, mult: number): number =>
      Math.max(0, Math.min(100, Math.round(valor + (delta ?? 0) * mult)));

    this.stats = {
      cajaCampana: aplicar(this.stats.cajaCampana, opcion.effects.caja, m.caja),
      roscaPolitica: aplicar(this.stats.roscaPolitica, opcion.effects.rosca, m.rosca),
      imagenPublica: aplicar(this.stats.imagenPublica, opcion.effects.imagen, m.imagen),
      nivelEscandalo: aplicar(this.stats.nivelEscandalo, opcion.effects.escandalo, m.escandalo),
    };

    // El desgaste de campaña: la caja se gasta sola y el escándalo se enfría solo.
    this.stats.cajaCampana = Math.max(0, this.stats.cajaCampana - 2);
    this.stats.nivelEscandalo = Math.max(0, this.stats.nivelEscandalo - 1);

    this.history.push({ dilemma: actual.dilemma.title, option: opcion.label, outcome: opcion.outcome });
    this.decisions.push({ cardId: actual.dilemma.id, optionId: opcion.id });
    this.turn += 1;

    if (this.stats.nivelEscandalo >= ESCANDALO_FATAL) {
      this.finish(this.buildEnding('carpetazo'));
    } else if (this.turn >= CAMPAIGN_TURNS) {
      this.finish(this.buildEnding('cierre'));
    }

    return { ok: true, outcome: opcion.outcome, snapshot: this.snapshot() };
  }

  private finish(ending: CampaignEnding): void {
    this.finished = true;
    this.ending = ending;
  }

  /** El final depende de las cuatro variables, no de una sola. */
  private buildEnding(motivo: 'carpetazo' | 'cierre'): CampaignEnding {
    const { cajaCampana, roscaPolitica, imagenPublica, nivelEscandalo } = this.stats;

    if (motivo === 'carpetazo') {
      return {
        id: 'carpetazo',
        title: 'Te explotó la carpeta',
        text: 'Salió todo junto y a una semana de la elección. El comité apagó las luces y nadie atiende el teléfono.',
        won: false,
      };
    }

    const puntaje = imagenPublica * 0.45 + roscaPolitica * 0.3 + cajaCampana * 0.15 - nivelEscandalo * 0.3;

    if (puntaje >= 55) {
      return {
        id: 'victoria',
        title: 'Ganaste',
        text: 'Festejo en la plaza, bombos hasta las tres de la mañana y una fila de gente que ahora es amiga tuya de toda la vida.',
        won: true,
      };
    }
    if (puntaje >= 38) {
      return {
        id: 'ballotage',
        title: 'Segunda vuelta',
        text: 'Quedaste a tiro. Ahora empieza la parte fea: negociar con los que puteabas.',
        won: false,
      };
    }
    if (roscaPolitica > 65) {
      return {
        id: 'aparato',
        title: 'Perdiste, pero con aparato',
        text: 'No te alcanzó, pero manejás la estructura. En cuatro años volvés y todos lo saben.',
        won: false,
      };
    }
    return {
      id: 'derrota',
      title: 'Se terminó',
      text: 'Cuarto puesto y una deuda con el imprentero. Igual te van a seguir diciendo "candidato" en la panadería.',
      won: false,
    };
  }

  snapshot(): CampaignSnapshot {
    return {
      stats: { ...this.stats },
      turn: this.turn,
      maxTurns: CAMPAIGN_TURNS,
      finished: this.finished,
      ...(this.ending ? { ending: this.ending } : {}),
      history: [...this.history],
    };
  }

  /** Payload que se manda al servidor para que lo valide y lo liquide. */
  result(): {
    archetype: ArchetypeId;
    seed: number;
    decisions: readonly { cardId: string; optionId: string }[];
    finalStats: CampaignStats;
    ending: string;
    turnsPlayed: number;
  } {
    return {
      archetype: this.archetype.id,
      seed: this.seed,
      decisions: [...this.decisions],
      finalStats: { ...this.stats },
      ending: this.ending?.id ?? 'sin_final',
      turnsPlayed: this.turn,
    };
  }
}
