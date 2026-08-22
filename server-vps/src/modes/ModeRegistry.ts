/**
 * Dualidad de modos: Candidato y Ciudadano.
 *
 * El **Modo Ciudadano** es el MMO: la calle, la carrera militante, los duelos y
 * el territorio. Es lo que corre en `EsquelCityRoom`.
 *
 * El **Modo Candidato** es la campaña de un jugador: una partida de dilemas
 * donde se manejan cuatro variables (caja, rosca, imagen y escándalo). Se juega
 * en el cliente porque es determinista y no necesita al resto del shard, pero el
 * servidor la valida y la persiste: si la campaña otorgara XP sin control, sería
 * la forma más fácil de hacer trampa.
 *
 * Este registro es el que decide qué puede hacer cada jugador según el modo con
 * el que entró, y el que sella el resultado de una campaña antes de guardarla.
 */

import { canDo, unlockedItems, type CareerAbility, type GameMode, type RankLevel } from '@esquel/shared';

/** Resultado de una partida del Modo Candidato, tal como lo manda el cliente. */
export interface CampaignResult {
  readonly archetype: 'oficialista' | 'outsider' | 'caudillo';
  /** Semilla de la partida: permite rejugar la misma campaña y verificarla. */
  readonly seed: number;
  /** Dilemas resueltos, en orden. */
  readonly decisions: readonly { readonly cardId: string; readonly optionId: string }[];
  readonly finalStats: {
    readonly cajaCampana: number;
    readonly roscaPolitica: number;
    readonly imagenPublica: number;
    readonly nivelEscandalo: number;
  };
  readonly ending: string;
  readonly turnsPlayed: number;
}

/** Lo que la campaña deja en el personaje del MMO. */
export interface CampaignPayout {
  readonly xp: number;
  readonly reputation: number;
  readonly money: number;
  readonly text: string;
}

/** Tope de lo que puede rendir una campaña, para que no reemplace a la calle. */
const CAMPAIGN_XP_CAP = 1800;
const CAMPAIGN_MONEY_CAP = 400_000;

export class ModeRegistry {
  /** Modo activo de cada sesión. */
  private readonly modes = new Map<string, GameMode>();

  set(sessionId: string, mode: GameMode): void {
    this.modes.set(sessionId, mode);
  }

  get(sessionId: string): GameMode {
    return this.modes.get(sessionId) ?? 'ciudadano';
  }

  remove(sessionId: string): void {
    this.modes.delete(sessionId);
  }

  /**
   * ¿Puede hacer esto? Depende del modo y del rango.
   *
   * En Modo Candidato el jugador no está en la calle: no pega afiches, no
   * controla esquinas ni desafía a nadie. Lo suyo es la campaña.
   */
  can(sessionId: string, rankTier: RankLevel, ability: CareerAbility): { ok: true } | { ok: false; error: string } {
    const mode = this.get(sessionId);
    if (mode === 'candidato') {
      return { ok: false, error: 'Estás en Modo Candidato: para eso, volvé a la calle.' };
    }
    if (!canDo(rankTier, ability)) {
      return { ok: false, error: `Todavía no tenés rango para eso. Seguí caminando el barrio.` };
    }
    return { ok: true };
  }

  /** Herramientas desbloqueadas, para validar los requisitos de las misiones. */
  careerItems(rankTier: RankLevel): string[] {
    return unlockedItems(rankTier);
  }

  /**
   * Valida y liquida una campaña del Modo Candidato.
   *
   * El servidor no re-simula la partida entera (sería caro y el cliente es
   * determinista), pero sí verifica que los números cierren: cantidad de
   * decisiones plausible, stats dentro de rango y recompensa con techo. Con eso
   * alcanza para que la campaña no sea una máquina de imprimir XP.
   */
  settleCampaign(result: CampaignResult, rankTier: RankLevel): { ok: true; payout: CampaignPayout } | { ok: false; error: string } {
    if (result.turnsPlayed < 5 || result.turnsPlayed > 60) {
      return { ok: false, error: 'La campaña no tiene una duración creíble.' };
    }
    if (result.decisions.length !== result.turnsPlayed) {
      return { ok: false, error: 'Las decisiones no coinciden con los turnos jugados.' };
    }

    const { cajaCampana, roscaPolitica, imagenPublica, nivelEscandalo } = result.finalStats;
    const enRango = [cajaCampana, roscaPolitica, imagenPublica, nivelEscandalo].every(
      (v) => Number.isFinite(v) && v >= 0 && v <= 100,
    );
    if (!enRango) return { ok: false, error: 'Los indicadores de campaña están fuera de rango.' };

    // Rinde la imagen y la rosca; el escándalo descuenta. Una campaña impecable
    // rinde como una tarde buena de militancia, no como una semana.
    const desempeño = Math.max(0, imagenPublica * 0.5 + roscaPolitica * 0.3 + cajaCampana * 0.2 - nivelEscandalo * 0.35) / 100;
    const escala = 0.6 + Math.min(1, result.turnsPlayed / 30) * 0.4;

    const payout: CampaignPayout = {
      xp: Math.round(Math.min(CAMPAIGN_XP_CAP, CAMPAIGN_XP_CAP * desempeño * escala)),
      reputation: Math.round((imagenPublica - nivelEscandalo) / 10),
      money: Math.round(Math.min(CAMPAIGN_MONEY_CAP, CAMPAIGN_MONEY_CAP * desempeño)),
      text:
        nivelEscandalo > 70
          ? 'Terminaste la campaña con el tarifazo de escándalos encima. Igual algo aprendiste.'
          : desempeño > 0.6
            ? 'Cerraste una campaña de manual. En el comité te miran distinto.'
            : 'Campaña despareja, pero llegaste al final.',
    };

    // Un chopanero no puede sacar de una campaña lo que sacaría un candidato.
    const techoPorRango = 0.4 + rankTier * 0.06;
    return {
      ok: true,
      payout: {
        ...payout,
        xp: Math.round(payout.xp * techoPorRango),
        money: Math.round(payout.money * techoPorRango),
      },
    };
  }
}
