/**
 * Esquel 2027 — Tunables de balance.
 *
 * TODAS las constantes numéricas de gameplay viven acá. Ni el cliente ni el
 * servidor pueden declarar magic numbers de balance: si aparece uno nuevo, entra
 * en este archivo y se documenta en `/docs/game-design/balance-formulas.md`.
 * Antigravity valida la paridad doc ↔ código con `npm run check:balance`.
 */

import type { QuestType } from '../types/quests.ts';
import type { WeatherCondition } from '../types/common.ts';

/* ------------------------------------------------------------------ */
/* 1. Progresión                                                       */
/* ------------------------------------------------------------------ */

export const XP_CURVE = {
  /** ΔXP(n→n+1) = round25( BASE · n^EXPONENT · GROWTH^(n-1) ). */
  BASE: 900,
  EXPONENT: 1.6,
  GROWTH: 1.18,
  QUANTUM: 25,
} as const;

export const REPUTATION = {
  MIN: -1000,
  MAX: 1000,
  /** Requisito de rango: round( REP_BASE · (n-1)^REP_EXPONENT ). */
  REP_BASE: 30,
  REP_EXPONENT: 1.2,
  /** Decaimiento diario hacia 0 (la fama se olvida). */
  DAILY_DECAY: 0.02,
  /** Reputación mínima antes de que la facción te expulse. */
  EXPULSION_THRESHOLD: -250,
} as const;

export const LOYALTY = {
  /** Ganancia por misión completada para la propia facción. */
  PER_QUEST: 0.012,
  /** Pérdida diaria por inactividad. */
  DAILY_DECAY: 0.008,
  /** Pérdida por perder un duelo contra la propia facción. */
  FRIENDLY_FIRE: 0.05,
  MAX: 1,
  MIN: 0,
} as const;

/** Rendimientos decrecientes al repetir la misma misión en el día. */
export const REPEAT_DIMINISH = {
  /** Multiplicador = max(FLOOR, DECAY^(repeticiones - 1)). */
  DECAY: 0.82,
  FLOOR: 0.25,
  /** Sobre el `dailyQuestCap` del rango, todo rinde este multiplicador. */
  OVER_CAP: 0.15,
} as const;

/* ------------------------------------------------------------------ */
/* 2. Vitales                                                          */
/* ------------------------------------------------------------------ */

export const VITALS = {
  HEALTH_MAX_BASE: 100,
  /** +4 de salud máxima por nivel de rango por encima de 1. */
  HEALTH_PER_RANK: 4,
  STAMINA_MAX_BASE: 100,
  /** Puntos por segundo. */
  STAMINA_REGEN: 6,
  STAMINA_SPRINT_COST: 12,
  /** Salud por segundo fuera de combate, tras 8 s sin recibir daño. */
  HEALTH_REGEN: 1.5,
  HEALTH_REGEN_DELAY_S: 8,
  /** Pérdida de abrigo por segundo a la intemperie con < 5 °C. */
  WARMTH_LOSS_COLD: 0.0016,
  WARMTH_GAIN_INDOOR: 0.01,
  /** Daño por segundo cuando el abrigo llega a 0. */
  HYPOTHERMIA_DPS: 0.8,
  RESPAWN_SECONDS: 12,
} as const;

/** Velocidades base en m/s. */
export const MOVEMENT = {
  WALK: 2.6,
  RUN: 4.8,
  SPRINT: 6.9,
  JUMP_IMPULSE: 5.2,
  GRAVITY: -18.5,
  /** Tolerancia del servidor a la deriva de posición del cliente, en metros. */
  RECONCILE_TOLERANCE_M: 0.65,
  /** Velocidad máxima aceptada antes de marcar el movimiento como sospechoso. */
  MAX_PLAUSIBLE_SPEED: 9.0,
} as const;

/* ------------------------------------------------------------------ */
/* 3. Debate                                                           */
/* ------------------------------------------------------------------ */

