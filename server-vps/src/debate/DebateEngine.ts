/**
 * `DebateEngine` — la autoridad del Duelo de Chicanas.
 *
 * El cliente pide jugar una carta; acá se decide si puede, cuánto duele y qué
 * queda picando para el turno siguiente. Nada de lo que manda el navegador se
 * acepta sin revisar: ni que la carta esté en la mano, ni que le alcance la
 * labia, ni que no esté silenciada, ni que sea su turno.
 *
 * RITMO DEL DUELO
 *   · Un **turno** son las dos jugadas: primero el retador, después el defensor.
 *   · Al cerrar el turno se reparte labia (+3), corren los sangrados y vencen los
 *     estados.
 *   · Máximo 12 turnos. Si nadie cae, gana el que conserva más credibilidad;
 *     si la diferencia es menor al 5%, es empate técnico y los dos quedan mal.
 *
 * Todo el duelo es determinista dado su `seed`: se puede reproducir tirada por
 * tirada para auditar el balance o revisar una denuncia.
 */

import {
  DEBATE,
  buildOutcome,
  createRng,
  initialCredibility,
  initialCrowdFavor,
  initialRhetoric,
  isSilenced,
  playableCards,
  resolveCard,
  tickStatuses,
  toLogEntry,
  type DebateArena,
  type DebateCard,
  type DebateCardSlug,
  type DebateDuel,
  type DebateFamily,
  type DebateSide,
  type DebateView,
  type FactionId,
  type RankLevel,
  type Rng,
  type Unit,
} from '@esquel/shared';
import { CARD_CATALOG, starterDeck } from '@esquel/shared';

/** Lo que el motor necesita saber de cada contendiente. */
export interface DuelistInput {
  readonly charId: string;
  readonly nick: string;
  readonly factionId?: number;
  readonly rankTier: number;
  readonly reputation: number;
  /** Mazo elegido; si no trae uno válido, se le arma el de arranque. */
  readonly deck?: readonly string[];
}

export interface CreateDuelParams {
  readonly id: string;
  readonly arena: DebateArena;
  readonly zoneId?: string;
  readonly challenger: DuelistInput;
  readonly defender: DuelistInput;
  readonly spectators: number;
  readonly pot: number;
  /** Control de cada facción en la zona [0,1]: escala `INVOCAR_AL_LIDER`. */
  readonly zoneControl?: Readonly<Record<number, number>>;
  readonly seed?: number;
  readonly now?: number;
}

export type PlayResult =
  | { readonly ok: true; readonly duel: DebateDuel; readonly finished: boolean }
  | { readonly ok: false; readonly error: string };

const clampRank = (tier: number): RankLevel => Math.max(1, Math.min(10, Math.round(tier))) as RankLevel;

export class DebateEngine {
  private readonly duels = new Map<string, { duel: DebateDuel; rng: Rng; pot: number; zoneControl: Record<number, number> }>();

  /* ------------------------------------------------------------------ */
  /* Creación                                                            */
  /* ------------------------------------------------------------------ */

  create(params: CreateDuelParams): DebateDuel {
    const now = params.now ?? Date.now();
    const seed = params.seed ?? Math.floor(Math.random() * 0xffffffff);
    const rng = createRng(seed);

    const favor = initialCrowdFavor({
      challengerReputation: params.challenger.reputation,
      defenderReputation: params.defender.reputation,
      spectators: params.spectators,
      defenderIsLocal: true,
    });

    const challenger = this.buildSide(params.challenger, favor.challenger, rng);
    const defender = this.buildSide(params.defender, favor.defender, rng);

    const duel: DebateDuel = {
      id: params.id,
      arena: params.arena,
      ...(params.zoneId ? { zoneId: params.zoneId } : {}),
      startedAt: now as never,
      turn: 1,
      maxTurns: DEBATE.MAX_TURNS,
      activeSide: challenger.charId,
      turnEndsAt: (now + DEBATE.TURN_SECONDS * 1000) as never,
      challenger,
      defender,
      seed,
      log: [],
      finished: false,
      spectators: params.spectators,
    };

    this.duels.set(duel.id, {
      duel,
      rng,
      pot: params.pot,
      zoneControl: { ...(params.zoneControl ?? {}) },
    });
    return duel;
  }

