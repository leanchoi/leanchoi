-- =============================================================================
--  Reversión de 0004.
--
--  Ojo: sacar valores de un ENUM **sí** toca las filas. Las que estén en un
--  barrio nuevo se reasignan a 'otro' antes de angostar el enum; si no, MySQL
--  las convertiría en cadena vacía sin avisar.
-- =============================================================================
SET NAMES utf8mb4;

UPDATE `perfiles_demograficos`  SET `barrio` = 'otro' WHERE `barrio` IN ('matadero','villa_ayelen','alto_rio_percy');
UPDATE `personajes`             SET `barrio` = 'otro' WHERE `barrio` IN ('matadero','villa_ayelen','alto_rio_percy');
UPDATE `zonas_territorio`       SET `barrio` = 'otro' WHERE `barrio` IN ('matadero','villa_ayelen','alto_rio_percy');
UPDATE `misiones_historial`     SET `barrio` = 'otro' WHERE `barrio` IN ('matadero','villa_ayelen','alto_rio_percy');
UPDATE `prefabs_edificios`      SET `barrio` = 'otro' WHERE `barrio` IN ('matadero','villa_ayelen','alto_rio_percy');
UPDATE `comercios_patrocinados` SET `barrio` = 'otro' WHERE `barrio` IN ('matadero','villa_ayelen','alto_rio_percy');
UPDATE `telemetria_inteligencia` SET `barrio` = 'otro' WHERE `barrio` IN ('matadero','villa_ayelen','alto_rio_percy');
DELETE FROM `telemetria_agregados`  WHERE `barrio` IN ('matadero','villa_ayelen','alto_rio_percy');
DELETE FROM `intencion_voto_diaria` WHERE `barrio` IN ('matadero','villa_ayelen','alto_rio_percy');
DELETE FROM `sentimiento_barrio`    WHERE `barrio` IN ('matadero','villa_ayelen','alto_rio_percy');

ALTER TABLE `perfiles_demograficos`
  MODIFY COLUMN `barrio` ENUM('centro','badenes','ceferino','bella_vista','don_bosco','estacion','zona_norte','alta_esquel','plan_1000','valle_chico','otro') NOT NULL;
ALTER TABLE `personajes`
  MODIFY COLUMN `barrio` ENUM('centro','badenes','ceferino','bella_vista','don_bosco','estacion','zona_norte','alta_esquel','plan_1000','valle_chico','otro') NOT NULL;
ALTER TABLE `zonas_territorio`
  MODIFY COLUMN `barrio` ENUM('centro','badenes','ceferino','bella_vista','don_bosco','estacion','zona_norte','alta_esquel','plan_1000','valle_chico','otro') NOT NULL;
ALTER TABLE `misiones_historial`
  MODIFY COLUMN `barrio` ENUM('centro','badenes','ceferino','bella_vista','don_bosco','estacion','zona_norte','alta_esquel','plan_1000','valle_chico','otro') NOT NULL;
ALTER TABLE `prefabs_edificios`
  MODIFY COLUMN `barrio` ENUM('centro','badenes','ceferino','bella_vista','don_bosco','estacion','zona_norte','alta_esquel','plan_1000','valle_chico','otro') NOT NULL;
ALTER TABLE `comercios_patrocinados`
  MODIFY COLUMN `barrio` ENUM('centro','badenes','ceferino','bella_vista','don_bosco','estacion','zona_norte','alta_esquel','plan_1000','valle_chico','otro') NOT NULL DEFAULT 'centro';
ALTER TABLE `telemetria_inteligencia`
  MODIFY COLUMN `barrio` ENUM('centro','badenes','ceferino','bella_vista','don_bosco','estacion','zona_norte','alta_esquel','plan_1000','valle_chico','otro') NOT NULL DEFAULT 'otro';
ALTER TABLE `telemetria_agregados`
  MODIFY COLUMN `barrio` ENUM('centro','badenes','ceferino','bella_vista','don_bosco','estacion','zona_norte','alta_esquel','plan_1000','valle_chico','otro','__todos') NOT NULL DEFAULT '__todos';
ALTER TABLE `intencion_voto_diaria`
  MODIFY COLUMN `barrio` ENUM('centro','badenes','ceferino','bella_vista','don_bosco','estacion','zona_norte','alta_esquel','plan_1000','valle_chico','otro','__todos') NOT NULL DEFAULT '__todos';
ALTER TABLE `sentimiento_barrio`
  MODIFY COLUMN `barrio` ENUM('centro','badenes','ceferino','bella_vista','don_bosco','estacion','zona_norte','alta_esquel','plan_1000','valle_chico','otro','__todos') NOT NULL;

ALTER TABLE `comercios_patrocinados`
  DROP COLUMN `radio_impresion_m`,
  DROP COLUMN `marquesina_alto_m`,
  DROP COLUMN `marquesina_color`,
  DROP COLUMN `marquesina_texto`;

DROP TABLE IF EXISTS `admin_sesiones`;
DROP TABLE IF EXISTS `telemetria_lotes`;
