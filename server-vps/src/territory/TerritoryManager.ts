/**
 * `TerritoryManager` — quién manda en cada esquina.
 *
 * Cinco zonas de disputa en Esquel. Cada diez segundos se mide el poder de cada
 * facción presente:
 *
 *   PoderZona(F) = Σ_{p∈F} ( Rango(p)^0,75 · caídaPorDistancia )
 *                  · CohesiónBonus · VozBonus · turnoutClima · perk · [defensor]
 *
 * Si una facción sostiene **≥ 60% del poder durante 5 minutos**, captura la zona:
 * se pintan sus banderas de bloques y todos sus afiliados del shard cobran buff
 * de XP y guita mientras la conserven.
 *
 * Lo importante del diseño: el aguante es continuo. No alcanza con juntar gente
 * un minuto para la foto; hay que quedarse. Y el que se distrae pierde: el
 * puntaje se evapora solo.
 */

import {
  TERRITORY,
  TERRITORY_ZONE_SEEDS,
  accumulateScores,
  computeFactionPresence,
  evaluateControl,
  zoneSupportDelta,
  type FactionPresence,
  type Participant,
  type TerritoryZoneSeed,
  type Vec3,
  type WeatherCondition,
} from '@esquel/shared';

/** Estado vivo de una zona. */
export interface ZoneState {
  readonly seed: TerritoryZoneSeed;
  /** Puntaje acumulado por facción. */
  scores: Record<number, number>;
  /** Poder medido en el último tick. */
  power: FactionPresence[];
  /** Facción que controla la zona ahora. */
  controlledBy: number | null;
  /** Facción que viene sosteniendo el umbral y desde cuándo. */
  contender: number | null;
  contenderSince: number;
  /** Segundos que lleva sosteniendo el 60%. */
  holdSeconds: number;
  capturedAt: number | null;
  /** Cuántos militantes hay adentro ahora mismo, por facción. */
  headcount: Record<number, number>;
}

/** Lo que pasa cuando una zona cambia de manos o alguien está por lograrlo. */
export interface TerritoryEvent {
  readonly zoneId: string;
  readonly zoneName: string;
  readonly kind: 'captura' | 'perdida' | 'aguantando' | 'disputa';
  readonly factionId: number;
  readonly previousFaction?: number;
  /** Porcentaje de poder de la facción protagonista [0,1]. */
  readonly share: number;
  /** Segundos que le faltan para capturar (0 si ya capturó). */
  readonly secondsLeft: number;
  readonly text: string;
}

export interface TerritoryTickInput {
  /** Todos los jugadores del shard, con su posición actual. */
  readonly participants: readonly Participant[];
  readonly weather: WeatherCondition;
  /** Perk de retención por facción. */
  readonly holdPerks: Readonly<Record<number, number>>;
  readonly now: number;
  /** Segundos desde el tick anterior. */
  readonly deltaS: number;
}

export class TerritoryManager {
  private readonly zones = new Map<string, ZoneState>();

  constructor(seeds: readonly TerritoryZoneSeed[] = TERRITORY_ZONE_SEEDS) {
    for (const seed of seeds) {
      this.zones.set(seed.id, {
        seed,
        scores: {},
        power: [],
        controlledBy: null,
        contender: null,
        contenderSince: 0,
        holdSeconds: 0,
        capturedAt: null,
        headcount: {},
      });
    }
  }

  /** Las cinco zonas, para el minimapa y el HUD. */
  list(): readonly ZoneState[] {
    return [...this.zones.values()];
  }

  get(zoneId: string): ZoneState | undefined {
    return this.zones.get(zoneId);
  }

  /** Zona que contiene un punto, si hay alguna. */
  zoneAt(position: Vec3): ZoneState | undefined {
    for (const zone of this.zones.values()) {
      const dx = position.x - zone.seed.centerX;
      const dz = position.z - zone.seed.centerZ;
      if (Math.hypot(dx, dz) <= zone.seed.radiusM) return zone;
    }
    return undefined;
  }