  private buildSide(input: DuelistInput, crowdFavor: Unit, rng: Rng): DebateSide {
    const rankTier = clampRank(input.rankTier);
    const deckSlugs = this.resolveDeck(input, rankTier);
    const deck = rng.shuffle(deckSlugs);
    const hand = deck.splice(0, DEBATE.HAND_SIZE);

    return {
      charId: input.charId as never,
      nick: input.nick,
      ...(input.factionId ? { factionId: input.factionId as unknown as FactionId } : {}),
      rankTier,
      credibility: initialCredibility(rankTier, input.reputation),
      credibilityMax: initialCredibility(rankTier, input.reputation),
      labia: DEBATE.LABIA_START,
      labiaMax: DEBATE.LABIA_MAX,
      rhetoric: initialRhetoric(rankTier),
      hand,
      handSize: hand.length,
      deck,
      discard: [],
      statuses: [],
      cooldowns: {},
      crowdFavor,
      liedLastTurn: false,
      abilityBlocked: false,
      timedOut: false,
    };
  }

  /** Usa el mazo del jugador si es legal; si no, el de arranque de su rango. */
  private resolveDeck(input: DuelistInput, rankTier: RankLevel): DebateCardSlug[] {
    const propuesto = (input.deck ?? []).filter((slug) => {
      const card = CARD_CATALOG.get(slug);
      return Boolean(card?.enabled && card.minRank <= rankTier);
    });
    if (propuesto.length === DEBATE.DECK_SIZE) return propuesto as DebateCardSlug[];
    return starterDeck(rankTier);
  }

  /* ------------------------------------------------------------------ */
  /* Consulta                                                            */
  /* ------------------------------------------------------------------ */

  get(duelId: string): DebateDuel | undefined {
    return this.duels.get(duelId)?.duel;
  }

  /** Duelo en el que participa un personaje, si hay alguno abierto. */
  findByChar(charId: string): DebateDuel | undefined {
    for (const { duel } of this.duels.values()) {
      if (!duel.finished && (duel.challenger.charId === charId || duel.defender.charId === charId)) return duel;
    }
    return undefined;
  }

  /** Vista de un duelo para un jugador: la mano del rival va oculta. */
  viewFor(duelId: string, charId: string): DebateView | undefined {
    const entry = this.duels.get(duelId);
    if (!entry) return undefined;
    const { duel } = entry;
    const isChallenger = duel.challenger.charId === charId;
    const mine = isChallenger ? duel.challenger : duel.defender;
    const theirs = isChallenger ? duel.defender : duel.challenger;

    const hide = (side: DebateSide): Omit<DebateSide, 'hand' | 'deck'> => {
      const { hand: _hand, deck: _deck, ...rest } = side;
      return rest;
    };

    return {
      duel: {
        ...duel,
        challenger: isChallenger ? { ...hide(mine), hand: [...mine.hand] } : hide(theirs),
        defender: isChallenger ? hide(theirs) : { ...hide(mine), hand: [...mine.hand] },
      },
      isChallenger,
      playable: duel.activeSide === charId ? (playableCards(mine, CARD_CATALOG) as DebateCardSlug[]) : [],
    };
  }

  /* ------------------------------------------------------------------ */
  /* Jugadas                                                             */
  /* ------------------------------------------------------------------ */

