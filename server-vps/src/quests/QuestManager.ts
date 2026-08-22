/**
 * `QuestManager` — el orquestador de Live-Ops.
 *
 * Publica misiones, sigue el progreso de cada militante y reparte lo que
 * corresponde. Se dispara por cuatro vías:
 *
 *   · **admin**       el panel publica una misión a mano
 *   · **noticia**     entra un webhook con una noticia real de Esquel
 *   · **clima**       la API meteorológica detecta nieve o helada
 *   · **calendario**  la fase electoral y la hora del día
 *
 * Reglas que hacen que esto no se vuelva un caos: tope de misiones simultáneas
 * por shard y por barrio, cooldown por tipología para que no salga tres veces
 * seguidas la misma, y cierre automático al vencer el plazo.
 */

import {
  LIVEOPS,
  QUEST_BASELINES,
  computeQuestReward,
  createRng,
  seedFromString,
  type LiveQuest,
  type QuestProgress,
  type QuestSlug,
  type QuestSpawnRequest,
  type QuestState,
  type QuestType,
  type RankLevel,
  type Unit,
  type WeatherCondition,
} from '@esquel/shared';
import { QUEST_CATALOG, type QuestContext, type QuestEvent } from './catalog/index.ts';

/** Militante anotado en una misión. */
export interface QuestParticipant {
  readonly charId: string;
  readonly sessionId: string;
  readonly factionId: number;
  readonly rankTier: number;
  progress: QuestProgress;
}

/** Instancia viva con su gente adentro. */
export interface QuestInstance {
  quest: LiveQuest;
  readonly participants: Map<string, QuestParticipant>;
  readonly seed: number;
  /** Facción que ya la completó, en las misiones que son carrera. */
  wonBy: number | null;
}

/** Lo que el manager le devuelve a la sala para que lo anuncie. */
export type QuestEventOut =
  | { kind: 'anunciada'; quest: LiveQuest }
  | { kind: 'actualizada'; quest: LiveQuest }
  | { kind: 'progreso'; questId: string; charId: string; progress: QuestProgress }
  | {
      kind: 'cerrada';
      questId: string;
      charId: string;
      outcome: 'completada' | 'parcial' | 'fallada' | 'abandonada' | 'expirada';
      completion: number;
      reward: { xp: number; reputation: number; money: number; territoryScore: number; breakdown: Record<string, number> };
      text: string;
    };

export interface QuestTickInput {
  readonly now: number;
  readonly weather: WeatherCondition;
  readonly snowCoverage: number;
  readonly windGustKph: number;
  readonly localHour: number;
  readonly electionPhase: string;
  readonly online: Readonly<Record<number, number>>;
  readonly zones: QuestContext['zones'];
  /** Multiplicadores vigentes: clima × hora × fase electoral. */
  readonly contextMultiplier: number;
  /** Buff de territorio por facción. */
  readonly territoryBuff: Readonly<Record<number, { xp: number; money: number }>>;
}

const OUTCOME_TEXT: Record<string, string> = {
  completada: '¡Misión cumplida! En el comité ya se enteraron.',
  parcial: 'Quedó a medio camino, pero algo suma.',
  fallada: 'Se fue al descenso. La próxima.',
  abandonada: 'Dejaste la misión colgada.',
  expirada: 'Se acabó el tiempo.',
};

export class QuestManager {
  private readonly instances = new Map<string, QuestInstance>();
  /** Último instante en que se publicó cada tipología. */
  private readonly lastSpawn = new Map<QuestType, number>();
  private sequence = 0;

  /* ------------------------------------------------------------------ */
  /* Consulta                                                            */
  /* ------------------------------------------------------------------ */

  list(): LiveQuest[] {
    return [...this.instances.values()].map((i) => i.quest);
  }

  get(questId: string): QuestInstance | undefined {
    return this.instances.get(questId);
  }

  /** Misiones en las que está anotado un personaje. */
  questsOf(charId: string): LiveQuest[] {
    return [...this.instances.values()].filter((i) => i.participants.has(charId)).map((i) => i.quest);
  }

  get activeCount(): number {
    return [...this.instances.values()].filter((i) => i.quest.state === 'activa' || i.quest.state === 'anunciada').length;
  }

  /* ------------------------------------------------------------------ */
  /* Publicación                                                         */
  /* ------------------------------------------------------------------ */

