/**
 * Catálogo de las diez tipologías de misión emergente.
 *
 * Están agrupadas por cómo se juegan, no por orden alfabético:
 *
 *   callejeras/  las que se ganan con las patas (pegatina, banderazo, punteros)
 *   logistica/   las que se ganan con la camioneta (reparto, caravana, cinta)
 *   prensa/      las que se ganan hablando (desmentida, conferencia, sondeo)
 *   clima/       la que dispara la cordillera (temporal)
 */

import type { QuestType } from '@esquel/shared';
import type { QuestBlueprint } from './types.ts';
import { BANDERAZO_CALLEJERO, GUERRA_DE_PUNTEROS, PEGATINA_RELAMPAGO } from './callejeras.ts';
import { CARAVANA_DE_BLOQUES, CORTE_DE_CINTA, REPARTO_BARRIAL } from './logistica.ts';
import { CONFERENCIA_PRENSA, OPERACION_DESMENTIDA, SONDEO_VECINAL } from './prensa.ts';
import { TEMPORAL_CORDILLERANO } from './clima.ts';

export const QUEST_CATALOG: Readonly<Record<QuestType, QuestBlueprint>> = {
  PEGATINA_RELAMPAGO,
  BANDERAZO_CALLEJERO,
  OPERACION_DESMENTIDA,
  REPARTO_BARRIAL,
  CARAVANA_DE_BLOQUES,
  CORTE_DE_CINTA,
  TEMPORAL_CORDILLERANO,
  GUERRA_DE_PUNTEROS,
  CONFERENCIA_PRENSA,
  SONDEO_VECINAL,
};

export const QUEST_BLUEPRINTS: readonly QuestBlueprint[] = Object.values(QUEST_CATALOG);

export * from './types.ts';