  /** Juega una carta. Devuelve el duelo actualizado o el motivo del rechazo. */
  playCard(duelId: string, charId: string, slug: string, expectedTurn?: number): PlayResult {
    const entry = this.duels.get(duelId);
    if (!entry) return { ok: false, error: 'Ese duelo ya no existe.' };
    const { duel, rng } = entry;

    if (duel.finished) return { ok: false, error: 'El duelo ya terminó.' };
    if (duel.activeSide !== charId) return { ok: false, error: 'No es tu turno.' };
    if (expectedTurn !== undefined && expectedTurn !== duel.turn) {
      return { ok: false, error: 'Llegaste tarde: el turno ya cambió.' };
    }

    const attacker = this.sideOf(duel, charId);
    const defender = this.otherSide(duel, charId);
    if (!attacker || !defender) return { ok: false, error: 'No estás en este duelo.' };

    const card = CARD_CATALOG.get(slug);
    if (!card) return { ok: false, error: 'Esa carta no existe.' };
    if (!attacker.hand.includes(card.slug)) return { ok: false, error: 'No tenés esa carta en la mano.' };
    if (card.cost > attacker.labia) return { ok: false, error: 'No te alcanza la labia.' };
    if ((attacker.cooldowns[card.slug] ?? 0) > 0) return { ok: false, error: 'Esa carta todavía está recargando.' };
    if (isSilenced(attacker, card.family)) return { ok: false, error: `Te silenciaron la familia ${card.family}.` };
    if (attacker.abilityBlocked && card.rarity === 'epica') {
      return { ok: false, error: 'Te rompieron el quórum: sin cartas épicas este turno.' };
    }

    /* --- resolución --- */
    const zoneControl = attacker.abilityBlocked
      ? 0
      : (entry.zoneControl[(attacker.factionId as unknown as number) ?? 0] ?? 0.5);

    const resolution = resolveCard({
      card,
      attacker,
      defender,
      defenderLastFamily: this.lastFamilyOf(duel, defender.charId),
      affinity:
        card.factionAffinity !== undefined &&
        (attacker.factionId as unknown as number) === (card.factionAffinity as unknown as number),
      zoneControl,
      rng,
    });

    /* --- aplicación --- */
    attacker.labia = Math.max(0, attacker.labia - resolution.labiaSpent + resolution.labiaGained);
    attacker.hand = attacker.hand.filter((s) => s !== card.slug);
    attacker.discard.push(card.slug);
    attacker.handSize = attacker.hand.length;
    if (card.cooldown > 0) attacker.cooldowns[card.slug] = card.cooldown + 1;

    if (resolution.hit) {
      defender.credibility = Math.max(0, defender.credibility - resolution.damage);
      attacker.credibility = Math.min(attacker.credibilityMax, attacker.credibility + resolution.heal);
      if (resolution.labiaStolen > 0) {
        const robada = Math.min(resolution.labiaStolen, defender.labia);
        defender.labia -= robada;
        attacker.labia = Math.min(attacker.labiaMax, attacker.labia + robada);
      }
      for (const effect of resolution.selfStatuses) {
        attacker.statuses.push({ kind: effect.kind, value: effect.value, turnsLeft: effect.turns, ...(effect.family ? { family: effect.family } : {}) });
      }
      for (const effect of resolution.enemyStatuses) {
        defender.statuses.push({ kind: effect.kind, value: effect.value, turnsLeft: effect.turns, ...(effect.family ? { family: effect.family } : {}) });
      }
      if (resolution.blocksAbility) defender.abilityBlocked = true;
      // La promesa te levanta pero te deja marcado: el carpetazo espera.
      attacker.liedLastTurn = resolution.liar;
    } else {
      attacker.credibility = Math.max(0, attacker.credibility - resolution.selfDamage);
    }

    // El favor del público es un juego de suma cero.
    const nuevoFavor = Math.max(0.05, Math.min(0.95, attacker.crowdFavor + resolution.crowdDelta));
    attacker.crowdFavor = nuevoFavor as Unit;
    defender.crowdFavor = (1 - nuevoFavor) as Unit;

    duel.log.push(
      toLogEntry({ turn: duel.turn, actor: attacker.charId, card, resolution, at: Date.now() as never }),
    );

    return this.afterAction(entry, attacker, defender);
  }

