/**
 * Colector de telemetría del cliente.
 *
 * Tres reglas que definen todo el diseño:
 *
 *  1. **No bloquea nunca.** `track()` escribe en un array y vuelve. Ni promesas,
 *     ni `await`, ni trabajo en el hilo del render. Si el juego se cae, se cae
 *     por el juego, no por una métrica.
 *  2. **Manda por lote.** Cada 30 segundos, o cuando pasa algo que amerita no
 *     esperar (cambiar de barrio, terminar una misión, cerrar la pestaña).
 *  3. **Reintenta con paciencia.** Si el lote no sale, se reencola con espera
 *     exponencial (2, 4, 8, 16, 32 s) y tope de reintentos. La cola tiene techo:
 *     antes de comerse la memoria del navegador, tira lo más viejo.
 *
 * El transporte es el socket del juego, que ya está autenticado: no hay un
 * endpoint público de telemetría que cualquiera pueda inundar desde consola. Si
 * el jugador está desconectado, los eventos esperan en la cola hasta que vuelva.
 *
 * Sin `telemetryConsent` en el token, sólo salen los eventos `kind: 'sistema'`.
 * Eso se decide acá, en el borde, y no en el servidor: lo que no se manda no se
 * puede filtrar después.
 */

import type {
  Barrio,
  GridCell,
  TelemetryContext,
  TelemetryEvent,
  TelemetryKind,
  TelemetryPayload,
} from '@esquel/shared';
import { TELEMETRY_KINDS, asIsoDateTime, asUuid } from '@esquel/shared';

/* --- números de diseño ---------------------------------------------------- */

/** Cada cuánto sale un lote si nadie lo apura. */
const FLUSH_INTERVAL_MS = 30_000;
/** Tope de eventos en un lote. Coincide con el límite del backend. */
const MAX_BATCH = 50;
/** Techo de la cola: pasado esto se descarta lo más viejo. */
const MAX_QUEUE = 400;
/** Espera del primer reintento; se duplica en cada intento. */
const RETRY_BASE_MS = 2_000;
const RETRY_MAX_MS = 32_000;
/** Reintentos antes de dar el lote por perdido. */
const MAX_RETRIES = 5;

/** Eventos que salen sin esperar los 30 segundos. */
const URGENTES = new Set<string>([
  'vote_intent',
  'faction_switch',
  'quest_finish',
  'rank_up',
  'sponsor_buff_claim',
  'sponsor_cta_click',
  'session_end',
  'client_error',
]);

/* --- tipos ---------------------------------------------------------------- */

/** Cómo sale el lote. Devuelve `true` si el otro lado lo aceptó. */
export type TelemetryTransport = (events: readonly TelemetryEvent[]) => boolean | Promise<boolean>;

export interface CollectorOptions {
  /** Pseudónimo rotativo del sujeto: nunca el id de usuario. */
  readonly subject: string;
  readonly sessionRef: string;
  /** Contexto base; `track()` puede pisar el barrio, la celda y la hora. */
  readonly context: TelemetryContext;
  /** `false` deja pasar sólo los eventos de sistema. */
  readonly consent: boolean;
  readonly transport: TelemetryTransport;
  /** Inyectable para los tests. */
  readonly now?: () => number;
}

interface Pendiente {
  readonly event: TelemetryEvent;
  intentos: number;
}

/** Categoría de cada evento, para la compuerta de consentimiento. */
const KIND_OF_EVENT: Readonly<Record<string, TelemetryKind>> = {
  app_boot: 'sistema', frame_stats: 'sistema', client_error: 'sistema', asset_load_fail: 'sistema',
  session_start: 'sesion', session_end: 'sesion', onboarding_complete: 'sesion', shard_join: 'sesion', shard_leave: 'sesion',
  cell_enter: 'movimiento', poi_visit: 'movimiento', zone_dwell: 'movimiento',
  quest_start: 'progresion', quest_finish: 'progresion', rank_up: 'progresion', debate_finish: 'progresion', rally_join: 'progresion',
  chat_volume: 'social', voice_minutes: 'social', report_submitted: 'social',
  shop_purchase: 'economia', item_use: 'economia', money_sink: 'economia',
  vote_intent: 'politico', issue_priority: 'politico', candidate_reaction: 'politico', news_reaction: 'politico', faction_switch: 'politico',
  sponsor_impression: 'comercial', sponsor_enter: 'comercial', sponsor_buff_claim: 'comercial', sponsor_cta_click: 'comercial',
};