  /** Control normalizado de una facción en una zona [0,1]. Lo usa el duelo. */
  controlOf(zoneId: string, factionId: number): number {
    const zone = this.zones.get(zoneId);
    if (!zone) return 0.5;
    const total = Object.values(zone.scores).reduce((a, b) => a + b, 0);
    if (total <= 0) return 0.5;
    return (zone.scores[factionId] ?? 0) / total;
  }

  /** `true` si la facción controla la zona (y cobra el buff). */
  controls(zoneId: string, factionId: number): boolean {
    return this.zones.get(zoneId)?.controlledBy === factionId;
  }

  /** Zonas que controla una facción. */
  zonesOf(factionId: number): string[] {
    return [...this.zones.values()].filter((z) => z.controlledBy === factionId).map((z) => z.seed.id);
  }

  /**
   * Buff activo para un militante: crece con cada zona que su facción controla,
   * con techo para que dominar todo no rompa la economía.
   */
  buffFor(factionId: number): { xp: number; money: number; zones: number } {
    const zonas = this.zonesOf(factionId).length;
    if (zonas === 0) return { xp: 1, money: 1, zones: 0 };
    return {
      xp: Number(Math.min(1.6, TERRITORY.CONTROL_BUFF_XP ** zonas).toFixed(3)),
      money: Number(Math.min(1.5, TERRITORY.CONTROL_BUFF_MONEY ** zonas).toFixed(3)),
      zones: zonas,
    };
  }

  /* ------------------------------------------------------------------ */
  /* Tick                                                                */
  /* ------------------------------------------------------------------ */

  /**
   * Mide, acumula y decide capturas. Devuelve los eventos que la sala tiene que
   * anunciar: capturas, pérdidas y avisos de "la están por dar vuelta".
   */
  tick(input: TerritoryTickInput): TerritoryEvent[] {
    const eventos: TerritoryEvent[] = [];

    for (const zone of this.zones.values()) {
      const center: Vec3 = { x: zone.seed.centerX, y: 0, z: zone.seed.centerZ };
      const ctx = {
        center,
        radiusM: zone.seed.radiusM,
        ...(zone.controlledBy !== null ? { controlledBy: zone.controlledBy } : {}),
        weather: input.weather,
        holdPerks: input.holdPerks,
      };

      const presencia = computeFactionPresence(input.participants, ctx);
      zone.power = [...presencia];
      zone.headcount = {};
      for (const p of presencia) zone.headcount[p.factionId] = p.headcount;

      zone.scores = accumulateScores(zone.scores, presencia, input.deltaS);
      const control = evaluateControl(zone.scores, zone.controlledBy ?? undefined);
      const lider = control.leader ?? null;

      /* --- ¿alguien sostiene el 60%? --- */
      if (lider !== null && control.leaderShare >= TERRITORY.CAPTURE_THRESHOLD) {
        if (zone.contender !== lider) {
          zone.contender = lider;
          zone.contenderSince = input.now;
          zone.holdSeconds = 0;
          if (lider !== zone.controlledBy) {
            eventos.push({
              zoneId: zone.seed.id,
              zoneName: zone.seed.name,
              kind: 'disputa',
              factionId: lider,
              ...(zone.controlledBy !== null ? { previousFaction: zone.controlledBy } : {}),
              share: control.leaderShare,
              secondsLeft: TERRITORY.CAPTURE_HOLD_S,
              text: `Se está poniendo densa la cosa en ${zone.seed.name}.`,
            });
          }
        } else {
          zone.holdSeconds += input.deltaS;
        }

        const faltan = Math.max(0, TERRITORY.CAPTURE_HOLD_S - zone.holdSeconds);

        // Aviso a mitad de camino: da tiempo a que el rival reaccione.
        if (
          lider !== zone.controlledBy &&
          faltan > 0 &&
          faltan <= TERRITORY.CAPTURE_HOLD_S / 2 &&
          Math.floor(faltan) % 60 === 0
        ) {
          eventos.push({
            zoneId: zone.seed.id,
            zoneName: zone.seed.name,
            kind: 'aguantando',
            factionId: lider,
            share: control.leaderShare,
            secondsLeft: Math.round(faltan),
            text: `Aguantan ${zone.seed.name}: faltan ${Math.round(faltan / 60)} minutos para que la den vuelta.`,
          });
        }

        if (faltan <= 0 && lider !== zone.controlledBy) {
          const anterior = zone.controlledBy;
          zone.controlledBy = lider;
          zone.capturedAt = input.now;
          zone.holdSeconds = 0;
          eventos.push({
            zoneId: zone.seed.id,
            zoneName: zone.seed.name,
            kind: 'captura',
            factionId: lider,
            ...(anterior !== null ? { previousFaction: anterior } : {}),
            share: control.leaderShare,
            secondsLeft: 0,
            text: `${zone.seed.name} cambió de manos. Ya están colgando las banderas.`,
          });
          if (anterior !== null) {
            eventos.push({
              zoneId: zone.seed.id,
              zoneName: zone.seed.name,
              kind: 'perdida',
              factionId: anterior,
              share: 1 - control.leaderShare,
              secondsLeft: 0,
              text: `Perdieron ${zone.seed.name}. Alguien va a tener que explicar esto en el comité.`,
            });
          }
        }
      } else {
        // Nadie sostiene el umbral: se enfría el reloj.
        zone.contender = null;
        zone.holdSeconds = Math.max(0, zone.holdSeconds - input.deltaS * 2);
      }

      /* --- ¿el que controlaba se quedó sin gente? --- */
      if (zone.controlledBy !== null) {
        const suShare = this.controlOf(zone.seed.id, zone.controlledBy);
        if (suShare < 0.25 && (zone.headcount[zone.controlledBy] ?? 0) === 0) {
          const perdida = zone.controlledBy;
          zone.controlledBy = null;
          zone.capturedAt = null;
          eventos.push({
            zoneId: zone.seed.id,
            zoneName: zone.seed.name,
            kind: 'perdida',
            factionId: perdida,
            share: suShare,
            secondsLeft: 0,
            text: `${zone.seed.name} quedó sin dueño: no fue nadie a bancarla.`,
          });
        }
      }
    }

    return eventos;
  }