  /** Pasar: no jugás nada y recuperás labia de más. A veces conviene. */
  pass(duelId: string, charId: string): PlayResult {
    const entry = this.duels.get(duelId);
    if (!entry) return { ok: false, error: 'Ese duelo ya no existe.' };
    const { duel } = entry;
    if (duel.finished) return { ok: false, error: 'El duelo ya terminó.' };
    if (duel.activeSide !== charId) return { ok: false, error: 'No es tu turno.' };

    const actor = this.sideOf(duel, charId);
    const other = this.otherSide(duel, charId);
    if (!actor || !other) return { ok: false, error: 'No estás en este duelo.' };

    actor.labia = Math.min(actor.labiaMax, actor.labia + DEBATE.LABIA_PASS_BONUS);
    actor.liedLastTurn = false;
    duel.log.push(
      toLogEntry({
        turn: duel.turn,
        actor: actor.charId,
        card: null,
        resolution: null,
        at: Date.now() as never,
        text: 'Se guardó la carta, tomó agua y dejó pasar el turno.',
      }),
    );

    return this.afterAction(entry, actor, other);
  }

  /** El que se va antes de tiempo pierde y encima paga con reputación. */
  forfeit(duelId: string, charId: string, reason: 'abandono' | 'desconexion' = 'abandono'): PlayResult {
    const entry = this.duels.get(duelId);
    if (!entry) return { ok: false, error: 'Ese duelo ya no existe.' };
    const { duel } = entry;
    if (duel.finished) return { ok: true, duel, finished: true };

    const quitter = this.sideOf(duel, charId);
    const winner = this.otherSide(duel, charId);
    if (!quitter || !winner) return { ok: false, error: 'No estás en este duelo.' };

    this.finish(entry, winner, quitter, reason);
    return { ok: true, duel, finished: true };
  }

  /** Se le acabaron los 30 segundos: pasa solo. */
  checkTimeout(duelId: string, now = Date.now()): PlayResult | null {
    const entry = this.duels.get(duelId);
    if (!entry || entry.duel.finished) return null;
    if (now < entry.duel.turnEndsAt) return null;
    const actor = this.sideOf(entry.duel, entry.duel.activeSide);
    if (actor) actor.timedOut = true;
    return this.pass(duelId, entry.duel.activeSide);
  }

  /* ------------------------------------------------------------------ */
  /* Fin de acción y de turno                                            */
  /* ------------------------------------------------------------------ */

  private afterAction(
    entry: { duel: DebateDuel; rng: Rng; pot: number; zoneControl: Record<number, number> },
    actor: DebateSide,
    other: DebateSide,
  ): PlayResult {
    const { duel } = entry;

    // ¿Cayó alguien con esta jugada?
    if (other.credibility <= 0 || actor.credibility <= 0) {
      const winner = other.credibility <= 0 ? actor : other;
      const loser = other.credibility <= 0 ? other : actor;
      this.finish(entry, winner, loser, 'credibilidad');
      return { ok: true, duel, finished: true };
    }

    const eraElRetador = actor.charId === duel.challenger.charId;
    duel.activeSide = eraElRetador ? duel.defender.charId : duel.challenger.charId;
    duel.turnEndsAt = (Date.now() + DEBATE.TURN_SECONDS * 1000) as never;

    // El turno cierra cuando jugaron los dos.
    if (!eraElRetador) {
      const cerrado = this.endTurn(entry);
      if (cerrado) return { ok: true, duel, finished: true };
    }

    return { ok: true, duel, finished: false };
  }

