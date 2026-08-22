-- =============================================================================
--  ESQUEL 2027 — MIGRACIÓN 0004: tres barrios más y la telemetría de la Fase 4
--
--  Qué cambia y por qué:
--   1. El enum de barrios suma **Matadero**, **Villa Ayelén** y **Alto Río
--      Percy**. El mapa de calor del dashboard necesitaba el pueblo entero, no
--      sólo la parte donde se juega. Diez columnas de siete tablas usan el mismo
--      enum, así que se modifican todas en una sola pasada.
--   2. Se agrega `telemetria_lotes`, el candado de idempotencia del ingest: el
--      VPS reintenta lotes y sin esto un corte de red duplica telemetría.
--   3. `comercios_patrocinados` suma lo que la marquesina necesita para
--      dibujarse (color, texto y altura del cartel) y el radio de impresión.
--   4. Se agrega `admin_sesiones` para el dashboard: tokens de administrador con
--      vencimiento, revocables uno por uno.
--
--  Ejecutar:  mysql -u <user> -p <db> < 0004_inteligencia_fase4.sql
-- =============================================================================
SET NAMES utf8mb4;

-- -----------------------------------------------------------------------------
--  1. Barrios nuevos. MODIFY sobre un ENUM que sólo agrega valores no toca las
--     filas existentes: es una operación segura y repetible.
-- -----------------------------------------------------------------------------

ALTER TABLE `perfiles_demograficos`
  MODIFY COLUMN `barrio` ENUM('centro','badenes','ceferino','bella_vista','don_bosco','estacion','zona_norte','alta_esquel','plan_1000','valle_chico','matadero','villa_ayelen','alto_rio_percy','otro') NOT NULL;
ALTER TABLE `personajes`
  MODIFY COLUMN `barrio` ENUM('centro','badenes','ceferino','bella_vista','don_bosco','estacion','zona_norte','alta_esquel','plan_1000','valle_chico','matadero','villa_ayelen','alto_rio_percy','otro') NOT NULL;
ALTER TABLE `zonas_territorio`
  MODIFY COLUMN `barrio` ENUM('centro','badenes','ceferino','bella_vista','don_bosco','estacion','zona_norte','alta_esquel','plan_1000','valle_chico','matadero','villa_ayelen','alto_rio_percy','otro') NOT NULL;
ALTER TABLE `misiones_historial`
  MODIFY COLUMN `barrio` ENUM('centro','badenes','ceferino','bella_vista','don_bosco','estacion','zona_norte','alta_esquel','plan_1000','valle_chico','matadero','villa_ayelen','alto_rio_percy','otro') NOT NULL;
ALTER TABLE `prefabs_edificios`
  MODIFY COLUMN `barrio` ENUM('centro','badenes','ceferino','bella_vista','don_bosco','estacion','zona_norte','alta_esquel','plan_1000','valle_chico','matadero','villa_ayelen','alto_rio_percy','otro') NOT NULL;
ALTER TABLE `comercios_patrocinados`
  MODIFY COLUMN `barrio` ENUM('centro','badenes','ceferino','bella_vista','don_bosco','estacion','zona_norte','alta_esquel','plan_1000','valle_chico','matadero','villa_ayelen','alto_rio_percy','otro') NOT NULL DEFAULT 'centro';
ALTER TABLE `telemetria_inteligencia`
  MODIFY COLUMN `barrio` ENUM('centro','badenes','ceferino','bella_vista','don_bosco','estacion','zona_norte','alta_esquel','plan_1000','valle_chico','matadero','villa_ayelen','alto_rio_percy','otro') NOT NULL DEFAULT 'otro';
ALTER TABLE `telemetria_agregados`
  MODIFY COLUMN `barrio` ENUM('centro','badenes','ceferino','bella_vista','don_bosco','estacion','zona_norte','alta_esquel','plan_1000','valle_chico','matadero','villa_ayelen','alto_rio_percy','otro','__todos') NOT NULL DEFAULT '__todos';
ALTER TABLE `intencion_voto_diaria`
  MODIFY COLUMN `barrio` ENUM('centro','badenes','ceferino','bella_vista','don_bosco','estacion','zona_norte','alta_esquel','plan_1000','valle_chico','matadero','villa_ayelen','alto_rio_percy','otro','__todos') NOT NULL DEFAULT '__todos';
ALTER TABLE `sentimiento_barrio`
  MODIFY COLUMN `barrio` ENUM('centro','badenes','ceferino','bella_vista','don_bosco','estacion','zona_norte','alta_esquel','plan_1000','valle_chico','matadero','villa_ayelen','alto_rio_percy','otro','__todos') NOT NULL;

-- -----------------------------------------------------------------------------
--  2. Idempotencia del ingest de telemetría.
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `telemetria_lotes` (
  `lote_id`     CHAR(36)        NOT NULL COMMENT 'UUID del lote que manda el VPS',
  `origen`      VARCHAR(48)     NOT NULL DEFAULT 'vps' COMMENT 'Shard o proceso emisor',
  `eventos`     SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  `aceptados`   SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  `rechazados`  SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  `recibido_en` DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`lote_id`),
  KEY `ix_lotes_recibido` (`recibido_en`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Candado de idempotencia del ingest: un lote repetido no entra dos veces.';

-- -----------------------------------------------------------------------------
--  3. Lo que la marquesina necesita para dibujarse sobre la fachada real.
-- -----------------------------------------------------------------------------

ALTER TABLE `comercios_patrocinados`
  ADD COLUMN `marquesina_texto`   VARCHAR(32)  NULL COMMENT 'Lo que dice el cartel (voxelizado)' AFTER `marquesina_textura`,
  ADD COLUMN `marquesina_color`   CHAR(7)      NOT NULL DEFAULT '#f2b441' COMMENT 'Color del cartel en hex' AFTER `marquesina_texto`,
  ADD COLUMN `marquesina_alto_m`  DECIMAL(4,2) NOT NULL DEFAULT 1.20 COMMENT 'Alto del cartel en metros' AFTER `marquesina_color`,
  ADD COLUMN `radio_impresion_m`  TINYINT UNSIGNED NOT NULL DEFAULT 15 COMMENT 'Distancia que cuenta como impresión' AFTER `marquesina_alto_m`;

-- -----------------------------------------------------------------------------
--  4. Sesiones del dashboard administrativo.
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `admin_sesiones` (
  `id`           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `usuario_id`   BIGINT UNSIGNED NULL COMMENT 'NULL = entró con la clave maestra',
  `token_hash`   CHAR(64)        NOT NULL COMMENT 'SHA-256 del token: el token en claro no se guarda',
  `alias`        VARCHAR(40)     NOT NULL DEFAULT 'admin',
  `emitido_en`   DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `expira_en`    DATETIME(3)     NOT NULL,
  `revocado_en`  DATETIME(3)     NULL,
  `ip_hash`      CHAR(64)        NULL COMMENT 'HMAC de la IP: auditoría sin guardar la IP',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_admin_token` (`token_hash`),
  KEY `ix_admin_expira` (`expira_en`),
  CONSTRAINT `fk_admin_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Tokens del dashboard de campaña. Revocables y con vencimiento.';
