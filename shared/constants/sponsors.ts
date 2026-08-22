/**
 * Comercios auspiciados de Esquel.
 *
 * Tres locales para arrancar, cada uno en su dirección real, con un buff que
 * tiene que ver con lo que venden: el chocolate suelta la lengua, el café
 * apura el paso y la campera te banca la nevada. La gracia del modelo es esa —
 * el auspicio se juega, no se mira: un cartel que no hace nada es publicidad;
 * un cartel que te da algo es parte del juego.
 *
 * Este catálogo es el que usa el cliente para dibujar y para saber qué buff
 * ofrecer. La fuente de verdad comercial —contrato, plan, horarios, métricas—
 * vive en `comercios_patrocinados` en MySQL; acá está lo que hace falta para
 * que el local exista en el mundo.
 */

import type { Barrio } from '../types/common.ts';
import type { KnownStreet } from '../types/building.ts';

/** Qué hace el buff cuando el jugador entra y consume. */
export type SponsorBuffKind = 'labia' | 'velocidad' | 'abrigo';

export interface SponsorBuff {
  readonly slug: string;
  readonly kind: SponsorBuffKind;
  readonly name: string;
  /** Lo que ve el jugador cuando lo agarra. */
  readonly description: string;
  /** Multiplicador o magnitud, según el tipo. */
  readonly magnitude: number;
  readonly seconds: number;
  /** Qué cuesta, en centavos. `0` = de la casa. */
  readonly priceCentavos: number;
}

export interface SponsorDefinition {
  /** `comercios_patrocinados.id`. Es lo que viaja en la telemetría. */
  readonly id: number;
  readonly slug: string;
  readonly name: string;
  readonly rubro: string;
  readonly barrio: Barrio;
  /** Dirección real: calle y altura. De ahí sale la parcela y la fachada. */
  readonly street: KnownStreet;
  readonly streetNumber: number;
  /** Lo que dice la marquesina, en mayúsculas y corto: se voxeliza. */
  readonly marqueeText: string;
  readonly marqueeColor: number;
  /** Color del frente del local, para que se distinga de la cuadra. */
  readonly facadeColor: number;
  readonly buff: SponsorBuff;
  /** A cuántos metros cuenta como impresión. */
  readonly impressionRadiusM: number;
  /** Frase del mostrador. */
  readonly greeting: string;
  /** Horario en minutos desde medianoche (local). */
  readonly opensAt: number;
  readonly closesAt: number;
}

export const SPONSORS: readonly SponsorDefinition[] = [
  {
    id: 1,
    slug: 'chocolateria_del_centro',
    name: 'Chocolatería del Centro',
    rubro: 'chocolateria',
    barrio: 'centro',
    street: 'san_martin',
    streetNumber: 450,
    marqueeText: 'CHOCOLATES',
    marqueeColor: 0x6b3a1f,
    facadeColor: 0x8a5a3c,
    impressionRadiusM: 15,
    greeting: 'Llevate una barra artesanal, que hoy hablás en el Concejo.',
    opensAt: 9 * 60,
    closesAt: 21 * 60,
    buff: {
      slug: 'chocolate_artesanal',
      kind: 'labia',
      name: 'Chocolate artesanal',
      description: 'Azúcar y cacao: la labia rinde el doble en el próximo duelo.',
      magnitude: 2.0,
      seconds: 600,
      priceCentavos: 3_500,
    },
  },
  {
    id: 2,
    slug: 'cafe_de_la_estacion',
    name: 'Café de la Estación',
    rubro: 'cafeteria',
    barrio: 'estacion',
    street: 'roggero',
    streetNumber: 100,
    marqueeText: 'CAFE',
    marqueeColor: 0x3f2a1c,
    facadeColor: 0x9a7350,
    impressionRadiusM: 15,
    greeting: 'Un cortado y salís caminando más rápido que el colectivo.',
    opensAt: 7 * 60,
    closesAt: 20 * 60,
    buff: {
      slug: 'cafe_caliente',
      kind: 'velocidad',
      name: 'Café caliente',
      description: 'Treinta y cinco por ciento más de paso durante cinco minutos.',
      magnitude: 1.35,
      seconds: 300,
      priceCentavos: 1_800,
    },
  },
  {
    id: 3,
    slug: 'indumentaria_cordillerana',
    name: 'Indumentaria Cordillerana',
    rubro: 'indumentaria',
    barrio: 'centro',
    street: 'av_alvear',
    streetNumber: 900,
    marqueeText: 'ABRIGO',
    marqueeColor: 0x2f4a6d,
    facadeColor: 0x6f7d8c,
    impressionRadiusM: 15,
    greeting: 'Con esta campera la nevada te la bancás sin chistar.',
    opensAt: 10 * 60,
    closesAt: 20 * 60 + 30,
    buff: {
      slug: 'campera_termica',
      kind: 'abrigo',
      name: 'Campera térmica',
      description: 'La nieve deja de frenarte: caminás como si estuviera despejado.',
      magnitude: 1.0,
      seconds: 900,
      priceCentavos: 12_000,
    },
  },
];

export const SPONSOR_BY_ID: ReadonlyMap<number, SponsorDefinition> = new Map(SPONSORS.map((s) => [s.id, s]));
export const SPONSOR_BY_SLUG: ReadonlyMap<string, SponsorDefinition> = new Map(SPONSORS.map((s) => [s.slug, s]));

/** ¿Está abierto a esta hora local (en minutos desde medianoche)? */
export const isSponsorOpen = (sponsor: SponsorDefinition, localMinute: number): boolean =>
  localMinute >= sponsor.opensAt && localMinute < sponsor.closesAt;