  /** Cierre de turno: labia, sangrados, estados, robo de cartas. */
  private endTurn(entry: { duel: DebateDuel; rng: Rng; pot: number; zoneControl: Record<number, number> }): boolean {
    const { duel, rng } = entry;

    for (const side of [duel.challenger, duel.defender]) {
      const { bleed } = tickStatuses(side);
      if (bleed > 0) side.credibility = Math.max(0, side.credibility - bleed);

      side.labia = Math.min(side.labiaMax, side.labia + DEBATE.LABIA_REGEN);
      side.abilityBlocked = false;

      for (const slug of Object.keys(side.cooldowns)) {
        const restante = (side.cooldowns[slug] ?? 0) - 1;
        if (restante <= 0) delete side.cooldowns[slug];
        else side.cooldowns[slug] = restante;
      }

      // Robar hasta completar la mano; si se acabó el mazo, se baraja el descarte.
      while (side.hand.length < DEBATE.HAND_SIZE) {
        if (side.deck.length === 0) {
          if (side.discard.length === 0) break;
          side.deck = rng.shuffle(side.discard);
          side.discard = [];
        }
        const carta = side.deck.shift();
        if (!carta) break;
        side.hand.push(carta);
      }
      side.handSize = side.hand.length;
    }

    // ¿Alguien se desangró?
    if (duel.challenger.credibility <= 0 || duel.defender.credibility <= 0) {
      const winner = duel.challenger.credibility > duel.defender.credibility ? duel.challenger : duel.defender;
      const loser = winner === duel.challenger ? duel.defender : duel.challenger;
      this.finish(entry, winner, loser, 'credibilidad');
      return true;
    }

    duel.turn += 1;

    if (duel.turn > duel.maxTurns) {
      const c = duel.challenger.credibility / duel.challenger.credibilityMax;
      const d = duel.defender.credibility / duel.defender.credibilityMax;
      if (Math.abs(c - d) < 0.05) {
        this.finish(entry, null, null, 'turnos');
      } else {
        const winner = c > d ? duel.challenger : duel.defender;
        const loser = c > d ? duel.defender : duel.challenger;
        this.finish(entry, winner, loser, 'turnos');
      }
      return true;
    }

    return false;
  }

  private finish(
    entry: { duel: DebateDuel; rng: Rng; pot: number; zoneControl: Record<number, number> },
    winner: DebateSide | null,
    loser: DebateSide | null,
    reason: 'credibilidad' | 'turnos' | 'abandono' | 'desconexion' | 'moderacion',
  ): void {
    const { duel } = entry;
    duel.finished = true;
    duel.outcome = buildOutcome({
      ...(winner ? { winner } : {}),
      ...(loser ? { loser } : {}),
      draw: !winner || !loser,
      reason,
      turns: duel.turn,
      pot: entry.pot,
      ...(duel.zoneId ? { zoneId: duel.zoneId } : {}),
    });
  }

  /* ------------------------------------------------------------------ */
  /* Utilidades                                                          */
  /* ------------------------------------------------------------------ */

  private sideOf(duel: DebateDuel, charId: string): DebateSide | null {
    if (duel.challenger.charId === charId) return duel.challenger;
    if (duel.defender.charId === charId) return duel.defender;
    return null;
  }

  private otherSide(duel: DebateDuel, charId: string): DebateSide | null {
    if (duel.challenger.charId === charId) return duel.defender;
    if (duel.defender.charId === charId) return duel.challenger;
    return null;
  }

  /** Última familia que jugó un lado: con eso se calcula la contra. */
  private lastFamilyOf(duel: DebateDuel, charId: string): DebateFamily | null {
    for (let i = duel.log.length - 1; i >= 0; i--) {
      const entry = duel.log[i];
      if (entry.actor === charId) return entry.family;
    }
    return null;
  }

  /** Saca el duelo de memoria una vez persistido. */
  dispose(duelId: string): void {
    this.duels.delete(duelId);
  }

  /** Duelos abiertos, para las métricas del shard. */
  get openDuels(): number {
    let n = 0;
    for (const { duel } of this.duels.values()) if (!duel.finished) n++;
    return n;
  }

  /** Carta del catálogo, para que la sala pueda mostrarla sin importar el módulo. */
  static card(slug: string): DebateCard | undefined {
    return CARD_CATALOG.get(slug);
  }
}
