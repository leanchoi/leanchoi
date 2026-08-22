/**
 * Esquel 2027 — Contratos compartidos: primitivas comunes.
 *
 * Este archivo es la raíz de la jerarquía de tipos. NO debe importar nada
 * (ni siquiera de `/shared`) para poder ser consumido por el cliente (Vite/ESM),
 * por el servidor autoritativo (Node/Colyseus) y por los generadores de código
 * que producen los DTOs de PHP.
 *
 * REGLAS DE SERIALIZACIÓN (contrato inamovible del PROMPT 0):
 *  1. Todo identificador persistido en MySQL como BIGINT UNSIGNED viaja por la red
 *     como *string decimal* (evita la pérdida de precisión de Number > 2^53-1).
 *  2. Todo identificador de tabla de catálogo (SMALLINT/TINYINT) viaja como number.
 *  3. Toda marca temporal absoluta viaja como ISO-8601 en UTC (`2027-03-14T18:25:43.511Z`).
 *  4. Toda marca temporal de simulación (tick del servidor) viaja como epoch en ms.
 *  5. Todo importe monetario in-game ("guita") viaja como entero de centavos.
 *  6. Ningún campo opcional se envía como `null` salvo que el dominio lo requiera:
 *     los ausentes se omiten (`exactOptionalPropertyTypes` está activo).
 */

/** Marca nominal para evitar mezclar identificadores estructuralmente idénticos. */
declare const __brand: unique symbol;
export type Brand<TBase, TTag extends string> = TBase & { readonly [__brand]: TTag };

/* ------------------------------------------------------------------------- */
/* Identificadores                                                            */
/* ------------------------------------------------------------------------- */

/** `usuarios.id` (BIGINT UNSIGNED) serializado como string decimal. */
export type UserId = Brand<string, 'UserId'>;
/** `personajes.id` (BIGINT UNSIGNED) serializado como string decimal. */
export type CharacterId = Brand<string, 'CharacterId'>;
/** `misiones_historial.id` (BIGINT UNSIGNED). */
export type QuestRunId = Brand<string, 'QuestRunId'>;
/** `comercios_patrocinados.id` (INT UNSIGNED). */
export type SponsorId = Brand<number, 'SponsorId'>;
/** `facciones.id` (SMALLINT UNSIGNED). */
export type FactionId = Brand<number, 'FactionId'>;
/** `items_catalogo.id` (SMALLINT UNSIGNED). */
export type ItemId = Brand<number, 'ItemId'>;
/** Slug estable de misión del catálogo Live-Ops (`misiones_catalogo.slug`). */
export type QuestSlug = Brand<string, 'QuestSlug'>;
/** Slug estable de carta de debate (`cartas_debate.slug`). */
export type DebateCardSlug = Brand<string, 'DebateCardSlug'>;
/** Identificador de sala Colyseus (`esquel_city:shard-01`). */
export type RoomId = Brand<string, 'RoomId'>;
/** Sesión de cliente asignada por Colyseus (efímera). */
export type SessionId = Brand<string, 'SessionId'>;
/** Identificador de prefab de edificio (`prefab:alvear-0850`). */
export type PrefabId = Brand<string, 'PrefabId'>;
/** Identificador de parcela catastral sintética (`parcel:C12-M04-L07`). */
export type ParcelId = Brand<string, 'ParcelId'>;
/** UUID v4 canónico en minúsculas. */
export type Uuid = Brand<string, 'Uuid'>;

/* ------------------------------------------------------------------------- */
/* Tiempo                                                                     */
/* ------------------------------------------------------------------------- */

/** ISO-8601 con `Z` (UTC). Ej: `2027-03-14T18:25:43.511Z`. */
export type IsoDateTime = Brand<string, 'IsoDateTime'>;
/** Fecha calendario sin hora, en huso de Esquel. Ej: `2027-03-14`. */
export type IsoDate = Brand<string, 'IsoDate'>;
/** Milisegundos desde epoch UNIX (reloj del servidor autoritativo). */
export type EpochMs = Brand<number, 'EpochMs'>;
/** Minutos [0, 1440) desde la medianoche local de Esquel (UTC-3, sin DST). */
export type MinuteOfDay = Brand<number, 'MinuteOfDay'>;

/* ------------------------------------------------------------------------- */
/* Escalares de dominio                                                       */
/* ------------------------------------------------------------------------- */

