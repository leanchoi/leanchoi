/**
 * Esquel 2027 — Contrato del estado de mundo.
 *
 * `WorldState` es la raíz replicada por Colyseus (`Room<WorldState>`). Se
 * sincroniza a 20 Hz para transformadas y por evento para el resto. El reloj y
 * el clima son autoritativos del servidor: el cliente NUNCA los calcula solo,
 * para que dos jugadores nunca vean distinta hora o distinto tiempo.
 */

import type {
  Barrio,
  CharacterId,
  EpochMs,
  FactionId,
  GridCell,
  IsoDateTime,
  LatLon,
  Meters,
  MinuteOfDay,
  RoomId,
  Season,
  SessionId,
  SponsorId,
  Unit,
  Vec3,
  WeatherCondition,
} from './common.ts';
import type { PlayerState } from './player.ts';
import type { LiveQuest } from './quests.ts';

/** Reloj de Esquel (UTC-3, sin horario de verano). */
export interface WorldClock {
  /** Instante real UTC del último tick de reloj. */
  readonly utc: IsoDateTime;
  /** Minutos desde medianoche en hora local de Esquel. */
  readonly localMinute: MinuteOfDay;
  /** `0`=domingo .. `6`=sábado, en hora local. */
  readonly weekday: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  readonly season: Season;
  /** Elevación solar en grados (negativa de noche). Dirige la luz direccional. */
  readonly sunElevationDeg: number;
  /** Azimut solar en grados desde el Norte, sentido horario. */
  readonly sunAzimuthDeg: number;
  /** Minuto local del amanecer y del atardecer, calculados para la fecha actual. */
  readonly sunriseMinute: MinuteOfDay;
  readonly sunsetMinute: MinuteOfDay;
  /** Fase día/noche derivada, para simplificar el shader del cielo. */
  readonly phase: 'noche' | 'amanecer' | 'dia' | 'atardecer';
  /** Escala de tiempo del juego. `1` = tiempo real (default en Modo Ciudadano). */
  readonly timeScale: number;
}

/** Clima vigente en Esquel, normalizado desde el proveedor externo. */
export interface WorldWeather {
  readonly condition: WeatherCondition;
  /** Temperatura del aire en °C. */
  readonly temperatureC: number;
  /** Sensación térmica en °C (viento patagónico incluido). */
  readonly feelsLikeC: number;
  /** Humedad relativa [0,1]. */
  readonly humidity: Unit;
  /** Velocidad del viento en km/h y dirección en grados desde el Norte. */
  readonly windKph: number;
  readonly windDirDeg: number;
  /** Ráfaga máxima en km/h; > 70 dispara el evento `viento_fuerte`. */
  readonly windGustKph: number;
  /** Precipitación en mm/h (lluvia) y cm/h equivalente (nieve). */
  readonly precipMmH: number;
  readonly snowCmH: number;
  /** Cobertura nubosa [0,1] para el shader de cielo. */
  readonly cloudCover: Unit;
  /** Acumulación de nieve en suelo [0,1]; controla el blend de terreno. */
  readonly snowCoverage: Unit;
  /** Visibilidad en metros (niebla del valle). */
  readonly visibilityM: Meters;
  /** Última actualización efectiva desde la API de clima. */
  readonly fetchedAt: IsoDateTime;
  /** `true` si el dato es fallback (proveedor caído): el cliente lo señala en el HUD. */
  readonly stale: boolean;
  /** Multiplicadores globales derivados del clima (ver `/docs/game-design/balance-formulas.md`). */
  readonly gameplayModifiers: {
    /** Velocidad de movimiento (nieve/hielo la reducen). */
    readonly moveSpeed: number;
    /** Asistencia a movilizaciones (llover ⇒ menos gente en la calle). */
    readonly rallyTurnout: number;
    /** Duración de afiches pegados (lluvia los despega antes). */
    readonly posterLifetime: number;
    /** Ganancia de XP en misiones al aire libre (bonus por hacerlo con mal tiempo). */
    readonly outdoorXp: number;
  };
}

/** Facción replicada (subconjunto de `facciones` + estado vivo). */
export interface FactionState {
  readonly id: FactionId;
  readonly slug: string;
  readonly name: string;
  readonly shortName: string;
  readonly colorPrimary: string;
  readonly colorSecondary: string;
  /** Intención de voto simulada [0,1], normalizada entre facciones activas. */
  readonly support: Unit;
  /** Manzanas controladas en este shard. */
  readonly territoryCells: number;
  /** Militantes conectados ahora. */
  readonly onlineMembers: number;
  /** Fondos de campaña de la facción, en centavos. */
  readonly treasury: number;
}

/** Zona de control territorial: una o más manzanas + una esquina clave. */
export interface TerritoryZone {
  /** `zone:plaza-san-martin`, `zone:alvear-25mayo`, `zone:la-trochita`. */
  readonly id: string;
  readonly name: string;
  readonly barrio: Barrio;
  readonly cells: readonly GridCell[];
  /** Centro de la zona en coordenadas de mundo (para el minimapa y el spawn). */
  readonly center: Vec3;
  readonly radiusM: Meters;
  /** Facción que controla la zona ahora mismo. */
  readonly controlledBy?: FactionId;
  /** Puntaje de control por facción, normalizado [0,1]. Ver fórmula de movilización. */
  readonly controlScore: Readonly<Record<string, Unit>>;
  /** Peso estratégico de la zona (multiplica su aporte a la intención de voto). */
  readonly weight: number;
  /** Movilización activa en la zona, si la hay. */
  readonly activeRally?: RallyState;
  /** Momento de la última captura. */
  readonly lastFlipAt?: EpochMs;
}

