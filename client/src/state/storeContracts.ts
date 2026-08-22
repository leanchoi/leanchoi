/**
 * Puente entre el store y `/shared`.
 *
 * Existe para que `gameStore.ts` tenga un único import de contratos y para dejar
 * en un solo lugar el clima inicial (el que se ve durante el primer segundo,
 * antes de que conteste la API meteorológica).
 */

export {
  BARRIO_BY_ID,
  FACTION_BY_ID,
  RANK_BY_LEVEL,
  buildElectionCalendar,
  buildElectionState,
  formatCountdown,
  WEATHER_MODIFIERS,
} from '@esquel/shared';

export type {
  Barrio,
  ElectionPhase,
  ElectionState,
  RankLevel,
  WeatherCondition,
  WorldWeather,
} from '@esquel/shared';

import { climatologicalFallback } from '../environment/WeatherService.ts';
import type { WorldWeather } from '@esquel/shared';

/** Clima inicial del store: la climatología del mes, marcada como `stale`. */
export const climatologicalFallbackNoop = (): WorldWeather => climatologicalFallback();