export const DEBATE = {
  /* --- recursos --- */
  /**
   * Credibilidad = CRED_BASE + CRED_PER_RANK·(rango−1) + bonus de reputación.
   * El rango llega hasta 225 y la fama pone los últimos 25: el techo de diseño
   * son 250 y se alcanza sólo siendo Candidato Provincial y con nombre hecho.
   */
  CRED_BASE: 100,
  CRED_PER_RANK: 13.89,
  CRED_PER_REP: 0.025,
  CRED_REP_CAP: 25,
  /** Labia: la energía del duelo. */
  LABIA_START: 5,
  LABIA_REGEN: 3,
  LABIA_MAX: 12,
  /** Pasar el turno recupera de más: a veces conviene callarse. */
  LABIA_PASS_BONUS: 2,
  /** Retórica = RHET_BASE + RHET_PER_RANK·(rango-1). Escala el daño. */
  RHET_BASE: 20,
  RHET_PER_RANK: 3.5,
  /**
   * Escala global del daño: daño = poder · (1 + retórica/RHET_SCALE) · …
   * Calibrada para que un duelo típico dure 6-9 turnos (ver balance-formulas §3).
   */
  RHET_SCALE: 48,

  /* --- multiplicadores por familia --- */
  /** Golpear a la familia que contrarrestás. */
  COUNTER_MULT: 1.4,
  /** Golpear a la familia que te contrarresta a vos. */
  COUNTERED_MULT: 0.75,
  /** Afinidad de facción. */
  AFFINITY_MULT: 1.1,
  /** CARPETAZO cuando el rival mintió el turno anterior: le duele de verdad. */
  CARPETAZO_ON_LIE: 1.6,
  /** CARPETAZO sin mentira que aprovechar: mucho ruido y poca nuez. */
  CARPETAZO_NO_LIE: 0.45,
  /** INVOCAR_AL_LIDER escala con el control de tu facción en la zona. */
  LIDER_ZONE_MIN: 0.8,
  LIDER_ZONE_MAX: 1.5,

  /* --- público --- */
  /** Cuánto amortigua el favor del público el daño que recibe su favorito. */
  CROWD_DEFENSE: 0.25,
  /** Cuánto se corre el favor por golpe efectivo. */
  CROWD_SHIFT: 0.05,
  SPECTATOR_WEIGHT: 0.01,
  SPECTATOR_CAP: 0.15,

  /**
   * Piso de daño que se suma a toda carta antes de escalar. Comprime la distancia
   * entre la chicana barata y el bombazo caro: sin esto, las épicas ganaban solas
   * y el mazo dejaba de ser una decisión.
   */
  DAMAGE_FLOOR: 8,

  /* --- fallos --- */
  /** Credibilidad que perdés por errar la carta. */
  MISS_CRED_PENALTY: 3,
  /** Daño propio al que se le vuelve en contra, como fracción del poder. */
  BACKFIRE_SELF: 0.5,

  /* --- estructura del duelo --- */
  /** Un turno = juegan los dos. */
  MAX_TURNS: 12,
  TURN_SECONDS: 30,
  DECK_SIZE: 12,
  HAND_SIZE: 4,
  /** Diferencia máxima de rango admitida (matchmaking de esquina). */
  MAX_RANK_GAP: 3,

  /* --- recompensas --- */
  WIN_XP: 320,
  LOSS_XP: 90,
  WIN_REP: 12,
  LOSS_REP: -6,
} as const;

/* ------------------------------------------------------------------ */
/* 4. Territorio y movilizaciones                                      */
/* ------------------------------------------------------------------ */

export const TERRITORY = {
  /** Radio efectivo de una zona de movilización, en metros. */
  ZONE_RADIUS_M: 45,
  /** Ventana de acumulación de puntaje, en segundos. */
  TICK_SECONDS: 10,
  /** Puntos por tick por unidad de presencia ponderada. */
  POINTS_PER_TICK: 1.0,
  /**
   * Exponente del rango en el aporte individual: `Rango^0.75`. Un Concejal (5)
   * aporta 3,3 y un Chopanero (1) aporta 1: pesa más, pero no arrasa.
   */
  RANK_EXPONENT: 0.75,
  /** Bonus por coordinación: fracción de militantes en el radio interior. */
  COHESION_BONUS_MAX: 0.35,
  COHESION_RADIUS_M: 18,
  /** Aporte de la voz espacial activa (cantar consignas juntos). */
  VOICE_BONUS: 0.12,
  /** Decaimiento del puntaje acumulado por minuto sin presencia. */
  DECAY_PER_MINUTE: 0.06,
  /** Porcentaje de poder que hay que sostener para capturar la zona. */
  CAPTURE_THRESHOLD: 0.6,
  /** Cuánto hay que sostenerlo, en segundos. Cinco minutos de aguante. */
  CAPTURE_HOLD_S: 300,
  /** Bonus de XP y guita para los afiliados mientras la facción controla la zona. */
  CONTROL_BUFF_XP: 1.15,
  CONTROL_BUFF_MONEY: 1.12,
  /** Ventaja del defensor: multiplica su puntaje mientras controla la zona. */
  DEFENDER_ADVANTAGE: 1.15,
  /** Tope de militantes que suman por facción en una misma zona. */
  HEADCOUNT_CAP: 40,
  /** Segundos sin input tras los cuales el jugador deja de sumar presencia. */
  AFK_SECONDS: 180,
  /** Duración por defecto de una movilización convocada. */
  RALLY_SECONDS: 600,
  /** Puntos de intención de voto que aporta controlar una zona (por peso). */
  SUPPORT_PER_ZONE: 0.004,
} as const;

