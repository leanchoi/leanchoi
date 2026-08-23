/**
 * Motor de Inteligencia Política — el agregador en vivo del shard.
 *
 * Hace dos cosas a la vez, y conviene no confundirlas:
 *
 *  1. **Agrega en memoria.** Lleva la cuenta de intención de voto, humor,
 *     militancia, misiones y comercios por barrio y por franja. Es lo que
 *     alimenta el mapa de calor del dashboard sin ir a la base: números de hace
 *     segundos, no del cierre de ayer.
 *  2. **Relaya lo crudo.** Manda los eventos, por lote y firmados, a
 *     `ingest.php`, que es quien los persiste. El VPS no habla con MySQL.
 *
 * Lo que **no** hace: guardar quién dijo qué. El sujeto llega ya pseudonimizado
 * desde el cliente y acá sólo se usa para contar personas distintas con un Set
 * que se vacía en cada ventana. Si alguien se mete en la memoria del proceso,
 * encuentra cuentas, no gente.
 *
 * Ante avalancha, tira. La telemetría es lo primero que se sacrifica: preferimos
 * perder una métrica antes que un tick de simulación.
 */

import { randomUUID } from 'node:crypto';
import {
  BARRIOS,
  K_ANON_MIN,
  ageGroupOf,
  barrioHeatOf,
  projectSeats,
  signalOfEvent,
  weightedShare,
  type AgeGroup,
  type Barrio,
  type BarrioHeat,
  type ElectoralProjection,
  type FactionId,
  type IntelSignal,
  type QuestType,
  type TelemetryEvent,
  type Unit,
} from '@esquel/shared';
import type { HostingerBridge } from '../services/HostingerBridge.ts';

/* --- números de diseño ---------------------------------------------------- */

/** Cada cuánto se vacía hacia Hostinger. */
const FLUSH_INTERVAL_MS = 30_000;
/** Eventos por lote hacia `ingest.php`. */
const INGEST_BATCH = 200;
/** Techo de la cola de relay. Pasado esto se tira lo más viejo. */
const MAX_RELAY_QUEUE = 4_000;
/** Eventos por segundo aceptados por sujeto: corta la inyección desde consola. */
const RATE_PER_SUBJECT = 20;
/** Cada cuánto se recicla la ventana de agregación en vivo. */
const WINDOW_MS = 15 * 60_000;

type Logger = { info: (m: string) => void; warn: (m: string) => void; error: (m: string) => void };
const noopLogger: Logger = { info: () => {}, warn: () => {}, error: () => {} };

/* --- acumuladores --------------------------------------------------------- */

interface BarrioAcc {
  /** Intención de voto declarada, por facción. */
  votes: Map<number, number>;
  undecided: number;
  activity: number;
  moodSum: number;
  moodCount: number;
  subjects: Set<string>;
  /** Sujetos por franja de reporte, para la matriz demográfica. */
  byAge: Map<AgeGroup, Set<string>>;
}

interface QuestAcc {
  starts: number;
  finishes: number;
  completionSum: number;
}

interface SponsorAcc {
  impressions: number;
  entries: number;
  buffClaims: number;
  ctaClicks: number;
  subjects: Set<string>;
}

const nuevoBarrio = (): BarrioAcc => ({
  votes: new Map(),
  undecided: 0,
  activity: 0,
  moodSum: 0,
  moodCount: 0,
  subjects: new Set(),
  byAge: new Map(),
});

export interface EngineOptions {
  readonly bridge: HostingerBridge;
  readonly shardName: string;
  readonly log?: Logger;
  /** Inyectable para los tests. */
  readonly now?: () => number;
}

/** Foto en vivo que consume el dashboard sin pasar por MySQL. */
export interface LiveIntel {
  readonly shard: string;
  readonly windowStart: number;
  readonly generatedAt: number;
  readonly heat: readonly BarrioHeat[];
  readonly projection: ElectoralProjection;
  readonly participation: readonly { questType: QuestType; starts: number; finishes: number; completionAvg: Unit }[];
  readonly sponsors: readonly {
    sponsorId: number;
    impressions: number;
    uniqueSubjects: number;
    entries: number;
    buffClaims: number;
    ctaClicks: number;
  }[];
  readonly bySignal: Readonly<Record<IntelSignal, number>>;
  readonly subjects: number;
  readonly kAnonMin: number;
}

export class IntelligenceEngine {
  private readonly bridge: HostingerBridge;
  private readonly shard: string;
  private readonly log: Logger;
  private readonly ahora: () => number;

