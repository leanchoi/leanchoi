/**
 * Estado replicado del mundo.
 *
 * Todo lo que es igual para los 120 jugadores del shard: el reloj de Esquel, el
 * clima, la fase electoral, cómo viene la interna entre facciones y el padrón de
 * quién está conectado.
 *
 * Es barato de replicar (unos pocos cientos de bytes) y cambia lento, así que va
 * entero por el canal de estado de Colyseus. Lo caro —las posiciones a 10 Hz— va
 * por el canal de AOI.
 */

import { MapSchema, Schema, type } from '@colyseus/schema';
import { PlayerState } from './PlayerState.ts';

/** Reloj de Esquel (UTC-3, sin horario de verano). */
export class WorldClockState extends Schema {
  /** Minutos desde la medianoche, hora local. */
  @type('uint16') localMinute = 0;
  /** 0 = domingo. */
  @type('uint8') weekday = 0;
  /** verano · otonio · invierno · primavera */
  @type('string') season = 'invierno';
  /** noche · amanecer · dia · atardecer */
  @type('string') phase = 'dia';
  @type('float32') sunElevationDeg = 0;
  @type('float32') sunAzimuthDeg = 0;
}

/** Clima vivo de la ciudad, tal como lo publica el proveedor. */
export class WorldWeatherState extends Schema {
  @type('string') condition = 'parcial';
  @type('float32') temperatureC = 10;
  @type('float32') feelsLikeC = 10;
  @type('float32') windKph = 0;
  @type('uint16') windDirDeg = 270;
  @type('float32') windGustKph = 0;
  @type('float32') cloudCover = 0.4;
  @type('float32') snowCoverage = 0;
  @type('uint32') visibilityM = 20000;
  /** `true` si el dato es de la climatología y no del proveedor. */
  @type('boolean') stale = true;
}

/** Fase del ciclo electoral 2027. */
export class ElectionPhaseState extends Schema {
  /** PRE_CAMPAIGN · OFFICIAL_CAMPAIGN · VEDA · ELECTION_DAY · POST_ELECTION */
  @type('string') phase = 'PRE_CAMPAIGN';
  @type('string') badge = 'Precampaña';
  /** Apertura de urnas en ISO-8601 UTC: el cliente calcula la cuenta regresiva. */
  @type('string') opensAt = '';
  /** Progreso del ciclo [0,1]. */
  @type('float32') progress = 0;
  /** Durante la veda se apagan afiches, spots y encuestas. */
  @type('boolean') propagandaAllowed = true;
  /** Sólo el domingo del comicio. */
  @type('boolean') votingOpen = false;
}

/** Cómo viene la interna entre facciones dentro del shard. */
export class FactionSummary extends Schema {
  @type('uint8') id = 0;
  @type('string') slug = '';
  @type('string') shortName = '';
  @type('string') colorPrimary = '#888888';
  /** Militantes conectados ahora mismo. */
  @type('uint16') online = 0;
  /** Manzanas controladas en el shard. */
  @type('uint16') territoryCells = 0;
  /** Intención de voto simulada [0,1]. */
  @type('float32') support = 0;
}

export class EsquelWorldState extends Schema {
  @type('string') shardName = 'Esquel';
  @type('string') protocolVersion = '0.1.0';
  @type('uint32') tick = 0;
  @type('float64') serverTime = 0;

  @type(WorldClockState) clock = new WorldClockState();
  @type(WorldWeatherState) weather = new WorldWeatherState();
  @type(ElectionPhaseState) election = new ElectionPhaseState();

  /** Padrón del shard, indexado por `sessionId`. */
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
  /** Facciones activas, indexadas por id. */
  @type({ map: FactionSummary }) factions = new MapSchema<FactionSummary>();

  @type('uint16') population = 0;
  @type('uint16') capacity = 120;
  /** Cartel rotativo del HUD: resultado, anuncio, quilombo del momento. */
  @type('string') ticker = '';
}