/* ------------------------------------------------------------------ */
/* 5. Clima y contexto                                                 */
/* ------------------------------------------------------------------ */

/** Multiplicadores por condición meteorológica. */
export const WEATHER_MODIFIERS: Readonly<
  Record<WeatherCondition, { moveSpeed: number; rallyTurnout: number; posterLifetime: number; outdoorXp: number }>
> = {
  despejado: { moveSpeed: 1.0, rallyTurnout: 1.0, posterLifetime: 1.0, outdoorXp: 1.0 },
  parcial: { moveSpeed: 1.0, rallyTurnout: 0.98, posterLifetime: 1.0, outdoorXp: 1.0 },
  nublado: { moveSpeed: 1.0, rallyTurnout: 0.95, posterLifetime: 1.0, outdoorXp: 1.02 },
  niebla: { moveSpeed: 0.96, rallyTurnout: 0.85, posterLifetime: 0.95, outdoorXp: 1.08 },
  llovizna: { moveSpeed: 0.97, rallyTurnout: 0.82, posterLifetime: 0.7, outdoorXp: 1.1 },
  lluvia: { moveSpeed: 0.93, rallyTurnout: 0.7, posterLifetime: 0.45, outdoorXp: 1.2 },
  nieve: { moveSpeed: 0.82, rallyTurnout: 0.6, posterLifetime: 0.55, outdoorXp: 1.35 },
  aguanieve: { moveSpeed: 0.85, rallyTurnout: 0.62, posterLifetime: 0.4, outdoorXp: 1.3 },
  tormenta: { moveSpeed: 0.88, rallyTurnout: 0.45, posterLifetime: 0.3, outdoorXp: 1.45 },
  viento_fuerte: { moveSpeed: 0.9, rallyTurnout: 0.68, posterLifetime: 0.5, outdoorXp: 1.25 },
};

/** Multiplicador por franja horaria local (índice = hora 0..23). */
export const HOUR_ACTIVITY_MULTIPLIER: readonly number[] = [
  0.6, 0.55, 0.5, 0.5, 0.5, 0.55, 0.7, 0.85, 1.0, 1.05, 1.1, 1.1, 1.0, 0.95, 1.0, 1.05, 1.15, 1.25, 1.3, 1.25, 1.15,
  1.0, 0.85, 0.7,
];

/* ------------------------------------------------------------------ */
/* 6. Misiones                                                         */
/* ------------------------------------------------------------------ */

export interface QuestBaseline {
  /** XP base al 100% de completitud, antes de multiplicadores. */
  readonly xp: number;
  readonly reputation: number;
  /** Guita base en centavos. */
  readonly money: number;
  /** Aporte base al puntaje territorial. */
  readonly territory: number;
  /** Duración objetivo, en segundos. */
  readonly durationS: number;
  readonly group: boolean;
  /** Al aire libre: le aplica el multiplicador de clima. */
  readonly outdoor: boolean;
}

