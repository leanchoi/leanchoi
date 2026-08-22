-- =============================================================================
--  Reversión de 0003.
--
--  Ojo: es una reversión de estructura, no de datos. Las cartas que la 0003
--  reasignó (archivo histórico → carpetazo, defensa → romper quórum) vuelven al
--  ENUM viejo con la familia que mejor las representa, pero el mapa no es
--  biyectivo: `dato_duro` y `empatia_vecinal` quedaron deshabilitadas y acá
--  vuelven como `dato_duro`. Lo mismo con las misiones: dos tipologías viejas
--  colapsaron en `reparto_barrial` y se restituyen todas como `volanteada`.
-- =============================================================================
SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS `campanas_candidato`;

ALTER TABLE `zonas_territorio`
  DROP FOREIGN KEY `fk_zonas_aguante`;
ALTER TABLE `zonas_territorio`
  DROP COLUMN `faccion_aguante_id`,
  DROP COLUMN `segundos_aguante`;

ALTER TABLE `misiones_historial`
  DROP COLUMN `contadores`;

ALTER TABLE `misiones_catalogo`
  DROP COLUMN `cupo`,
  DROP COLUMN `rango_min`,
  DROP COLUMN `item_requerido`,
  DROP COLUMN `disputada`;

-- Disparador: vuelve 'manual'.
ALTER TABLE `misiones_historial`
  MODIFY COLUMN `disparador` ENUM('noticia','clima','territorio','calendario','manual','admin')
    NOT NULL DEFAULT 'calendario';
UPDATE `misiones_historial` SET `disparador` = 'manual' WHERE `disparador` = 'admin';
ALTER TABLE `misiones_historial`
  MODIFY COLUMN `disparador` ENUM('noticia','clima','territorio','calendario','manual')
    NOT NULL DEFAULT 'calendario';

-- Tipologías: ENUM ancho, reasignación, ENUM viejo.
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

UPDATE `misiones_catalogo` SET `tipo` = 'afiches_relampago'    WHERE `tipo` = 'pegatina_relampago';
UPDATE `misiones_catalogo` SET `tipo` = 'volanteada'           WHERE `tipo` = 'reparto_barrial';
UPDATE `misiones_catalogo` SET `tipo` = 'movilizacion_esquina' WHERE `tipo` IN ('banderazo_callejero','caravana_de_bloques');
UPDATE `misiones_catalogo` SET `tipo` = 'contracampania'       WHERE `tipo` = 'operacion_desmentida';
UPDATE `misiones_catalogo` SET `tipo` = 'operativo_prensa'     WHERE `tipo` = 'conferencia_prensa';
UPDATE `misiones_catalogo` SET `tipo` = 'caza_baches'          WHERE `tipo` = 'corte_de_cinta';
UPDATE `misiones_catalogo` SET `tipo` = 'escrache_debate'      WHERE `tipo` = 'guerra_de_punteros';
UPDATE `misiones_catalogo` SET `tipo` = 'censo_vecinal'        WHERE `tipo` = 'sondeo_vecinal';
UPDATE `misiones_catalogo` SET `tipo` = 'emergencia_climatica' WHERE `tipo` = 'temporal_cordillerano';

UPDATE `misiones_historial` SET `tipo` = 'afiches_relampago'    WHERE `tipo` = 'pegatina_relampago';
UPDATE `misiones_historial` SET `tipo` = 'volanteada'           WHERE `tipo` = 'reparto_barrial';
UPDATE `misiones_historial` SET `tipo` = 'movilizacion_esquina' WHERE `tipo` IN ('banderazo_callejero','caravana_de_bloques');
UPDATE `misiones_historial` SET `tipo` = 'contracampania'       WHERE `tipo` = 'operacion_desmentida';
UPDATE `misiones_historial` SET `tipo` = 'operativo_prensa'     WHERE `tipo` = 'conferencia_prensa';
UPDATE `misiones_historial` SET `tipo` = 'caza_baches'          WHERE `tipo` = 'corte_de_cinta';
UPDATE `misiones_historial` SET `tipo` = 'escrache_debate'      WHERE `tipo` = 'guerra_de_punteros';
UPDATE `misiones_historial` SET `tipo` = 'censo_vecinal'        WHERE `tipo` = 'sondeo_vecinal';
UPDATE `misiones_historial` SET `tipo` = 'emergencia_climatica' WHERE `tipo` = 'temporal_cordillerano';

ALTER TABLE `misiones_catalogo`
  MODIFY COLUMN `tipo` ENUM(
    'afiches_relampago','volanteada','mateada_solidaria','movilizacion_esquina','contracampania',
    'operativo_prensa','caza_baches','escrache_debate','censo_vecinal','emergencia_climatica'
  ) NOT NULL;
ALTER TABLE `misiones_historial`
  MODIFY COLUMN `tipo` ENUM(
    'afiches_relampago','volanteada','mateada_solidaria','movilizacion_esquina','contracampania',
    'operativo_prensa','caza_baches','escrache_debate','censo_vecinal','emergencia_climatica'
  ) NOT NULL;

-- Familias de cartas: ENUM ancho, reasignación, ENUM viejo.
ALTER TABLE `cartas_debate`
  MODIFY COLUMN `familia` ENUM(
    'chicana','archivo_historico','promesa_inviable','chanchullo','invocar_al_lider',
    'dato_duro','empatia_vecinal','defensa','carpetazo','romper_quorum'
  ) NOT NULL;

UPDATE `cartas_debate` SET `familia` = 'archivo_historico' WHERE `familia` = 'carpetazo';
UPDATE `cartas_debate` SET `familia` = 'defensa'           WHERE `familia` = 'romper_quorum';

ALTER TABLE `cartas_debate`
  MODIFY COLUMN `familia` ENUM(
    'chicana','archivo_historico','promesa_inviable','chanchullo','invocar_al_lider',
    'dato_duro','empatia_vecinal','defensa'
  ) NOT NULL,
  MODIFY COLUMN `costo` TINYINT UNSIGNED NOT NULL DEFAULT 1 COMMENT 'Argumentos ("aire")';

SET FOREIGN_KEY_CHECKS = 1;
