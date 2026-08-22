/**
 * Modo Ciudadano — la carrera militante en el MMO.
 *
 * Es el modo por defecto: la ciudad, los duelos, las misiones y el territorio.
 * Este módulo no simula nada (eso lo hace el servidor): traduce el estado del
 * jugador al progreso de carrera que muestra el HUD y responde la pregunta que
 * más se hace en pantalla, «¿qué me falta para el ascenso?».
 */

import {
  CAREER_BY_LEVEL,
  RANK_BY_LEVEL,
  checkPromotion,
  rankProgress,
  unlockedAbilities,
  unlockedItems,
  xpToNextRank,
  type CareerProgress,
  type RankLevel,
} from '@esquel/shared';

export interface CitizenSnapshot {
  readonly xp: number;
  readonly reputation: number;
  readonly loyalty: number;
  readonly rankTier: number;
}

/** Foto completa de la carrera, lista para el panel de rango. */
export const careerProgressOf = (snapshot: CitizenSnapshot): CareerProgress => {
  const level = Math.max(1, Math.min(10, snapshot.rankTier)) as RankLevel;
  const promocion = checkPromotion({
    xp: snapshot.xp,
    reputation: snapshot.reputation,
    loyalty: snapshot.loyalty,
    currentLevel: level,
  });

  return {
    level,
    rank: CAREER_BY_LEVEL[level],
    xp: snapshot.xp,
    xpToNext: xpToNextRank(snapshot.xp),
    progress: rankProgress(snapshot.xp),
    reputation: snapshot.reputation,
    loyalty: snapshot.loyalty,
    missing: promocion.missing,
    items: unlockedItems(level),
    abilities: unlockedAbilities(level),
  };
};

/** Qué le falta al jugador para el ascenso, en criollo. */
export const promotionHint = (progress: CareerProgress): string => {
  if (progress.level >= 10) return 'Llegaste a lo más alto. Ahora te toca bancar el cargo.';
  const siguiente = RANK_BY_LEVEL[(progress.level + 1) as RankLevel];
  const faltantes: string[] = [];
  if (progress.missing.xp > 0) faltantes.push(`${progress.missing.xp.toLocaleString('es-AR')} XP`);
  if (progress.missing.reputation > 0) faltantes.push(`${progress.missing.reputation} de reputación`);
  if (progress.missing.loyalty > 0) faltantes.push(`${Math.round(progress.missing.loyalty * 100)}% de lealtad`);

  if (faltantes.length === 0) return `Ya estás para ${siguiente.name}. Andá al comité a que te lo confirmen.`;
  return `Para ${siguiente.name} te falta ${faltantes.join(', ')}.`;
};

/** Lo que se desbloquea en el próximo escalón, para mostrarlo como zanahoria. */
export const nextUnlocks = (level: RankLevel): { items: readonly string[]; abilities: readonly string[] } => {
  if (level >= 10) return { items: [], abilities: [] };
  const siguiente = CAREER_BY_LEVEL[(level + 1) as RankLevel];
  return { items: siguiente.items, abilities: siguiente.abilities };
};