export const QUEST_BASELINES: Readonly<Record<QuestType, QuestBaseline>> = {
  PEGATINA_RELAMPAGO: { xp: 210, reputation: 4, money: 4500, territory: 10, durationS: 300, group: false, outdoor: true },
  BANDERAZO_CALLEJERO: { xp: 380, reputation: 12, money: 6000, territory: 28, durationS: 480, group: true, outdoor: true },
  OPERACION_DESMENTIDA: { xp: 420, reputation: 14, money: 7000, territory: 16, durationS: 900, group: false, outdoor: true },
  REPARTO_BARRIAL: { xp: 300, reputation: 16, money: 5200, territory: 12, durationS: 600, group: false, outdoor: true },
  CARAVANA_DE_BLOQUES: { xp: 360, reputation: 10, money: 6500, territory: 20, durationS: 540, group: true, outdoor: true },
  CORTE_DE_CINTA: { xp: 400, reputation: 15, money: 9000, territory: 22, durationS: 720, group: true, outdoor: true },
  TEMPORAL_CORDILLERANO: { xp: 450, reputation: 22, money: 7000, territory: 12, durationS: 600, group: true, outdoor: true },
  GUERRA_DE_PUNTEROS: { xp: 340, reputation: 8, money: 5500, territory: 18, durationS: 420, group: false, outdoor: true },
  CONFERENCIA_PRENSA: { xp: 320, reputation: 11, money: 5200, territory: 8, durationS: 240, group: false, outdoor: false },
  SONDEO_VECINAL: { xp: 260, reputation: 7, money: 4200, territory: 6, durationS: 420, group: false, outdoor: true },
};

/** Cupo global de misiones simultáneas por shard. */
export const LIVEOPS = {
  MAX_ACTIVE_QUESTS: 24,
  MAX_PER_BARRIO: 4,
  /** Relevancia mínima de la noticia para generar misión. */
  MIN_NEWS_SALIENCE: 0.35,
  /** Ventana de vida por defecto de una misión emergente, en segundos. */
  DEFAULT_TTL_S: 3600,
  /** Anticipación con la que se anuncia antes de activarse. */
  ANNOUNCE_LEAD_S: 120,
} as const;

/* ------------------------------------------------------------------ */
/* 7. Red, chat y voz                                                  */
/* ------------------------------------------------------------------ */

export const NET = {
  /** Frecuencia de simulación del servidor. */
  TICK_HZ: 20,
  /** Frecuencia de envío de patches de estado. */
  PATCH_HZ: 10,
  /** Radio de interés: sólo se replican entidades dentro de este radio. */
  AOI_RADIUS_M: 120,
  MAX_PLAYERS_PER_ROOM: 120,
  /** Intents por segundo aceptados por jugador antes de throttling. */
  INTENT_RATE_LIMIT: 30,
  HEARTBEAT_MS: 5000,
  DISCONNECT_GRACE_MS: 30000,
} as const;

export const CHAT = {
  MAX_LENGTH: 180,
  /** Radio de audibilidad del chat de texto local, en metros. */
  LOCAL_RADIUS_M: 25,
  BUBBLE_TTL_MS: 7000,
  /** Mensajes por ventana de 10 s. */
  RATE_LIMIT: 6,
  COOLDOWN_MS: 1200,
} as const;

export const VOICE = {
  /** Distancia hasta la que el volumen es 1.0. */
  FULL_VOLUME_M: 4,
  /** Distancia a la que el volumen llega a 0. */
  MAX_RANGE_M: 22,
  /** Curva de atenuación: volume = (1 - t)^ROLLOFF_EXP. */
  ROLLOFF_EXP: 1.8,
  /** Amplificación del megáfono (ítem). */
  MEGAPHONE_RANGE_M: 60,
  /** Máximo de pares simultáneos en la malla WebRTC antes de degradar a SFU. */
  MESH_PEER_LIMIT: 8,
  /** Umbral de detección de voz. */
  VAD_THRESHOLD_DB: -45,
} as const;

/* ------------------------------------------------------------------ */
/* 8. Economía                                                         */
/* ------------------------------------------------------------------ */

export const ECONOMY = {
  /** Guita inicial, en centavos. */
  STARTING_MONEY: 250000,
  /** Tope de guita en mano por rango: CAP_BASE · CAP_GROWTH^(rango-1). */
  CAP_BASE: 5000000,
  CAP_GROWTH: 1.6,
  /** Comisión de la facción sobre las recompensas (va al tesoro). */
  FACTION_CUT: 0.1,
  /** Inflación diaria aplicada a precios de comercios (0 = estable). */
  DAILY_INFLATION: 0.0,
} as const;
