-- =============================================================================
--  ESQUEL 2027 — MIGRACIÓN 0003: gameplay de la Fase 3
--
--  Qué cambia y por qué:
--   1. `cartas_debate.familia` pasa de las ocho familias de diseño a las **seis**
--      que efectivamente juegan en `/shared/types/debate.ts` (rueda cerrada de
--      contras). Se van `archivo_historico`, `dato_duro`, `empatia_vecinal` y
--      `defensa`; entran `carpetazo` y `romper_quorum`.
--   2. `misiones_catalogo.tipo` y `misiones_historial.tipo` pasan a las **diez**
--      tipologías Live-Ops definitivas de `/shared/types/quests.ts`.
--   3. Se agregan las columnas que la Fase 3 necesita para persistir el estado:
--      contadores por objetivo en el historial, control sostenido en las zonas
--      y el registro de campañas del Modo Candidato.
--
--  Convención: los ENUM van en minúscula y snake_case, como el resto del
--  esquema. El mapa contra las constantes TypeScript (UPPER_SNAKE) lo hace
--  `tools/ci/gen-seeds.ts` / `server-vps/scripts/gen-catalog-seeds.ts`.
--
--  Ejecutar:  mysql -u <user> -p <db> < 0003_gameplay_fase3.sql
-- =============================================================================
SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- -----------------------------------------------------------------------------
--  1. Familias de cartas: de ocho a seis.
-- -----------------------------------------------------------------------------

-- Paso intermedio: el ENUM se ensancha para poder reasignar sin perder filas.
ALTER TABLE `cartas_debate`
  MODIFY COLUMN `familia` ENUM(
    'chicana','archivo_historico','promesa_inviable','chanchullo','invocar_al_lider',
    'dato_duro','empatia_vecinal','defensa','carpetazo','romper_quorum'
  ) NOT NULL;

-- El archivo histórico era, en los hechos, un carpetazo con mejor prensa.
UPDATE `cartas_debate` SET `familia` = 'carpetazo'         WHERE `familia` = 'archivo_historico';
-- El dato duro y la empatía vecinal no sobrevivieron al rediseño: se retiran del
-- mazo activo en vez de borrarse, para no romper mazos guardados ni historiales.
UPDATE `cartas_debate` SET `familia` = 'carpetazo', `habilitada` = 0 WHERE `familia` = 'dato_duro';
UPDATE `cartas_debate` SET `familia` = 'chicana',   `habilitada` = 0 WHERE `familia` = 'empatia_vecinal';
-- La defensa pasó a ser romper el quórum: no discutís, no dejás que se discuta.
UPDATE `cartas_debate` SET `familia` = 'romper_quorum'      WHERE `familia` = 'defensa';

ALTER TABLE `cartas_debate`
  MODIFY COLUMN `familia` ENUM(
    'chicana','carpetazo','promesa_inviable','romper_quorum','chanchullo','invocar_al_lider'
  ) NOT NULL;

-- La labia reemplazó a los "argumentos": el coste vive en la misma columna pero
-- el comentario tenía que dejar de mentir.
ALTER TABLE `cartas_debate`
  MODIFY COLUMN `costo` TINYINT UNSIGNED NOT NULL DEFAULT 1 COMMENT 'Labia que cuesta jugarla';

-- -----------------------------------------------------------------------------
--  2. Tipologías de misión: las diez definitivas.
-- -----------------------------------------------------------------------------

ALTER TABLE `misiones_catalogo`
  MODIFY COLUMN `tipo` ENUM(
    'afiches_relampago','volanteada','mateada_solidaria','movilizacion_esquina','contracampania',
    'operativo_prensa','caza_baches','escrache_debate','censo_vecinal','emergencia_climatica',
    'pegatina_relampago','banderazo_callejero','operacion_desmentida','reparto_barrial',
    'caravana_de_bloques','corte_de_cinta','temporal_cordillerano','guerra_de_punteros',
    'conferencia_prensa','sondeo_vecinal'
  ) NOT NULL;