  /** Empujón de puntaje que deja un duelo ganado dentro de la zona. */
  applyDuelImpact(zoneId: string, factionId: number, delta: number): void {
    const zone = this.zones.get(zoneId);
    if (!zone) return;
    zone.scores[factionId] = Math.max(0, (zone.scores[factionId] ?? 0) + delta);
  }

  /** Empujón que deja una misión completada en la zona. */
  applyQuestImpact(zoneId: string, factionId: number, territoryScore: number): void {
    this.applyDuelImpact(zoneId, factionId, territoryScore);
  }

  /**
   * Aporte de las zonas a la intención de voto simulada de cada facción.
   * Es el puente entre "aguantar la esquina" y "estar mejor en la encuesta".
   */
  supportDeltas(): Record<number, number> {
    const out: Record<number, number> = {};
    for (const zone of this.zones.values()) {
      if (zone.controlledBy === null) continue;
      const share = this.controlOf(zone.seed.id, zone.controlledBy);
      out[zone.controlledBy] = (out[zone.controlledBy] ?? 0) + zoneSupportDelta(zone.seed.weight, share);
    }
    return out;
  }

  /** Foto de las zonas para replicar al cliente. */
  snapshot(): {
    id: string;
    name: string;
    centerX: number;
    centerZ: number;
    radiusM: number;
    controlledBy: number;
    leadShare: number;
    holdSeconds: number;
    headcount: Record<number, number>;
  }[] {
    return this.list().map((zone) => {
      const total = Object.values(zone.scores).reduce((a, b) => a + b, 0);
      const lider = Object.entries(zone.scores).sort((a, b) => b[1] - a[1])[0];
      return {
        id: zone.seed.id,
        name: zone.seed.name,
        centerX: zone.seed.centerX,
        centerZ: zone.seed.centerZ,
        radiusM: zone.seed.radiusM,
        controlledBy: zone.controlledBy ?? 0,
        leadShare: total > 0 && lider ? Number((Number(lider[1]) / total).toFixed(3)) : 0,
        holdSeconds: Math.round(zone.holdSeconds),
        headcount: { ...zone.headcount },
      };
    });
  }
}