/** Centavos de peso argentino in-game. 1 "guita" = 100 centavos. */
export type Centavos = Brand<number, 'Centavos'>;
/** Valor normalizado en [0, 1]. Validar con `isUnitInterval`. */
export type Unit = Brand<number, 'Unit'>;
/** Puntos de experiencia acumulados (entero >= 0). */
export type Xp = Brand<number, 'Xp'>;
/** Reputación con signo, rango [-1000, 1000]. */
export type Reputation = Brand<number, 'Reputation'>;
/** Metros en el plano tangente local (ENU) anclado en Plaza San Martín. */
export type Meters = Brand<number, 'Meters'>;
/** Radianes. */
export type Radians = Brand<number, 'Radians'>;

/* ------------------------------------------------------------------------- */
/* Geometría                                                                  */
/* ------------------------------------------------------------------------- */

/** Vector en el espacio de mundo. `+X` = Este, `+Y` = Arriba, `+Z` = Norte. */
export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface Vec2 {
  readonly x: number;
  readonly z: number;
}

/** Cuaternión normalizado (rotación de avatar / prefab). */
export interface Quat {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly w: number;
}

/** Coordenada geográfica WGS-84. */
export interface LatLon {
  readonly lat: number;
  readonly lon: number;
}

/**
 * Celda de la cuadrícula urbana de Esquel.
 * `col` crece hacia el Este, `row` crece hacia el Norte. El origen `(0,0)` es la
 * manzana cuyo vértice SO coincide con el ancla geográfica del mundo.
 */
export interface GridCell {
  readonly col: number;
  readonly row: number;
}

/** Caja alineada a ejes, en metros de mundo. */
export interface Aabb {
  readonly min: Vec3;
  readonly max: Vec3;
}

/* ------------------------------------------------------------------------- */
/* Enumeraciones de dominio                                                   */
/* ------------------------------------------------------------------------- */

/** Barrios jugables de Esquel (deben coincidir con `perfiles_demograficos.barrio`). */
export const BARRIOS = [
  'centro',
  'badenes',
  'ceferino',
  'bella_vista',
  'don_bosco',
  'estacion',
  'zona_norte',
  'alta_esquel',
  'plan_1000',
  'valle_chico',
  'matadero',
  'villa_ayelen',
  'alto_rio_percy',
  'otro',
] as const;
export type Barrio = (typeof BARRIOS)[number];

/** Franjas etarias usadas por el Motor de Inteligencia (nunca la edad exacta). */
export const AGE_BANDS = ['16-17', '18-24', '25-34', '35-49', '50-64', '65+'] as const;
export type AgeBand = (typeof AGE_BANDS)[number];

/** Autoidentificación de género (opcional, self-report, no infiere nada). */
export const GENDER_IDENTITIES = ['femenino', 'masculino', 'no_binario', 'prefiere_no_decir'] as const;
export type GenderIdentity = (typeof GENDER_IDENTITIES)[number];

/** Interés político declarado en el onboarding de 30 segundos. */
export const POLITICAL_INTEREST_LEVELS = ['nulo', 'bajo', 'medio', 'alto', 'militante'] as const;
export type PoliticalInterest = (typeof POLITICAL_INTEREST_LEVELS)[number];

/** Rangos del árbol de carrera militante (1..10). */
export const RANK_IDS = [
  'chopanero',
  'soldado',
  'puntero',
  'mano_derecha',
  'concejal',
  'director',
  'subsecretario',
  'secretario',
  'viceministro',
  'candidato_provincial',
] as const;
export type RankId = (typeof RANK_IDS)[number];
/** Nivel numérico del rango, 1 (chopanero) .. 10 (candidato provincial). */
export type RankLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

/** Modo de juego activo para una sesión. */
export const GAME_MODES = ['candidato', 'ciudadano'] as const;
export type GameMode = (typeof GAME_MODES)[number];

/** Condición meteorológica normalizada (mapeo desde el proveedor de clima). */
export const WEATHER_CONDITIONS = [
  'despejado',
  'parcial',
  'nublado',
  'niebla',
  'llovizna',
  'lluvia',
  'nieve',
  'aguanieve',
  'tormenta',
  'viento_fuerte',
] as const;
export type WeatherCondition = (typeof WEATHER_CONDITIONS)[number];

