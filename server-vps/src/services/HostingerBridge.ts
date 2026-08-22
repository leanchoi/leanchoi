/**
 * Puente VPS → Hostinger.
 *
 * El estado vivo del juego está en memoria del VPS. Cada 30 segundos, al
 * desconectar a alguien y ante cada evento de valor (ascenso, cierre de misión,
 * duelo ganado), lo acumulado se vuelca a MySQL a través de `flush-stats.php`.
 *
 * Tres cosas que hacen que esto no pierda progreso:
 *  1. **Deltas, no absolutos.** Se manda "+320 XP, +5.500 de guita", no el total.
 *     Si el jugador está en dos shards o el volcado llega desordenado, la base
 *     suma bien igual.
 *  2. **Cola con reintento.** Si Hostinger no contesta, el lote vuelve a la cola y
 *     se reintenta con backoff. La partida no se frena porque el hosting esté lento.
 *  3. **Idempotencia.** Cada lote lleva un `batchId`; PHP descarta los repetidos,
 *     así un reintento después de un timeout no duplica la guita.
 */

import { createHmac, randomUUID } from 'node:crypto';
import type { ServerConfig } from '../config/env.ts';

/** Fila de `misiones_historial`: una participación cerrada. */
/**
 * Las cabeceras HTTP son Latin-1: el nombre del shard («Esquel — Centro 01»)
 * lleva guión largo (U+2014) y `fetch` tira
 * *"character at index 7 has a value of 8212"* antes de mandar nada. Se sanea a
 * ASCII sin tocar el nombre que ve el jugador.
 */
export const asciiHeader = (value: string): string =>
  value
    .normalize('NFKD')
    .replace(/[\u2010-\u2015]/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    // eslint-disable-next-line no-control-regex
    .replace(/[^\x20-\x7e]/g, '')
    .trim() || 'esquel';

/** Fila de `misiones_historial`: una participación cerrada. */
export interface QuestRunDelta {
  readonly instanceId: string;
  readonly slug: string;
  readonly type: string;
  readonly trigger: string;
  readonly barrio: string;
  readonly zoneId?: string;
  readonly factionId: number;
  readonly rankTier: number;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly durationS: number;
  readonly outcome: string;
  readonly completion: number;
  readonly contribution: number;
  readonly counters: Readonly<Record<string, number>>;
  readonly xp: number;
  readonly reputation: number;
  readonly money: number;
  readonly territoryScore: number;
  readonly weather: string;
  readonly localHour: number;
  readonly seed: number;
}

/** Fila de `campanas_candidato`: una partida del Modo Candidato. */
export interface CampaignDelta {
  readonly archetype: string;
  readonly seed: number;
  readonly decisions: readonly { readonly cardId: string; readonly optionId: string }[];
  readonly cajaCampana: number;
  readonly roscaPolitica: number;
  readonly imagenPublica: number;
  readonly nivelEscandalo: number;
  readonly ending: string;
  readonly turnsPlayed: number;
  readonly xp: number;
  readonly reputation: number;
  readonly money: number;
}

export interface StatDelta {
  /** `personajes.id` como string decimal. */
  readonly characterId: string;
  readonly xp: number;
  readonly reputation: number;
  /** Guita en centavos. */
  readonly money: number;
  readonly playSeconds: number;
  /** Última posición conocida, para reaparecer donde se dejó. */
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly rankTier: number;
  readonly health: number;
  /** Misiones cerradas en esta ventana. Va vacío la mayoría de los lotes. */
  readonly quests?: readonly QuestRunDelta[];
  /** Campañas del Modo Candidato liquidadas en esta ventana. */
  readonly campaigns?: readonly CampaignDelta[];
}

export interface FlushBatch {
  readonly batchId: string;
  readonly shard: string;
  readonly sentAt: string;
  readonly deltas: readonly StatDelta[];
}

export interface FlushResult {
  readonly ok: boolean;
  readonly persisted: number;
  readonly error?: string;
}

type Logger = { info: (msg: string) => void; warn: (msg: string) => void; error: (msg: string) => void };

const noopLogger: Logger = { info: () => {}, warn: () => {}, error: () => {} };

export class HostingerBridge {
  private readonly config: ServerConfig;
  private readonly log: Logger;
  /** Lotes que fallaron y esperan reintento. */
  private readonly retryQueue: FlushBatch[] = [];
  private failures = 0;

  constructor(config: ServerConfig, log: Logger = noopLogger) {
    this.config = config;
    this.log = log;
  }

  /** Firma del cuerpo: PHP la recalcula con el mismo secreto y compara. */
  private sign(body: string): string {
    return createHmac('sha256', this.config.hostinger.apiKey).update(body).digest('hex');
  }

  /** Arma el lote con los deltas acumulados. */
  buildBatch(deltas: readonly StatDelta[]): FlushBatch {
    return {
      batchId: randomUUID(),
      shard: this.config.shardName,
      sentAt: new Date().toISOString(),
      deltas,
    };
  }

  /**
   * Manda un lote a `flush-stats.php`. Nunca lanza: devuelve el resultado y, si
   * falló, encola para reintentar.
   */
  async flush(batch: FlushBatch): Promise<FlushResult> {
    if (batch.deltas.length === 0) return { ok: true, persisted: 0 };

    const body = JSON.stringify(batch);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.hostinger.timeoutMs);

    try {
      const response = await fetch(`${this.config.hostinger.apiUrl}/sync/flush-stats.php`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-esquel-shard': asciiHeader(this.config.shardName),
          'x-esquel-signature': this.sign(body),
        },
        body,
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`HTTP ${response.status} ${text.slice(0, 200)}`);
      }

      const data = (await response.json()) as { persisted?: number };
      this.failures = 0;
      this.log.info(`[hostinger] lote ${batch.batchId} → ${data.persisted ?? batch.deltas.length} personajes`);
      return { ok: true, persisted: data.persisted ?? batch.deltas.length };
    } catch (err) {
      this.failures++;
      const detail = err instanceof Error ? err.message : String(err);
      // La cola se acota: si Hostinger está caído hace rato, se conservan los
      // últimos lotes y se pierde lo más viejo antes que reventar la memoria.
      this.retryQueue.push(batch);
      while (this.retryQueue.length > 20) this.retryQueue.shift();
      this.log.warn(`[hostinger] falló el lote ${batch.batchId} (intento ${this.failures}): ${detail}`);
      return { ok: false, persisted: 0, error: detail };
    } finally {
      clearTimeout(timer);
    }
  }

  /** Reintenta lo pendiente. Se llama en cada ciclo de volcado. */
  async retryPending(): Promise<number> {
    if (this.retryQueue.length === 0) return 0;
    const pending = this.retryQueue.splice(0, this.retryQueue.length);
    let recovered = 0;
    for (const batch of pending) {
      const result = await this.flush(batch);
      if (result.ok) recovered += result.persisted;
    }
    return recovered;
  }

  /** Espera entre reintentos, con backoff acotado a 5 minutos. */
  get backoffMs(): number {
    return Math.min(300_000, this.config.hostinger.flushIntervalMs * 2 ** Math.min(this.failures, 5));
  }

  get pendingBatches(): number {
    return this.retryQueue.length;
  }

  get healthy(): boolean {
    return this.failures === 0;
  }
}