ALTER TABLE `misiones_historial`
  MODIFY COLUMN `tipo` ENUM(
    'afiches_relampago','volanteada','mateada_solidaria','movilizacion_esquina','contracampania',
    'operativo_prensa','caza_baches','escrache_debate','censo_vecinal','emergencia_climatica',
    'pegatina_relampago','banderazo_callejero','operacion_desmentida','reparto_barrial',
    'caravana_de_bloques','corte_de_cinta','temporal_cordillerano','guerra_de_punteros',
    'conferencia_prensa','sondeo_vecinal'
  ) NOT NULL;

-- Equivalencias entre la nomenclatura vieja y la nueva.
UPDATE `misiones_catalogo` SET `tipo` = 'pegatina_relampago'    WHERE `tipo` = 'afiches_relampago';
UPDATE `misiones_catalogo` SET `tipo` = 'reparto_barrial'       WHERE `tipo` IN ('volanteada','mateada_solidaria');
UPDATE `misiones_catalogo` SET `tipo` = 'banderazo_callejero'   WHERE `tipo` = 'movilizacion_esquina';
UPDATE `misiones_catalogo` SET `tipo` = 'operacion_desmentida'  WHERE `tipo` = 'contracampania';
UPDATE `misiones_catalogo` SET `tipo` = 'conferencia_prensa'    WHERE `tipo` = 'operativo_prensa';
UPDATE `misiones_catalogo` SET `tipo` = 'corte_de_cinta'        WHERE `tipo` = 'caza_baches';
UPDATE `misiones_catalogo` SET `tipo` = 'guerra_de_punteros'    WHERE `tipo` = 'escrache_debate';
UPDATE `misiones_catalogo` SET `tipo` = 'sondeo_vecinal'        WHERE `tipo` = 'censo_vecinal';
UPDATE `misiones_catalogo` SET `tipo` = 'temporal_cordillerano' WHERE `tipo` = 'emergencia_climatica';

UPDATE `misiones_historial` SET `tipo` = 'pegatina_relampago'    WHERE `tipo` = 'afiches_relampago';
UPDATE `misiones_historial` SET `tipo` = 'reparto_barrial'       WHERE `tipo` IN ('volanteada','mateada_solidaria');
UPDATE `misiones_historial` SET `tipo` = 'banderazo_callejero'   WHERE `tipo` = 'movilizacion_esquina';
UPDATE `misiones_historial` SET `tipo` = 'operacion_desmentida'  WHERE `tipo` = 'contracampania';
UPDATE `misiones_historial` SET `tipo` = 'conferencia_prensa'    WHERE `tipo` = 'operativo_prensa';
UPDATE `misiones_historial` SET `tipo` = 'corte_de_cinta'        WHERE `tipo` = 'caza_baches';
UPDATE `misiones_historial` SET `tipo` = 'guerra_de_punteros'    WHERE `tipo` = 'escrache_debate';
UPDATE `misiones_historial` SET `tipo` = 'sondeo_vecinal'        WHERE `tipo` = 'censo_vecinal';
UPDATE `misiones_historial` SET `tipo` = 'temporal_cordillerano' WHERE `tipo` = 'emergencia_climatica';

-- Ya sin filas viejas, el ENUM queda con las diez tipologías y nada más.
ALTER TABLE `misiones_catalogo`
  MODIFY COLUMN `tipo` ENUM(
    'pegatina_relampago','banderazo_callejero','operacion_desmentida','reparto_barrial',
    'caravana_de_bloques','corte_de_cinta','temporal_cordillerano','guerra_de_punteros',
    'conferencia_prensa','sondeo_vecinal'
  ) NOT NULL;

ALTER TABLE `misiones_historial`
  MODIFY COLUMN `tipo` ENUM(
    'pegatina_relampago','banderazo_callejero','operacion_desmentida','reparto_barrial',
    'caravana_de_bloques','corte_de_cinta','temporal_cordillerano','guerra_de_punteros',
    'conferencia_prensa','sondeo_vecinal'
  ) NOT NULL;