  /**
   * Publica una misión. Es la vía del panel de admin y del webhook de noticias;
   * el tick automático usa la misma puerta.
   */
  spawn(request: QuestSpawnRequest, ctx: QuestTickInput): QuestEventOut | null {
    const blueprint = QUEST_CATALOG[request.type];
    if (!blueprint) return null;

    if (this.activeCount >= LIVEOPS.MAX_ACTIVE_QUESTS) return null;

    const seed = seedFromString(`${request.type}:${ctx.now}:${this.sequence++}`);
    const rng = createRng(seed);
    const questCtx = this.buildContext(ctx, request);
    const placement = request.zoneId
      ? this.placementFromZone(request.zoneId, ctx) ?? blueprint.place(questCtx, () => rng.next())
      : blueprint.place(questCtx, () => rng.next());

    const perBarrio = [...this.instances.values()].filter(
      (i) => i.quest.barrio === placement.barrio && i.quest.state !== 'cerrada',
    ).length;
    if (perBarrio >= LIVEOPS.MAX_PER_BARRIO) return null;

    const difficulty = request.difficulty ?? 0.35 + rng.next() * 0.45;
    const baseline = QUEST_BASELINES[request.type];
    const duration = request.durationS ?? blueprint.durationS;
    const id = `quest-${ctx.now.toString(36)}-${this.sequence}`;

    const quest: LiveQuest = {
      id,
      slug: blueprint.slug as QuestSlug,
      type: request.type,
      trigger: request.trigger ?? 'admin',
      state: 'anunciada',
      title: blueprint.title,
      description: blueprint.description(questCtx, placement),
      ...(request.news ? { news: request.news } : {}),
      barrio: placement.barrio,
      ...(placement.zoneId ? { zoneId: placement.zoneId } : {}),
      cells: placement.cells,
      center: placement.center,
      radiusM: placement.radiusM as never,
      announcedAt: ctx.now as never,
      startsAt: (ctx.now + LIVEOPS.ANNOUNCE_LEAD_S * 1000) as never,
      endsAt: (ctx.now + (LIVEOPS.ANNOUNCE_LEAD_S + duration) * 1000) as never,
      objectives: blueprint.objectives(questCtx, placement, difficulty),
      requirements: {
        minRank: blueprint.minRank as RankLevel,
        ...(request.factionId ? { factionId: request.factionId } : {}),
        ...(blueprint.requiredCareerItem ? { requiredCareerItem: blueprint.requiredCareerItem } : {}),
        requiredItems: [],
      },
      rewards: {
        xp: baseline.xp,
        reputation: baseline.reputation,
        money: baseline.money as never,
        items: [],
        territoryScore: baseline.territory,
        factionTreasury: Math.round(baseline.money * 0.1),
      },
      group: blueprint.group,
      capacity: blueprint.capacity,
      headcount: {},
      difficulty: difficulty as Unit,
      contextMultiplier: ctx.contextMultiplier,
      contested: blueprint.contested,
    };

    this.instances.set(id, { quest, participants: new Map(), seed, wonBy: null });
    this.lastSpawn.set(request.type, ctx.now);
    return { kind: 'anunciada', quest };
  }

  /**
   * Ciclo automático: activa lo anunciado, cierra lo vencido y decide si
   * corresponde publicar algo nuevo.
   */
  tick(input: QuestTickInput): QuestEventOut[] {
    const out: QuestEventOut[] = [];

    for (const instance of [...this.instances.values()]) {
      const { quest } = instance;

      if (quest.state === 'anunciada' && input.now >= quest.startsAt) {
        instance.quest = { ...quest, state: 'activa' as QuestState };
        out.push({ kind: 'actualizada', quest: instance.quest });
        continue;
      }

      if (quest.state === 'activa' && input.now >= quest.endsAt) {
        for (const participante of instance.participants.values()) {
          out.push(this.close(instance, participante, input, participante.progress.completion >= 0.999 ? 'completada' : 'expirada'));
        }
        instance.quest = { ...quest, state: 'cerrada' as QuestState };
        this.instances.delete(quest.id);
      }
    }

    // ¿Hace falta publicar algo nuevo?
    if (this.activeCount < LIVEOPS.MAX_ACTIVE_QUESTS) {
      const questCtx = this.buildContext(input);
      for (const [type, blueprint] of Object.entries(QUEST_CATALOG) as [QuestType, (typeof QUEST_CATALOG)[QuestType]][]) {
        const ultima = this.lastSpawn.get(type) ?? 0;
        // Cooldown por tipología: que no salga la misma tres veces seguidas.
        if (input.now - ultima < LIVEOPS.DEFAULT_TTL_S * 500) continue;
        if (!blueprint.autoSpawn(questCtx)) continue;

        const trigger =
          type === 'TEMPORAL_CORDILLERANO' ? 'clima' : questCtx.news ? 'noticia' : 'calendario';
        const evento = this.spawn({ type, trigger }, input);
        if (evento) {
          out.push(evento);
          break; // de a una por tick: la ciudad no es una feria
        }
      }
    }

    return out;
  }