/** Estación del año en hemisferio sur, derivada del reloj de Esquel. */
export const SEASONS = ['verano', 'otonio', 'invierno', 'primavera'] as const;
export type Season = (typeof SEASONS)[number];

/* ------------------------------------------------------------------------- */
/* Utilidades de tipos                                                        */
/* ------------------------------------------------------------------------- */

/** Vuelve profundamente inmutable una estructura de datos plana. */
export type DeepReadonly<T> = T extends (infer U)[]
  ? readonly DeepReadonly<U>[]
  : T extends object
    ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
    : T;

/** Al menos una de las claves de `T` es obligatoria. */
export type AtLeastOne<T, K extends keyof T = keyof T> = K extends keyof T
  ? Required<Pick<T, K>> & Partial<Omit<T, K>>
  : never;

/** Resultado explícito (nunca se lanzan excepciones cruzando el borde de red). */
export type Result<T, E = ApiError> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E };

/** Error normalizado devuelto por PHP y por el VPS con la misma forma. */
export interface ApiError {
  /** Código estable, SCREAMING_SNAKE_CASE. Ej: `AUTH_TOKEN_EXPIRED`. */
  readonly code: string;
  /** Mensaje humano en español rioplatense, apto para HUD. */
  readonly message: string;
  /** Estado HTTP equivalente (los errores de WebSocket también lo llevan). */
  readonly httpStatus: number;
  /** Campos inválidos, cuando aplica. */
  readonly fields?: Readonly<Record<string, string>>;
  /** Correlación de trazas entre Hostinger y VPS. */
  readonly traceId?: Uuid;
}

/* ------------------------------------------------------------------------- */
/* Type guards                                                                */
/* ------------------------------------------------------------------------- */

export const isUnitInterval = (n: number): n is Unit => Number.isFinite(n) && n >= 0 && n <= 1;

export const isBarrio = (v: string): v is Barrio => (BARRIOS as readonly string[]).includes(v);

export const isRankId = (v: string): v is RankId => (RANK_IDS as readonly string[]).includes(v);

export const isAgeBand = (v: string): v is AgeBand => (AGE_BANDS as readonly string[]).includes(v);

export const isWeatherCondition = (v: string): v is WeatherCondition =>
  (WEATHER_CONDITIONS as readonly string[]).includes(v);

/** Constructores de branded types (única vía legítima de crear un valor marcado). */
export const asUnit = (n: number): Unit => {
  if (!isUnitInterval(n)) throw new RangeError(`Unit fuera de [0,1]: ${n}`);
  return n as Unit;
};

export const clampUnit = (n: number): Unit => (n < 0 ? 0 : n > 1 ? 1 : Number.isFinite(n) ? n : 0) as Unit;

export const asCentavos = (n: number): Centavos => {
  if (!Number.isInteger(n)) throw new TypeError(`Centavos debe ser entero: ${n}`);
  return n as Centavos;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** UUID canónico en minúsculas. Rechaza cualquier otra cosa. */
export const asUuid = (s: string): Uuid => {
  const v = s.toLowerCase();
  if (!UUID_RE.test(v)) throw new TypeError(`UUID inválido: ${s}`);
  return v as Uuid;
};

/** Marca de tiempo ISO-8601 en UTC, con milisegundos. */
export const asIsoDateTime = (s: string | number | Date): IsoDateTime => {
  const d = s instanceof Date ? s : new Date(s);
  if (Number.isNaN(d.getTime())) throw new RangeError(`Fecha inválida: ${String(s)}`);
  return d.toISOString() as IsoDateTime;
};

/** Fecha ISO (sólo el día) en UTC. */
export const asIsoDate = (s: string | number | Date): IsoDate => {
  const iso = asIsoDateTime(s);
  return iso.slice(0, 10) as IsoDate;
};

export const asXp = (n: number): Xp => {
  if (!Number.isInteger(n) || n < 0) throw new RangeError(`Xp inválido: ${n}`);
  return n as Xp;
};

export const asReputation = (n: number): Reputation => {
  const r = Math.round(n);
  return (r < -1000 ? -1000 : r > 1000 ? 1000 : r) as Reputation;
};

/** Identificadores BIGINT: string de dígitos, sin ceros a la izquierda. */
const BIGINT_RE = /^(0|[1-9]\d{0,19})$/;
export const isBigIntId = (v: string): boolean => BIGINT_RE.test(v);