-- El catálogo ahora también sabe si la misión es una carrera contra el rival y
-- qué herramienta de carrera pide (megáfono, camioneta, credencial…).
ALTER TABLE `misiones_catalogo`
  ADD COLUMN `disputada` TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Carrera contra la facción rival' AFTER `grupal`,
  ADD COLUMN `item_requerido` VARCHAR(48) NULL COMMENT 'CAREER_ITEMS de /shared/types/career.ts' AFTER `disputada`,
  ADD COLUMN `rango_min` TINYINT UNSIGNED NOT NULL DEFAULT 1 AFTER `item_requerido`,
  ADD COLUMN `cupo` SMALLINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '0 = sin límite' AFTER `rango_min`;

-- Contadores por objetivo: sin esto no se puede reconstruir una misión a medias.
ALTER TABLE `misiones_historial`
  ADD COLUMN `contadores` JSON NULL COMMENT 'QuestProgress.counters' AFTER `completitud`;

-- El disparador se llamaba 'manual' cuando lo tocaba un admin: QUEST_TRIGGERS
-- de `/shared/types/quests.ts` lo llama 'admin' y la base tiene que decir lo mismo.
ALTER TABLE `misiones_historial`
  MODIFY COLUMN `disparador` ENUM('noticia','clima','territorio','calendario','manual','admin')
    NOT NULL DEFAULT 'calendario';
UPDATE `misiones_historial` SET `disparador` = 'admin' WHERE `disparador` = 'manual';
ALTER TABLE `misiones_historial`
  MODIFY COLUMN `disparador` ENUM('noticia','clima','territorio','calendario','admin')
    NOT NULL DEFAULT 'calendario';

-- -----------------------------------------------------------------------------
--  3. Territorio: captura sostenida.
-- -----------------------------------------------------------------------------

ALTER TABLE `zonas_territorio`
  ADD COLUMN `segundos_aguante` SMALLINT UNSIGNED NOT NULL DEFAULT 0
    COMMENT 'Segundos sostenidos ≥60% hacia CAPTURE_HOLD_S' AFTER `puntajes`,
  ADD COLUMN `faccion_aguante_id` SMALLINT UNSIGNED NULL
    COMMENT 'Facción que viene aguantando' AFTER `segundos_aguante`,
  ADD CONSTRAINT `fk_zonas_aguante` FOREIGN KEY (`faccion_aguante_id`)
    REFERENCES `facciones` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- -----------------------------------------------------------------------------
--  4. Modo Candidato: una fila por campaña jugada.
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `campanas_candidato` (
  `id`               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `personaje_id`     BIGINT UNSIGNED NOT NULL,
  `arquetipo`        ENUM('oficialista','outsider','caudillo') NOT NULL,
  `semilla`          INT UNSIGNED    NOT NULL COMMENT 'Permite rejugar y auditar la partida',
  `decisiones`       JSON            NOT NULL COMMENT '[{cardId, optionId}] en orden',
  `caja_campana`     TINYINT UNSIGNED NOT NULL,
  `rosca_politica`   TINYINT UNSIGNED NOT NULL,
  `imagen_publica`   TINYINT UNSIGNED NOT NULL,
  `nivel_escandalo`  TINYINT UNSIGNED NOT NULL,
  `final`            VARCHAR(32)     NOT NULL,
  `turnos_jugados`   TINYINT UNSIGNED NOT NULL,
  `xp_otorgada`      INT UNSIGNED    NOT NULL DEFAULT 0,
  `reputacion_otorgada` SMALLINT     NOT NULL DEFAULT 0,
  `guita_otorgada`   BIGINT          NOT NULL DEFAULT 0,
  `jugada_en`        DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `ix_campanas_personaje` (`personaje_id`, `jugada_en`),
  KEY `ix_campanas_final` (`final`),
  CONSTRAINT `fk_campanas_personaje` FOREIGN KEY (`personaje_id`)
    REFERENCES `personajes` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