  /* ------------------------------------------------------------------ */
  /* Participación                                                       */
  /* ------------------------------------------------------------------ */

  join(
    questId: string,
    player: { charId: string; sessionId: string; factionId: number; rankTier: number; careerItems: readonly string[] },
    now: number,
  ): { ok: true; quest: LiveQuest } | { ok: false; error: string } {
    const instance = this.instances.get(questId);
    if (!instance) return { ok: false, error: 'Esa misión ya no está.' };
    const { quest } = instance;

    if (quest.state === 'cerrada') return { ok: false, error: 'La misión ya cerró.' };
    if (instance.participants.has(player.charId)) return { ok: false, error: 'Ya estás anotado.' };
    if (quest.capacity > 0 && instance.participants.size >= quest.capacity) {
      return { ok: false, error: 'No queda lugar: se llenó.' };
    }
    if (player.rankTier < quest.requirements.minRank) {
      return { ok: false, error: `Esta misión es de rango ${quest.requirements.minRank} para arriba.` };
    }
    if (quest.requirements.factionId && player.factionId !== (quest.requirements.factionId as unknown as number)) {
      return { ok: false, error: 'Esta misión es de otro bando.' };
    }
    const item = quest.requirements.requiredCareerItem;
    if (item && !player.careerItems.includes(item)) {
      return { ok: false, error: `Te falta la herramienta: ${item.replace(/_/g, ' ')}.` };
    }

    instance.participants.set(player.charId, {
      charId: player.charId,
      sessionId: player.sessionId,
      factionId: player.factionId,
      rankTier: player.rankTier,
      progress: {
        charId: player.charId as never,
        joinedAt: now as never,
        counters: {},
        completion: 0 as Unit,
        contribution: 0 as Unit,
        finished: false,
        failed: false,
      },
    });

    const headcount = { ...quest.headcount };
    headcount[String(player.factionId)] = (headcount[String(player.factionId)] ?? 0) + 1;
    instance.quest = { ...quest, headcount };

    return { ok: true, quest: instance.quest };
  }

  abandon(questId: string, charId: string, input: QuestTickInput): QuestEventOut | null {
    const instance = this.instances.get(questId);
    const participante = instance?.participants.get(charId);
    if (!instance || !participante) return null;
    const evento = this.close(instance, participante, input, 'abandonada');
    instance.participants.delete(charId);
    return evento;
  }

  /* ------------------------------------------------------------------ */
  /* Progreso                                                            */
  /* ------------------------------------------------------------------ */

  /**
   * Un hecho del mundo (afiche pegado, duelo ganado, bolsón entregado) puede
   * hacer avanzar varias misiones a la vez: se lo ofrece a todas.
   */
  report(event: QuestEvent, input: QuestTickInput): QuestEventOut[] {
    const out: QuestEventOut[] = [];

    for (const instance of [...this.instances.values()]) {
      const { quest } = instance;
      if (quest.state !== 'activa') continue;
      const participante = instance.participants.get(event.charId);
      if (!participante || participante.progress.finished) continue;

      const blueprint = QUEST_CATALOG[quest.type];
      const avance = blueprint.onEvent(event, quest);
      if (!avance) continue;

      const objetivo = quest.objectives.find((o) => o.id === avance.objectiveId);
      if (!objetivo) continue;

      const counters = { ...participante.progress.counters };
      if (avance.fail) {
        participante.progress = { ...participante.progress, failed: true, counters };
        out.push(this.close(instance, participante, input, 'fallada'));
        instance.participants.delete(event.charId);
        continue;
      }

      const previo = counters[objetivo.id] ?? 0;
      counters[objetivo.id] = Math.min(objetivo.target, previo + avance.amount);

      const completion = this.completionOf(quest, counters);
      participante.progress = {
        ...participante.progress,
        counters,
        completion: completion as Unit,
      };
      out.push({ kind: 'progreso', questId: quest.id, charId: event.charId, progress: participante.progress });

      if (completion >= 0.999) {
        // En las misiones que son carrera, el primero se lleva el premio grande.
        if (quest.contested && instance.wonBy === null) instance.wonBy = event.factionId;
        out.push(this.close(instance, participante, input, 'completada'));
        instance.participants.delete(event.charId);
      }
    }

    return out;
  }

