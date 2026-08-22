/**
 * Estado replicado de un jugador (Colyseus Schema).
 *
 * QUÉ VIAJA POR ACÁ Y QUÉ NO — esta distinción es la que sostiene el AOI:
 *
 *  · Este esquema es el **padrón** del shard: quién está conectado, con qué apodo,
 *    de qué facción, en qué manzana anda y qué está haciendo. Se replica a todos,
 *    pero con escritura **gruesa** (1 Hz) porque nada de esto cambia rápido.
 *  · Las coordenadas finas (`x/y/z/yaw` a 10 Hz) NO viajan por el estado replicado:
 *    van por el canal `s2c.aoi`, dirigido, y sólo a quienes están a menos de
 *    `AOI_CELLS` manzanas. Colyseus 0.15 con @colyseus/schema 2.x no tiene filtros
 *    por cliente, así que el interest management se hace con mensajes.
 *
 * Los campos `x/y/z/yaw` de acá existen igual: son la última posición gruesa, lo
 * que alcanza para el minimapa, para el "¿quién anda por la Plaza?" y para que un
 * cliente que recién entra sepa dónde dibujar a cada uno antes del primer paquete
 * de AOI.
 */

import { Schema, type } from '@colyseus/schema';

export class PlayerState extends Schema {
  /** Sesión de Colyseus: identidad efímera dentro de la sala. */
  @type('string') sessionId = '';
  /** `usuarios.id` como string decimal. */
  @type('string') userId = '';
  /** `personajes.id` como string decimal. */
  @type('string') characterId = '';
  /** Apodo visible sobre la cabeza. */
  @type('string') alias = 'Vecino';

  /* --- identidad política --- */
  /** 0 = independiente (todavía no se afilió a nadie). */
  @type('uint8') factionId = 0;
  /** Rango militante 1..10: de Chopanero a Candidato Provincial. */
  @type('uint8') rankTier = 1;
  /** Barrio declarado en el onboarding. */
  @type('string') barrio = 'centro';

  /* --- transformada gruesa (1 Hz) --- */
  @type('float32') x = 0;
  @type('float32') y = 0;
  @type('float32') z = 0;
  /** Rumbo del cuerpo en radianes. */
  @type('float32') yaw = 0;
  /** Manzana donde está parado: la unidad del interest management. */
  @type('int16') cellCol = 0;
  @type('int16') cellRow = 0;

  /* --- qué está haciendo --- */
  /** IDLE · WALK · RUN · JUMP · MATE · AFICHE · DEBATE_READY */
  @type('string') anim = 'IDLE';
  /** Sin input hace más de 3 minutos: deja de sumar para el control territorial. */
  @type('boolean') afk = false;

  /* --- voz --- */
  /** Tiene micrófono habilitado y permiso concedido. */
  @type('boolean') voiceEnabled = false;
  /** Está hablando en este instante (lo dispara el VAD del cliente). */
  @type('boolean') speaking = false;
  /** Silenciado por moderación: el servidor deja de retransmitir su señalización. */
  @type('boolean') muted = false;

  /* --- progresión visible --- */
  @type('uint32') xp = 0;
  @type('int16') reputation = 0;
  @type('uint16') health = 100;

  /* --- conexión --- */
  /** `false` mientras dura la ventana de reconexión: el avatar queda en la calle. */
  @type('boolean') connected = true;
  @type('float64') joinedAt = 0;
}

/**
 * Datos del jugador que NO se replican a los demás.
 *
 * La guita es privada: no hace falta que media Esquel sepa cuánto tenés en el
 * bolsillo. Viaja sólo a su dueño, por mensaje directo.
 */
/** Una misión terminada, esperando el próximo volcado a MySQL. */
export interface PendingQuestRun {
  readonly instanceId: string;
  readonly slug: string;
  readonly type: string;
  readonly trigger: string;
  readonly barrio: string;
  readonly zoneId?: string;
  readonly factionId: number;
  readonly rankTier: number;
  readonly startedAt: number;
  readonly finishedAt: number;
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

/** Una campaña del Modo Candidato ya liquidada. */
export interface PendingCampaign {
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

export interface PrivatePlayerData {
  /** Guita en centavos. */
  money: number;
  /** Lealtad a la facción [0,1]. */
  loyalty: number;
  /** XP acumulada desde el último volcado a MySQL. */
  pendingXp: number;
  pendingMoney: number;
  pendingReputation: number;
  /** Segundos jugados desde que entró. */
  playSeconds: number;
  /** Misiones cerradas que todavía no se escribieron en `misiones_historial`. */
  pendingQuests: PendingQuestRun[];
  /** Campañas liquidadas que todavía no se escribieron en `campanas_candidato`. */
  pendingCampaigns: PendingCampaign[];
}