/** UUID v4 con `crypto` cuando está, y con RNG a mano cuando no (Safari viejo). */
const uuid = (): string => {
  const c = globalThis.crypto as Crypto | undefined;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  const b = new Uint8Array(16);
  if (c && typeof c.getRandomValues === 'function') c.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};

/* --- colector ------------------------------------------------------------- */

export class TelemetryCollector {
  private readonly opciones: CollectorOptions;
  private readonly ahora: () => number;
  private cola: Pendiente[] = [];
  private contexto: TelemetryContext;
  private consent: boolean;

  private timer: ReturnType<typeof setInterval> | null = null;
  private reintento: ReturnType<typeof setTimeout> | null = null;
  private enviando = false;
  private esperaMs = RETRY_BASE_MS;

  /** Contadores para el panel de diagnóstico. */
  private readonly stats = { encolados: 0, enviados: 0, descartados: 0, reintentos: 0 };

  constructor(options: CollectorOptions) {
    this.opciones = options;
    this.ahora = options.now ?? (() => Date.now());
    this.contexto = options.context;
    this.consent = options.consent;
  }

  /** Arranca el ciclo de vaciado y engancha el cierre de la pestaña. */
  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.flush('periodico'), FLUSH_INTERVAL_MS);
    if (typeof window !== 'undefined') {
      window.addEventListener('pagehide', this.alCerrar);
      document.addEventListener('visibilitychange', this.alOcultar);
    }
  }

  /** Corta el ciclo y hace un último intento de vaciar. */
  async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.reintento) {
      clearTimeout(this.reintento);
      this.reintento = null;
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('pagehide', this.alCerrar);
      document.removeEventListener('visibilitychange', this.alOcultar);
    }
    await this.flush('cierre');
  }

  /** Actualiza el contexto del segmento (barrio, celda, facción, rango, hora). */
  setContext(patch: Partial<TelemetryContext>): void {
    const barrioAnterior = this.contexto.barrio;
    this.contexto = { ...this.contexto, ...patch };
    // Cambiar de barrio es un corte de segmento: lo que se juntó pertenece al
    // barrio viejo, así que sale ya y no se mezcla con el nuevo.
    if (patch.barrio && patch.barrio !== barrioAnterior) void this.flush('cambio_de_barrio');
  }

  /** El jugador dio o retiró el consentimiento. */
  setConsent(consent: boolean): void {
    if (this.consent === consent) return;
    this.consent = consent;
    if (!consent) {
      // Se retira: lo que todavía no salió y no es de sistema, no sale nunca.
      const antes = this.cola.length;
      this.cola = this.cola.filter((p) => p.event.kind === 'sistema');
      this.stats.descartados += antes - this.cola.length;
    }
  }

  /**
   * Encola un evento. No bloquea, no lanza y no espera a nadie.
   * Devuelve `false` si el evento no se registró (sin consentimiento).
   */
  track(payload: TelemetryPayload, overrides?: { barrio?: Barrio; cell?: GridCell; localHour?: number }): boolean {
    const kind = KIND_OF_EVENT[payload.name];
    if (!kind || !(TELEMETRY_KINDS as readonly string[]).includes(kind)) return false;
    if (!this.consent && kind !== 'sistema') return false;

    const contexto: TelemetryContext = {
      ...this.contexto,
      ...(overrides?.barrio ? { barrio: overrides.barrio } : {}),
      ...(overrides?.cell ? { cell: overrides.cell } : {}),
      ...(overrides?.localHour !== undefined ? { localHour: overrides.localHour } : {}),
    };

    const evento: TelemetryEvent = {
      eventId: asUuid(uuid()),
      kind,
      name: payload.name,
      subject: this.opciones.subject,
      sessionRef: asUuid(this.opciones.sessionRef),
      at: asIsoDateTime(this.ahora()),
      context: contexto,
      payload,
      schemaVersion: 1,
    };

    this.cola.push({ event: evento, intentos: 0 });
    this.stats.encolados++;

    if (this.cola.length > MAX_QUEUE) {
      // La cola tiene techo: se tira lo más viejo, que es lo menos útil.
      const sobran = this.cola.length - MAX_QUEUE;
      this.cola.splice(0, sobran);
      this.stats.descartados += sobran;
    }

    if (URGENTES.has(payload.name) || this.cola.length >= MAX_BATCH) void this.flush('urgente');
    return true;
  }

  /**
   * Manda un lote. Si el transporte falla, lo reencola y programa el reintento
   * con espera exponencial. Nunca lanza.
   */
  async flush(motivo: 'periodico' | 'urgente' | 'cambio_de_barrio' | 'cierre' = 'periodico'): Promise<boolean> {
    if (this.enviando || this.cola.length === 0) return true;
    this.enviando = true;

    const lote = this.cola.splice(0, MAX_BATCH);
    try {
      const ok = await this.opciones.transport(lote.map((p) => p.event));
      if (ok) {
        this.stats.enviados += lote.length;
        this.esperaMs = RETRY_BASE_MS;
        return true;
      }
      this.reencolar(lote, motivo);
      return false;
    } catch {
      this.reencolar(lote, motivo);
      return false;
    } finally {
      this.enviando = false;
    }
  }

  /** Devuelve el lote a la cola y agenda el próximo intento. */
  private reencolar(lote: readonly Pendiente[], motivo: string): void {
    const vivos: Pendiente[] = [];
    for (const p of lote) {
      p.intentos++;
      if (p.intentos > MAX_RETRIES) this.stats.descartados++;
      else vivos.push(p);
    }
    // Van adelante: son los más viejos y los que más cerca están de perderse.
    this.cola.unshift(...vivos);
    this.stats.reintentos++;

    if (motivo === 'cierre' || vivos.length === 0) return;
    if (this.reintento) clearTimeout(this.reintento);
    const espera = this.esperaMs;
    this.esperaMs = Math.min(RETRY_MAX_MS, this.esperaMs * 2);
    this.reintento = setTimeout(() => {
      this.reintento = null;
      void this.flush('periodico');
    }, espera);
  }

  /** Foto para el panel de diagnóstico (F3). */
  snapshot(): { pendientes: number; encolados: number; enviados: number; descartados: number; reintentos: number } {
    return { pendientes: this.cola.length, ...this.stats };
  }

  private readonly alCerrar = (): void => {
    void this.flush('cierre');
  };

  private readonly alOcultar = (): void => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') void this.flush('cierre');
  };
}

/** Instancia única del cliente; se configura en `CityScene` al entrar al shard. */
let colector: TelemetryCollector | null = null;

export const initTelemetry = (options: CollectorOptions): TelemetryCollector => {
  void colector?.stop();
  colector = new TelemetryCollector(options);
  colector.start();
  return colector;
};

export const telemetry = (): TelemetryCollector | null => colector;

/** Atajo seguro: si todavía no hay colector, el evento se pierde sin romper nada. */
export const track = (payload: TelemetryPayload, overrides?: { barrio?: Barrio; cell?: GridCell; localHour?: number }): void => {
  colector?.track(payload, overrides);
};

export const stopTelemetry = async (): Promise<void> => {
  await colector?.stop();
  colector = null;
};