/** Movilización coordinada en curso (esquina caliente). */
export interface RallyState {
  readonly id: string;
  readonly zoneId: string;
  readonly startedAt: EpochMs;
  readonly endsAt: EpochMs;
  /** Participantes por facción (sólo no-AFK dentro del radio). */
  readonly headcount: Readonly<Record<string, number>>;
  /** Puntaje acumulado por facción durante la movilización. */
  readonly score: Readonly<Record<string, number>>;
  /** Facción convocante. */
  readonly calledBy: FactionId;
  /** Nivel de tensión [0,1]: > 0.8 habilita empujones y corte de calle. */
  readonly tension: Unit;
}

/** NPC replicado (loco del pueblo, deportista célebre, tortafritera, perro). */
export interface NpcState {
  readonly id: string;
  /** Arquetipo del catálogo de lore local. */
  readonly archetype:
    | 'loco_del_pueblo'
    | 'deportista_celebre'
    | 'tortafritera'
    | 'perro_callejero'
    | 'periodista'
    | 'jubilada'
    | 'mochilero'
    | 'inspector_municipal';
  readonly displayName: string;
  readonly position: Vec3;
  readonly yaw: number;
  readonly locomotion: 'idle' | 'walk' | 'run' | 'interact';
  /** Interacción disponible al acercarse. */
  readonly interaction?: 'dialogo' | 'trompadas' | 'high_five' | 'venta' | 'entrevista';
  /** Vence y despawnea (los NPC son efímeros y por barrio). */
  readonly despawnAt: EpochMs;
}

/** Marquesina de comercio patrocinado, tal como la ve el cliente. */
export interface SponsorBillboard {
  readonly sponsorId: SponsorId;
  readonly name: string;
  readonly prefabId: string;
  readonly position: Vec3;
  readonly yaw: number;
  /** Textura de marquesina (ruta relativa al CDN de Hostinger). */
  readonly signTexture: string;
  /** Buff que otorga al entrar/comprar. */
  readonly buffSlug?: string;
  /** Horario real de atención; fuera de él la marquesina se apaga. */
  readonly openMinute: MinuteOfDay;
  readonly closeMinute: MinuteOfDay;
  readonly open: boolean;
}

/** Configuración georreferenciada del mundo (constante por build). */
export interface WorldAnchor {
  /** Ancla ENU: esquina de referencia de Plaza San Martín, Esquel. */
  readonly origin: LatLon;
  /** Rotación de la cuadrícula respecto del Norte geográfico, en grados. */
  readonly gridBearingDeg: number;
  /** Lado de manzana en metros (cuadra tipo de Esquel). */
  readonly blockSizeM: number;
  /** Ancho de calzada + veredas, en metros. */
  readonly streetWidthM: number;
  /** Arista del voxel en metros. */
  readonly voxelSizeM: number;
  /** Extensión jugable en celdas: `[minCol, minRow, maxCol, maxRow]`. */
  readonly bounds: readonly [number, number, number, number];
}

/** Estado raíz replicado de la sala. */
export interface WorldState {
  readonly roomId: RoomId;
  /** Nombre del shard visible en el selector (`Esquel — Centro 01`). */
  readonly shardName: string;
  /** Versión del protocolo; mismatch mayor ⇒ el cliente fuerza recarga. */
  readonly protocolVersion: string;
  readonly anchor: WorldAnchor;

  readonly tick: number;
  readonly serverTime: EpochMs;
  readonly clock: WorldClock;
  readonly weather: WorldWeather;

  /** Jugadores conectados, indexados por `sessionId`. */
  readonly players: Readonly<Record<string, PlayerState>>;
  /** NPCs vivos, indexados por id. */
  readonly npcs: Readonly<Record<string, NpcState>>;
  /** Facciones activas del shard. */
  readonly factions: Readonly<Record<string, FactionState>>;
  /** Zonas territoriales, indexadas por `TerritoryZone.id`. */
  readonly zones: Readonly<Record<string, TerritoryZone>>;
  /** Misiones Live-Ops publicadas y todavía vigentes. */
  readonly quests: Readonly<Record<string, LiveQuest>>;
  /** Marquesinas de comercios cargadas para el shard. */
  readonly sponsors: readonly SponsorBillboard[];

  /** Aforo del shard. */
  readonly population: number;
  readonly capacity: number;
  /** Aviso global rotativo del HUD (evento, mantenimiento, resultado electoral). */
  readonly ticker?: { readonly text: string; readonly until: EpochMs };
}

/** Vista reducida enviada al selector de shards antes de entrar (REST, no WS). */
export interface ShardSummary {
  readonly roomId: RoomId;
  readonly shardName: string;
  readonly population: number;
  readonly capacity: number;
  readonly weather: WeatherCondition;
  readonly localMinute: MinuteOfDay;
  readonly dominantFaction?: FactionId;
  readonly pingHintMs: number;
}

/** Identidad de un jugador para listas sociales (no replica transform). */
export interface PlayerDirectoryEntry {
  readonly sessionId: SessionId;
  readonly charId: CharacterId;
  readonly nick: string;
  readonly factionId?: FactionId;
  readonly rankLevel: number;
  readonly barrio: Barrio;
  readonly afk: boolean;
}