  private readonly barrios = new Map<Barrio, BarrioAcc>();
  private readonly quests = new Map<QuestType, QuestAcc>();
  private readonly sponsors = new Map<number, SponsorAcc>();
  private readonly porSenal = new Map<IntelSignal, number>();
  private readonly sujetos = new Set<string>();

  /** Eventos crudos esperando salir hacia Hostinger. */
  private relay: TelemetryEvent[] = [];
  /** Presupuesto de eventos por sujeto en la ventana de un segundo. */
  private readonly rate = new Map<string, { count: number; windowAt: number }>();

  private ventanaDesde: number;
  private timer: ReturnType<typeof setInterval> | null = null;
  private vaciando = false;

  private readonly stats = { aceptados: 0, rechazados: 0, relayados: 0, perdidos: 0, lotes: 0, fallos: 0 };

  constructor(options: EngineOptions) {
    this.bridge = options.bridge;
    this.shard = options.shardName;
    this.log = options.log ?? noopLogger;
    this.ahora = options.now ?? (() => Date.now());
    this.ventanaDesde = this.ahora();
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.flush(), FLUSH_INTERVAL_MS);
    // Que el intervalo no mantenga vivo el proceso al apagar el servidor.
    this.timer.unref?.();
  }

  async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    await this.flush();
  }

  /* --- entrada -------------------------------------------------------- */

  /**
   * Ingresa un lote de un cliente.
   *
   * `trustedSubject` es el seudónimo que viene **firmado en el JWT**, y con él se
   * sella cada evento pisando lo que haya mandado el cliente. Es la línea que
   * sostiene todo el modelo de privacidad: si el sujeto fuera el que dice el
   * cliente, cualquiera podría fabricar mil personas distintas para inflar una
   * muestra —o, peor, para empujar un barrio por encima del umbral de
   * k-anonimato y después restar sus propios eventos y leer el dato del único
   * vecino real que había adentro.
   *
   * Devuelve cuántos entraron: el resto se rechazó por nombre desconocido, por
   * exceso de ritmo o por venir vacío.
   */
  ingest(events: readonly TelemetryEvent[], trustedSubject: string): { accepted: number; rejected: number } {
    let aceptados = 0;
    let rechazados = 0;

    if (!trustedSubject) return { accepted: 0, rejected: events.length };

    for (const crudo of events) {
      // El sello va ANTES de cualquier otra cosa: ni el rate limit ni el conteo
      // de personas distintas pueden mirar un campo que el cliente elige.
      const evento = { ...crudo, subject: trustedSubject } as TelemetryEvent;
      if (!this.admite(evento)) {
        rechazados++;
        continue;
      }
      this.acumular(evento);
      this.encolarRelay(evento);
      aceptados++;
    }

    this.stats.aceptados += aceptados;
    this.stats.rechazados += rechazados;
    return { accepted: aceptados, rejected: rechazados };
  }

  /**
   * Compuerta de entrada: forma mínima y ritmo por sujeto.
   *
   * El ritmo se mide contra el sujeto **sellado**, no contra el que vino en el
   * evento: un limitador que se puede esquivar cambiando el campo que limita no
   * limita nada.
   */
  private admite(e: TelemetryEvent): boolean {
    if (!e || typeof e.name !== 'string' || typeof e.subject !== 'string' || e.subject.length === 0) return false;
    if (!e.context || !(BARRIOS as readonly string[]).includes(e.context.barrio)) return false;

    const ahora = this.ahora();
    const cupo = this.rate.get(e.subject);
    if (!cupo || ahora - cupo.windowAt >= 1000) {
      this.rate.set(e.subject, { count: 1, windowAt: ahora });
      return true;
    }
    if (cupo.count >= RATE_PER_SUBJECT) return false;
    cupo.count++;
    return true;
  }

  /** Suma el evento a los acumuladores en vivo. */
  private acumular(e: TelemetryEvent): void {
    const senal = signalOfEvent(e.name);
    if (senal) this.porSenal.set(senal, (this.porSenal.get(senal) ?? 0) + 1);
    this.sujetos.add(e.subject);

    const barrio = e.context.barrio;
    let acc = this.barrios.get(barrio);
    if (!acc) {
      acc = nuevoBarrio();
      this.barrios.set(barrio, acc);
    }
    acc.subjects.add(e.subject);

    if (e.context.ageBand) {
      const franja = ageGroupOf(e.context.ageBand);
      let set = acc.byAge.get(franja);
      if (!set) {
        set = new Set();
        acc.byAge.set(franja, set);
      }
      set.add(e.subject);
    }

    const p = e.payload;
    switch (p.name) {
      case 'vote_intent':
        if (p.undecided || p.targetFaction === undefined) acc.undecided++;
        else acc.votes.set(p.targetFaction, (acc.votes.get(p.targetFaction) ?? 0) + 1);
        break;
      case 'faction_switch':
        if (p.to !== undefined) acc.votes.set(p.to, (acc.votes.get(p.to) ?? 0) + 1);
        if (p.from !== undefined) acc.votes.set(p.from, Math.max(0, (acc.votes.get(p.from) ?? 0) - 1));
        break;
      case 'candidate_reaction':
        acc.moodSum += p.approval;
        acc.moodCount++;
        break;
      case 'news_reaction':
        acc.moodSum += p.sentiment;
        acc.moodCount++;
        break;
      case 'cell_enter':
        acc.activity += 1;
        break;
      case 'poi_visit':
        acc.activity += 2;
        break;
      case 'zone_dwell':
        acc.activity += Math.min(10, Math.round(p.seconds / 30));
        break;
      case 'rally_join':
        acc.activity += 6;
        break;
      case 'quest_start': {
        const q = this.questAcc(p.questType);
        q.starts++;
        acc.activity += 2;
        break;
      }
      case 'quest_finish': {
        const q = this.questAcc(p.questType);
        q.finishes++;
        q.completionSum += p.completion;
        acc.activity += 3;
        break;
      }
      case 'sponsor_impression': {
        const s = this.sponsorAcc(p.sponsorId);
        s.impressions++;
        s.subjects.add(e.subject);
        break;
      }
      case 'sponsor_enter': {
        const s = this.sponsorAcc(p.sponsorId);
        s.entries++;
        s.subjects.add(e.subject);
        break;
      }
      case 'sponsor_buff_claim':
        this.sponsorAcc(p.sponsorId).buffClaims++;
        break;
      case 'sponsor_cta_click':
        this.sponsorAcc(p.sponsorId).ctaClicks++;
        break;
      default:
        // El resto de los eventos se relayan pero no mueven el tablero en vivo.
        break;
    }
  }

  private questAcc(tipo: QuestType): QuestAcc {
    let q = this.quests.get(tipo);
    if (!q) {
      q = { starts: 0, finishes: 0, completionSum: 0 };
      this.quests.set(tipo, q);
    }
    return q;
  }

  private sponsorAcc(id: number): SponsorAcc {
    let s = this.sponsors.get(id);
    if (!s) {
      s = { impressions: 0, entries: 0, buffClaims: 0, ctaClicks: 0, subjects: new Set() };
      this.sponsors.set(id, s);
    }
    return s;
  }

  private encolarRelay(e: TelemetryEvent): void {
    this.relay.push(e);
    if (this.relay.length > MAX_RELAY_QUEUE) {
      const sobran = this.relay.length - MAX_RELAY_QUEUE;
      this.relay.splice(0, sobran);
      this.stats.perdidos += sobran;
    }
  }

  /* --- salida --------------------------------------------------------- */

  /** Manda lo acumulado a `ingest.php`. Nunca lanza. */
  async flush(): Promise<{ sent: number; failed: number }> {
    if (this.vaciando || this.relay.length === 0) return { sent: 0, failed: 0 };
    this.vaciando = true;

    let enviados = 0;
    let fallidos = 0;

    try {
      while (this.relay.length > 0) {
        const lote = this.relay.splice(0, INGEST_BATCH);
        const res = await this.bridge.postSigned<{ accepted?: number; duplicated?: boolean }>('/intelligence/ingest.php', {
          batchId: randomUUID(),
          shard: this.shard,
          sentAt: new Date(this.ahora()).toISOString(),
          events: lote,
        });

        if (res.ok) {
          enviados += res.data.accepted ?? lote.length;
          this.stats.relayados += lote.length;
          this.stats.lotes++;
          continue;
        }

        // Falló: vuelve adelante y se corta la ronda. El próximo tick reintenta.
        this.relay.unshift(...lote);
        while (this.relay.length > MAX_RELAY_QUEUE) {
          this.relay.shift();
          this.stats.perdidos++;
        }
        fallidos += lote.length;
        this.stats.fallos++;
        this.log.warn(`[intel] no salió el lote de ${lote.length} eventos: ${res.error}`);
        break;
      }
    } finally {
      this.vaciando = false;
    }

    return { sent: enviados, failed: fallidos };
  }

  /* --- lectura -------------------------------------------------------- */

  /**
   * Foto en vivo del shard. Aplica k-anonimato antes de devolver nada: lo que
   * sale de acá ya se puede mostrar en pantalla sin pensarlo dos veces.
   */
  live(): LiveIntel {
    const maxActividad = Math.max(1, ...[...this.barrios.values()].map((b) => b.activity));

    const heat = [...this.barrios.entries()].map(([barrio, acc]) =>
      barrioHeatOf(
        {
          barrio,
          votes: Object.fromEntries(acc.votes),
          activity: acc.activity,
          moodSum: acc.moodSum,
          moodCount: acc.moodCount,
          subjects: acc.subjects.size,
        },
        maxActividad,
      ),
    );

    return {
      shard: this.shard,
      windowStart: this.ventanaDesde,
      generatedAt: this.ahora(),
      heat,
      projection: this.projection(),
      participation: [...this.quests.entries()].map(([questType, q]) => ({
        questType,
        starts: q.starts,
        finishes: q.finishes,
        completionAvg: (q.finishes > 0 ? Number((q.completionSum / q.finishes).toFixed(4)) : 0) as Unit,
      })),
      sponsors: [...this.sponsors.entries()].map(([sponsorId, s]) => ({
        sponsorId,
        impressions: s.impressions,
        uniqueSubjects: s.subjects.size,
        entries: s.entries,
        buffClaims: s.buffClaims,
        ctaClicks: s.ctaClicks,
      })),
      bySignal: Object.fromEntries(this.porSenal) as Record<IntelSignal, number>,
      subjects: this.sujetos.size,
      kAnonMin: K_ANON_MIN,
    };
  }

  /**
   * Proyección electoral de la ventana en vivo.
   *
   * El share se pondera por padrón de barrio: la muestra del juego sobre-
   * representa al Centro, y sin ponderar el que gana en la plaza parece que gana
   * el pueblo.
   */
  projection(): ElectoralProjection {
    const facciones = new Set<number>();
    for (const acc of this.barrios.values()) for (const id of acc.votes.keys()) facciones.add(id);

    const sinDecidir = [...this.barrios.values()].reduce((s, b) => s + b.undecided, 0);
    const totalVotos = [...this.barrios.values()].reduce(
      (s, b) => s + [...b.votes.values()].reduce((a, v) => a + v, 0),
      0,
    );

    const shares = [...facciones].map((factionId) => {
      const porBarrio: Partial<Record<Barrio, { share: number; n: number }>> = {};
      for (const [barrio, acc] of this.barrios) {
        const total = [...acc.votes.values()].reduce((a, v) => a + v, 0) + acc.undecided;
        if (total <= 0) continue;
        porBarrio[barrio] = { share: (acc.votes.get(factionId) ?? 0) / total, n: acc.subjects.size };
      }
      const w = weightedShare(porBarrio);
      return { factionId: factionId as FactionId, share: w.share, n: w.subjects, deltaPp: 0 };
    });

    const proyeccion = projectSeats(shares);
    const muestra = this.sujetos.size;

    return {
      day: new Date(this.ahora()).toISOString().slice(0, 10) as ElectoralProjection['day'],
      generatedAt: new Date(this.ahora()).toISOString() as ElectoralProjection['generatedAt'],
      mayor: proyeccion,
      council: proyeccion,
      undecidedShare: (totalVotos + sinDecidir > 0 ? sinDecidir / (totalVotos + sinDecidir) : 0) as Unit,
      sampleSize: muestra,
      publishable: muestra >= K_ANON_MIN,
    };
  }

  /** Contadores del motor, para `/metrics` y el panel de diagnóstico. */
  diagnostics(): Readonly<Record<string, number>> {
    return {
      ...this.stats,
      pendientes: this.relay.length,
      barrios: this.barrios.size,
      sujetos: this.sujetos.size,
      ventanaMin: Math.round((this.ahora() - this.ventanaDesde) / 60_000),
    };
  }

  /**
   * Recicla la ventana en vivo. Se llama sola cuando se pasa de `WINDOW_MS`:
   * el mapa de calor tiene que mostrar el pueblo de ahora, no el acumulado
   * desde que arrancó el proceso hace tres días.
   */
  rollWindowIfNeeded(): boolean {
    if (this.ahora() - this.ventanaDesde < WINDOW_MS) return false;
    this.barrios.clear();
    this.quests.clear();
    this.sponsors.clear();
    this.porSenal.clear();
    this.sujetos.clear();
    this.rate.clear();
    this.ventanaDesde = this.ahora();
    return true;
  }
}