  /** Completitud ponderada por el peso de cada objetivo. */
  private completionOf(quest: LiveQuest, counters: Readonly<Record<string, number>>): number {
    let total = 0;
    let peso = 0;
    for (const objetivo of quest.objectives) {
      if (objetivo.optional) continue;
      peso += objetivo.weight;
      const hecho = Math.min(1, (counters[objetivo.id] ?? 0) / Math.max(1, objetivo.target));
      total += hecho * objetivo.weight;
    }
    return peso > 0 ? Number((total / peso).toFixed(4)) : 0;
  }

  /* ------------------------------------------------------------------ */
  /* Cierre y recompensa                                                 */
  /* ------------------------------------------------------------------ */

  private close(
    instance: QuestInstance,
    participante: QuestParticipant,
    input: QuestTickInput,
    outcome: 'completada' | 'parcial' | 'fallada' | 'abandonada' | 'expirada',
  ): QuestEventOut {
    const { quest } = instance;
    const completion = outcome === 'fallada' || outcome === 'abandonada' ? participante.progress.completion * 0.4 : participante.progress.completion;

    const buff = input.territoryBuff[participante.factionId] ?? { xp: 1, money: 1 };
    // El que llega segundo en una carrera cobra la mitad.
    const carreraPerdida = quest.contested && instance.wonBy !== null && instance.wonBy !== participante.factionId;

    const reward = computeQuestReward({
      questType: quest.type,
      completion,
      rankLevel: Math.max(1, Math.min(10, participante.rankTier)) as RankLevel,
      difficulty: quest.difficulty,
      weather: input.weather,
      localHour: input.localHour,
      repeatsToday: 0,
      questsToday: 0,
      factionXpPerk: buff.xp,
      buffXp: carreraPerdida ? 0.5 : 1,
      buffRep: carreraPerdida ? 0.5 : 1,
      buffMoney: buff.money * (carreraPerdida ? 0.5 : 1),
    });

    participante.progress = { ...participante.progress, finished: true };

    const texto = carreraPerdida
      ? 'Llegaste segundo: la foto se la sacó el otro bando.'
      : (OUTCOME_TEXT[outcome] ?? '');

    return {
      kind: 'cerrada',
      questId: quest.id,
      charId: participante.charId,
      outcome,
      completion,
      reward: {
        xp: reward.xp,
        reputation: reward.reputation,
        money: reward.money,
        territoryScore: reward.territoryScore,
        breakdown: reward.breakdown as Record<string, number>,
      },
      text: texto,
    };
  }

  /* ------------------------------------------------------------------ */
  /* Utilidades                                                          */
  /* ------------------------------------------------------------------ */

  private buildContext(input: QuestTickInput, request?: QuestSpawnRequest): QuestContext {
    return {
      now: input.now,
      weather: input.weather,
      snowCoverage: input.snowCoverage,
      windGustKph: input.windGustKph,
      localHour: input.localHour,
      electionPhase: input.electionPhase,
      online: input.online,
      zones: input.zones,
      ...(request?.news ? { news: request.news } : {}),
    };
  }

  private placementFromZone(zoneId: string, input: QuestTickInput): QuestContext['zones'][number] extends never
    ? never
    : { barrio: 'centro'; zoneId: string; center: { x: number; y: number; z: number }; radiusM: number; cells: [] } | null {
    const zona = input.zones.find((z) => z.id === zoneId);
    if (!zona) return null;
    return {
      barrio: 'centro',
      zoneId: zona.id,
      center: { x: zona.centerX, y: 0, z: zona.centerZ },
      radiusM: zona.radiusM,
      cells: [],
    };
  }

  /** Saca una misión de memoria (cierre manual desde el panel). */
  cancel(questId: string): void {
    this.instances.delete(questId);
  }

  /** Facciones anotadas en cada misión, para el HUD. */
  headcounts(): Record<string, Record<string, number>> {
    const out: Record<string, Record<string, number>> = {};
    for (const instance of this.instances.values()) out[instance.quest.id] = { ...instance.quest.headcount };
    return out;
  }
}
