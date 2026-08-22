-- =============================================================================
--  ESQUEL 2027 — Esquema de base de datos (Hostinger · MySQL 8.0 / MariaDB 10.6+)
-- =============================================================================
--  Archivo: /backend-php/database/schema.sql
--  Versión: 1.0.0 (PROMPT 0 — base arquitectónica)
--
--  DECISIONES DE DISEÑO (auditables):
--   * Motor InnoDB en todas las tablas: transacciones + claves foráneas.
--   * utf8mb4 / utf8mb4_unicode_ci: compatible tanto con MySQL 8 como con
--     MariaDB (Hostinger shared usa MariaDB; el VPS puede usar MySQL 8).
--   * Identificadores de alta cardinalidad en BIGINT UNSIGNED; catálogos en
--     SMALLINT/TINYINT UNSIGNED para que los índices entren en memoria.
--   * Dinero SIEMPRE en centavos (BIGINT), nunca FLOAT.
--   * Probabilidades y ratios en DECIMAL, nunca FLOAT (comparaciones estables).
--   * Timestamps de dominio en DATETIME(3) UTC. `creado_en` / `actualizado_en`
--     usan TIMESTAMP con default automático.
--   * Borrado lógico en `usuarios` (`eliminado_en`) por trazabilidad; el borrado
--     físico se hace en el job de retención (ver §9).
--   * `telemetria_inteligencia` NO tiene claves foráneas a `usuarios`: opera con
--     un seudónimo rotativo y así puede particionarse por fecha.
--
--  ORDEN DE EJECUCIÓN: este archivo es idempotente en instalación limpia.
--  Migraciones incrementales: /backend-php/database/migrations/
--  Datos semilla:            /backend-php/database/seeds/
-- =============================================================================

SET NAMES utf8mb4;
SET time_zone = '+00:00';
SET sql_mode = 'STRICT_ALL_TABLES,NO_ENGINE_SUBSTITUTION,ERROR_FOR_DIVISION_BY_ZERO';

-- CREATE DATABASE IF NOT EXISTS `esquel2027`
--   DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- USE `esquel2027`;

-- =============================================================================
--  §1. CATÁLOGOS DE JUEGO
-- =============================================================================

-- -----------------------------------------------------------------------------
--  facciones — partidos/agrupaciones ficticias jugables.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `facciones` (
  `id`               SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `slug`             VARCHAR(48)       NOT NULL COMMENT 'Identificador estable usado por el código compartido',
  `nombre`           VARCHAR(80)       NOT NULL,
  `nombre_corto`     VARCHAR(12)       NOT NULL,
  `lema`             VARCHAR(160)      NOT NULL DEFAULT '',
  `color_primario`   CHAR(7)           NOT NULL DEFAULT '#888888',
  `color_secundario` CHAR(7)           NOT NULL DEFAULT '#FFFFFF',
  `perks`            JSON              NULL COMMENT 'FactionDefinition.perks',
  `afinidad`         JSON              NULL COMMENT 'Familias de carta con afinidad',
  `bastiones`        JSON              NULL COMMENT 'Barrios con ventaja inicial',
  `tesoro_centavos`  BIGINT UNSIGNED   NOT NULL DEFAULT 0,
  `apoyo`            DECIMAL(6,5)      NOT NULL DEFAULT 0.00000 COMMENT 'Intención de voto simulada [0,1]',
  `miembros`         INT UNSIGNED      NOT NULL DEFAULT 0,
  `activa`           TINYINT(1)        NOT NULL DEFAULT 1,
  `creado_en`        TIMESTAMP         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `actualizado_en`   TIMESTAMP         NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_facciones_slug` (`slug`),
  KEY `ix_facciones_activa_apoyo` (`activa`, `apoyo` DESC),
  CONSTRAINT `ck_facciones_apoyo` CHECK (`apoyo` BETWEEN 0 AND 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Facciones ficticias. Ver política editorial en /shared/constants/factions.ts';

-- -----------------------------------------------------------------------------
--  rangos — árbol de carrera militante (10 niveles). Espejo de RANKS.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `rangos` (
  `nivel`               TINYINT UNSIGNED NOT NULL COMMENT '1..10',
  `slug`                VARCHAR(32)      NOT NULL,
  `nombre`              VARCHAR(48)      NOT NULL,
  `descripcion`         VARCHAR(255)     NOT NULL DEFAULT '',
  `xp_to_next`          INT UNSIGNED     NOT NULL DEFAULT 0,
  `xp_total`            INT UNSIGNED     NOT NULL DEFAULT 0 COMMENT 'XP acumulada para alcanzar el rango',
  `reputacion_req`      SMALLINT         NOT NULL DEFAULT 0,
  `lealtad_req`         DECIMAL(4,3)     NOT NULL DEFAULT 0.000,
  `xp_multiplicador`    DECIMAL(4,3)     NOT NULL DEFAULT 1.000,
  `estipendio_centavos` INT UNSIGNED     NOT NULL DEFAULT 0,
  `peso_territorial`    DECIMAL(4,2)     NOT NULL DEFAULT 1.00,
  `cupo_misiones`       TINYINT UNSIGNED NOT NULL DEFAULT 8,
  `rareza_max`          ENUM('comun','infrecuente','rara','epica','mitica') NOT NULL DEFAULT 'comun',
  `desbloqueos`         JSON             NULL,
  PRIMARY KEY (`nivel`),
  UNIQUE KEY `uq_rangos_slug` (`slug`),
  CONSTRAINT `ck_rangos_nivel` CHECK (`nivel` BETWEEN 1 AND 10),
  CONSTRAINT `ck_rangos_lealtad` CHECK (`lealtad_req` BETWEEN 0 AND 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Semilla en seeds/002_rangos.sql. Debe coincidir con /shared/constants/ranks.ts';

-- -----------------------------------------------------------------------------
--  items_catalogo — ítems de inventario.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `items_catalogo` (
  `id`               SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `slug`             VARCHAR(48)       NOT NULL,
  `nombre`           VARCHAR(80)       NOT NULL,
  `descripcion`      VARCHAR(255)      NOT NULL DEFAULT '',
  `tipo`             ENUM('consumible','herramienta','cosmetico','documento','insignia','moneda') NOT NULL,
  `rareza`           ENUM('comun','infrecuente','rara','epica','mitica') NOT NULL DEFAULT 'comun',
  `apilable`         TINYINT(1)        NOT NULL DEFAULT 1,
  `max_pila`         SMALLINT UNSIGNED NOT NULL DEFAULT 99,
  `precio_centavos`  INT UNSIGNED      NOT NULL DEFAULT 0,
  `slot`             ENUM('mano','cabeza','torso','espalda','ninguno') NOT NULL DEFAULT 'ninguno',
  `durabilidad_max`  SMALLINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '0 = sin durabilidad',
  `rango_min`        TINYINT UNSIGNED  NOT NULL DEFAULT 1,
  `efectos`          JSON              NULL COMMENT 'Buffs otorgados al usar/equipar',
  `icono`            VARCHAR(120)      NOT NULL DEFAULT '',
  `habilitado`       TINYINT(1)        NOT NULL DEFAULT 1,
  `creado_en`        TIMESTAMP         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_items_slug` (`slug`),
  KEY `ix_items_tipo` (`tipo`, `habilitado`),
  CONSTRAINT `ck_items_rango` CHECK (`rango_min` BETWEEN 1 AND 10),
  CONSTRAINT `fk_items_rango` FOREIGN KEY (`rango_min`) REFERENCES `rangos` (`nivel`) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
--  cartas_debate — catálogo de cartas de los duelos retóricos.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `cartas_debate` (
  `id`                SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `slug`              VARCHAR(48)       NOT NULL,
  `nombre`            VARCHAR(80)       NOT NULL,
  `flavor`            VARCHAR(255)      NOT NULL DEFAULT '',
  `familia`           ENUM('chicana','carpetazo','promesa_inviable','romper_quorum','chanchullo','invocar_al_lider') NOT NULL,
  `rareza`            ENUM('comun','infrecuente','rara','epica','mitica') NOT NULL DEFAULT 'comun',
  `costo`             TINYINT UNSIGNED  NOT NULL DEFAULT 1 COMMENT 'Labia que cuesta jugarla',
  `poder`             SMALLINT UNSIGNED NOT NULL DEFAULT 10,
  `precision_base`    DECIMAL(4,3)      NOT NULL DEFAULT 0.850,
  `backfire`          DECIMAL(4,3)      NOT NULL DEFAULT 0.050,
  `efectos`           JSON              NULL,
  `rango_min`         TINYINT UNSIGNED  NOT NULL DEFAULT 1,
  `faccion_afinidad`  SMALLINT UNSIGNED NULL,
  `cooldown`          TINYINT UNSIGNED  NOT NULL DEFAULT 0,
  `max_copias`        TINYINT UNSIGNED  NOT NULL DEFAULT 2,
  `icono`             VARCHAR(120)      NOT NULL DEFAULT '',
  `habilitada`        TINYINT(1)        NOT NULL DEFAULT 1,
  `creado_en`         TIMESTAMP         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `actualizado_en`    TIMESTAMP         NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_cartas_slug` (`slug`),
  KEY `ix_cartas_familia` (`familia`, `habilitada`),
  KEY `ix_cartas_rango` (`rango_min`),
  CONSTRAINT `fk_cartas_faccion` FOREIGN KEY (`faccion_afinidad`) REFERENCES `facciones` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_cartas_rango` FOREIGN KEY (`rango_min`) REFERENCES `rangos` (`nivel`) ON UPDATE CASCADE,
  CONSTRAINT `ck_cartas_precision` CHECK (`precision_base` BETWEEN 0 AND 1),
  CONSTRAINT `ck_cartas_backfire` CHECK (`backfire` BETWEEN 0 AND 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
--  misiones_catalogo — plantillas de las 10 tipologías Live-Ops.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `misiones_catalogo` (
  `id`                SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `slug`              VARCHAR(64)       NOT NULL,
  `tipo`              ENUM('pegatina_relampago','banderazo_callejero','operacion_desmentida','reparto_barrial','caravana_de_bloques','corte_de_cinta','temporal_cordillerano','guerra_de_punteros','conferencia_prensa','sondeo_vecinal') NOT NULL,
  `titulo`            VARCHAR(120)      NOT NULL,
  `descripcion`       TEXT              NOT NULL,
  `objetivos`         JSON              NOT NULL COMMENT 'QuestObjective[]',
  `requisitos`        JSON              NULL COMMENT 'QuestRequirements',
  `recompensas_base`  JSON              NOT NULL COMMENT 'QuestRewards antes de multiplicadores',
  `duracion_s`        SMALLINT UNSIGNED NOT NULL DEFAULT 300,
  `grupal`            TINYINT(1)        NOT NULL DEFAULT 0,
  `disputada`         TINYINT(1)        NOT NULL DEFAULT 0 COMMENT 'Carrera contra la facción rival',
  `item_requerido`    VARCHAR(48)       NULL COMMENT 'CAREER_ITEMS de /shared/types/career.ts',
  `rango_min`         TINYINT UNSIGNED  NOT NULL DEFAULT 1,
  `cupo`              SMALLINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '0 = sin límite',
  `exterior`          TINYINT(1)        NOT NULL DEFAULT 1 COMMENT 'Aplica multiplicador de clima',
  `peso_seleccion`    DECIMAL(5,3)      NOT NULL DEFAULT 1.000 COMMENT 'Probabilidad relativa en el orquestador',
  `habilitada`        TINYINT(1)        NOT NULL DEFAULT 1,
  `creado_en`         TIMESTAMP         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `actualizado_en`    TIMESTAMP         NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_misiones_slug` (`slug`),
  KEY `ix_misiones_tipo` (`tipo`, `habilitada`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
--  §2. CUENTAS, PERFIL Y SESIONES
-- =============================================================================

-- -----------------------------------------------------------------------------
--  usuarios — cuenta de plataforma (Hostinger es la autoridad de identidad).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `usuarios` (
  `id`                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `email`                VARCHAR(190)    NOT NULL,
  `email_normalizado`    VARCHAR(190)    NOT NULL COMMENT 'lower(trim(email)); evita duplicados por mayúsculas',
  `email_verificado_en`  DATETIME(3)     NULL,
  `password_hash`        VARCHAR(255)    NOT NULL COMMENT 'PASSWORD_ARGON2ID de PHP 8',
  `password_actualizado_en` DATETIME(3)  NULL,
  `nick`                 VARCHAR(24)     NOT NULL,
  `nick_normalizado`     VARCHAR(24)     NOT NULL COMMENT 'lower(nick); unicidad case-insensitive',
  `rol`                  ENUM('player','sponsor','moderator','analyst','admin') NOT NULL DEFAULT 'player',
  `estado`               ENUM('activo','pendiente','suspendido','baneado','eliminado') NOT NULL DEFAULT 'pendiente',
  `telemetria_consent`   TINYINT(1)      NOT NULL DEFAULT 0,
  `consent_version`      SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  `tyc_version`          SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  `mfa_secret`           VARBINARY(255)  NULL COMMENT 'Cifrado en reposo por la app; sólo staff',
  `ultimo_login_en`      DATETIME(3)     NULL,
  `ultimo_ip_hash`       CHAR(64)        NULL COMMENT 'SHA-256(ip + sal); nunca la IP en claro',
  `intentos_fallidos`    TINYINT UNSIGNED NOT NULL DEFAULT 0,
  `bloqueado_hasta`      DATETIME(3)     NULL,
  `creado_en`            TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `actualizado_en`       TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `eliminado_en`         DATETIME(3)     NULL COMMENT 'Borrado lógico; el job de retención purga a los 30 días',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_usuarios_email` (`email_normalizado`),
  UNIQUE KEY `uq_usuarios_nick` (`nick_normalizado`),
  KEY `ix_usuarios_estado` (`estado`, `creado_en`),
  KEY `ix_usuarios_rol` (`rol`),
  KEY `ix_usuarios_eliminado` (`eliminado_en`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
--  usuario_tokens — refresh tokens rotatorios (el access token no se persiste).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `usuario_tokens` (
  `id`           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `usuario_id`   BIGINT UNSIGNED NOT NULL,
  `jti`          CHAR(36)        NOT NULL,
  `token_hash`   CHAR(64)        NOT NULL COMMENT 'SHA-256 del refresh token; el token en claro no se guarda',
  `jti_previo`   CHAR(36)        NULL COMMENT 'Cadena de rotación: detecta reuso de token robado',
  `bind_hash`    CHAR(16)        NOT NULL DEFAULT '' COMMENT 'Huella UA+IP/24',
  `emitido_en`   DATETIME(3)     NOT NULL,
  `expira_en`    DATETIME(3)     NOT NULL,
  `revocado_en`  DATETIME(3)     NULL,
  `motivo_revocacion` ENUM('rotacion','logout','robo_detectado','admin','password_reset') NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_tokens_jti` (`jti`),
  KEY `ix_tokens_usuario` (`usuario_id`, `expira_en`),
  KEY `ix_tokens_expira` (`expira_en`),
  CONSTRAINT `fk_tokens_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
--  perfiles_demograficos — onboarding de 30 segundos (1:1 con usuarios).
--  La franja etaria es columna GENERADA: el análisis nunca toca la edad exacta.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `perfiles_demograficos` (
  `usuario_id`               BIGINT UNSIGNED NOT NULL,
  `edad`                     TINYINT UNSIGNED NULL COMMENT 'Declarada; opcional',
  `franja_etaria`            VARCHAR(6) GENERATED ALWAYS AS (
                               CASE
                                 WHEN `edad` IS NULL      THEN NULL
                                 WHEN `edad` < 18         THEN '16-17'
                                 WHEN `edad` < 25         THEN '18-24'
                                 WHEN `edad` < 35         THEN '25-34'
                                 WHEN `edad` < 50         THEN '35-49'
                                 WHEN `edad` < 65         THEN '50-64'
                                 ELSE '65+'
                               END
                             ) STORED,
  `genero`                   ENUM('femenino','masculino','no_binario','prefiere_no_decir') NOT NULL DEFAULT 'prefiere_no_decir',
  `barrio`                   ENUM('centro','badenes','ceferino','bella_vista','don_bosco','estacion','zona_norte','alta_esquel','plan_1000','valle_chico','matadero','villa_ayelen','alto_rio_percy','otro') NOT NULL DEFAULT 'otro',
  `interes_politico`         ENUM('nulo','bajo','medio','alto','militante') NOT NULL DEFAULT 'medio',
  `anios_en_esquel`          TINYINT UNSIGNED NULL,
  `ocupacion`                ENUM('estudiante','empleado','independiente','estatal','comerciante','jubilado','desocupado','otro','prefiere_no_decir') NOT NULL DEFAULT 'prefiere_no_decir',
  `onboarding_segundos`      SMALLINT UNSIGNED NULL COMMENT 'Cuánto tardó: métrica de fricción',
  `onboarding_completado_en` DATETIME(3)     NULL,
  `fuente_registro`          VARCHAR(48)     NOT NULL DEFAULT 'organico',
  `creado_en`                TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `actualizado_en`           TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`usuario_id`),
  KEY `ix_perfiles_segmento` (`barrio`, `franja_etaria`, `genero`),
  KEY `ix_perfiles_interes` (`interes_politico`),
  CONSTRAINT `fk_perfiles_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `ck_perfiles_edad` CHECK (`edad` IS NULL OR `edad` BETWEEN 13 AND 110)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
--  consentimientos — traza inmutable de aceptaciones/revocaciones (GDPR-like).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `consentimientos` (
  `id`         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `usuario_id` BIGINT UNSIGNED NOT NULL,
  `tipo`       ENUM('tyc','privacidad','telemetria','voz','menores') NOT NULL,
  `version`    SMALLINT UNSIGNED NOT NULL,
  `otorgado`   TINYINT(1)      NOT NULL,
  `ip_hash`    CHAR(64)        NULL,
  `ua_hash`    CHAR(64)        NULL,
  `creado_en`  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `ix_consent_usuario` (`usuario_id`, `tipo`, `creado_en`),
  CONSTRAINT `fk_consent_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
--  §3. PERSONAJES E INVENTARIO
-- =============================================================================

CREATE TABLE IF NOT EXISTS `personajes` (
  `id`                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `usuario_id`          BIGINT UNSIGNED NOT NULL,
  `nombre`              VARCHAR(24)     NOT NULL,
  `nombre_normalizado`  VARCHAR(24)     NOT NULL,
  `faccion_id`          SMALLINT UNSIGNED NULL COMMENT 'NULL = independiente',
  `rango_nivel`         TINYINT UNSIGNED NOT NULL DEFAULT 1,
  `xp`                  INT UNSIGNED    NOT NULL DEFAULT 0,
  `reputacion`          SMALLINT        NOT NULL DEFAULT 0,
  `lealtad`             DECIMAL(4,3)    NOT NULL DEFAULT 0.000,
  `guita_centavos`      BIGINT UNSIGNED NOT NULL DEFAULT 250000,
  `salud`               SMALLINT UNSIGNED NOT NULL DEFAULT 100,
  `energia`             SMALLINT UNSIGNED NOT NULL DEFAULT 100,
  `abrigo`              DECIMAL(4,3)    NOT NULL DEFAULT 1.000,
  `barrio`              ENUM('centro','badenes','ceferino','bella_vista','don_bosco','estacion','zona_norte','alta_esquel','plan_1000','valle_chico','matadero','villa_ayelen','alto_rio_percy','otro') NOT NULL DEFAULT 'centro',
  `modo`                ENUM('candidato','ciudadano') NOT NULL DEFAULT 'ciudadano',
  `apariencia`          JSON            NULL COMMENT 'AvatarAppearance',
  `pos_x`               DECIMAL(9,3)    NOT NULL DEFAULT 0.000,
  `pos_y`               DECIMAL(9,3)    NOT NULL DEFAULT 0.000,
  `pos_z`               DECIMAL(9,3)    NOT NULL DEFAULT 0.000,
  `yaw`                 DECIMAL(6,4)    NOT NULL DEFAULT 0.0000,
  `shard`               VARCHAR(48)     NULL COMMENT 'Último shard donde estuvo',
  `playtime_segundos`   INT UNSIGNED    NOT NULL DEFAULT 0,
  `misiones_hoy`        SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  `duelos_ganados`      INT UNSIGNED    NOT NULL DEFAULT 0,
  `duelos_perdidos`     INT UNSIGNED    NOT NULL DEFAULT 0,
  `reset_diario_en`     DATE            NULL COMMENT 'Último reinicio de contadores (05:00 hora Esquel)',
  `faccion_desde`       DATETIME(3)     NULL,
  `estado`              ENUM('activo','archivado','baneado') NOT NULL DEFAULT 'activo',
  `ultimo_online_en`    DATETIME(3)     NULL,
  `creado_en`           TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `actualizado_en`      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_personajes_nombre` (`nombre_normalizado`),
  KEY `ix_personajes_usuario` (`usuario_id`, `estado`),
  KEY `ix_personajes_faccion_rango` (`faccion_id`, `rango_nivel`, `xp` DESC),
  KEY `ix_personajes_ranking` (`estado`, `xp` DESC),
  KEY `ix_personajes_barrio` (`barrio`, `rango_nivel`),
  KEY `ix_personajes_online` (`ultimo_online_en`),
  CONSTRAINT `fk_personajes_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_personajes_faccion` FOREIGN KEY (`faccion_id`) REFERENCES `facciones` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_personajes_rango` FOREIGN KEY (`rango_nivel`) REFERENCES `rangos` (`nivel`) ON UPDATE CASCADE,
  CONSTRAINT `ck_personajes_lealtad` CHECK (`lealtad` BETWEEN 0 AND 1),
  CONSTRAINT `ck_personajes_reputacion` CHECK (`reputacion` BETWEEN -1000 AND 1000),
  CONSTRAINT `ck_personajes_abrigo` CHECK (`abrigo` BETWEEN 0 AND 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `inventario` (
  `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `personaje_id`  BIGINT UNSIGNED NOT NULL,
  `item_id`       SMALLINT UNSIGNED NOT NULL,
  `cantidad`      SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  `equipado`      TINYINT(1)      NOT NULL DEFAULT 0,
  `slot`          ENUM('mochila','mano','cabeza','torso','espalda') NOT NULL DEFAULT 'mochila',
  `slot_equipado` ENUM('mano','cabeza','torso','espalda') GENERATED ALWAYS AS (
                    IF(`slot` = 'mochila', NULL, `slot`)
                  ) STORED COMMENT 'Unicidad parcial: un solo ítem equipado por slot',
  `durabilidad`   DECIMAL(4,3)    NULL,
  `origen`        ENUM('mision','compra','recompensa','evento','admin','inicial') NOT NULL DEFAULT 'mision',
  `adquirido_en`  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `actualizado_en` TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_inventario_stack` (`personaje_id`, `item_id`, `slot`),
  UNIQUE KEY `uq_inventario_equipado` (`personaje_id`, `slot_equipado`),
  KEY `ix_inventario_personaje` (`personaje_id`, `equipado`),
  KEY `ix_inventario_item` (`item_id`),
  CONSTRAINT `fk_inventario_personaje` FOREIGN KEY (`personaje_id`) REFERENCES `personajes` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_inventario_item` FOREIGN KEY (`item_id`) REFERENCES `items_catalogo` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `ck_inventario_cantidad` CHECK (`cantidad` >= 1),
  CONSTRAINT `ck_inventario_durabilidad` CHECK (`durabilidad` IS NULL OR `durabilidad` BETWEEN 0 AND 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Un stack por (personaje,item,slot) y un solo ítem equipado por slot vía columna generada';

CREATE TABLE IF NOT EXISTS `personaje_cartas` (
  `personaje_id` BIGINT UNSIGNED NOT NULL,
  `carta_id`     SMALLINT UNSIGNED NOT NULL,
  `cantidad`     TINYINT UNSIGNED NOT NULL DEFAULT 1,
  `obtenida_en`  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`personaje_id`, `carta_id`),
  KEY `ix_pcartas_carta` (`carta_id`),
  CONSTRAINT `fk_pcartas_personaje` FOREIGN KEY (`personaje_id`) REFERENCES `personajes` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_pcartas_carta` FOREIGN KEY (`carta_id`) REFERENCES `cartas_debate` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `personaje_mazos` (
  `personaje_id`   BIGINT UNSIGNED NOT NULL,
  `nombre`         VARCHAR(40)     NOT NULL DEFAULT 'Principal',
  `cartas`         JSON            NOT NULL COMMENT 'Array de 12 slugs; validado por el servidor',
  `actualizado_en` TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`personaje_id`),
  CONSTRAINT `fk_mazos_personaje` FOREIGN KEY (`personaje_id`) REFERENCES `personajes` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ascensos` (
  `id`           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `personaje_id` BIGINT UNSIGNED NOT NULL,
  `desde_nivel`  TINYINT UNSIGNED NOT NULL,
  `hasta_nivel`  TINYINT UNSIGNED NOT NULL,
  `xp_al_ascender` INT UNSIGNED  NOT NULL,
  `horas_jugadas` DECIMAL(8,2)   NOT NULL DEFAULT 0,
  `creado_en`    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `ix_ascensos_personaje` (`personaje_id`, `creado_en`),
  KEY `ix_ascensos_nivel` (`hasta_nivel`, `creado_en`),
  CONSTRAINT `fk_ascensos_personaje` FOREIGN KEY (`personaje_id`) REFERENCES `personajes` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Insumo del balance: cuántas horas tarda cada rango en la práctica';

-- =============================================================================
--  §4. MUNDO, TERRITORIO Y MISIONES
-- =============================================================================

CREATE TABLE IF NOT EXISTS `zonas_territorio` (
  `id`                 VARCHAR(48)     NOT NULL COMMENT 'zone:plaza-san-martin',
  `nombre`             VARCHAR(80)     NOT NULL,
  `barrio`             ENUM('centro','badenes','ceferino','bella_vista','don_bosco','estacion','zona_norte','alta_esquel','plan_1000','valle_chico','matadero','villa_ayelen','alto_rio_percy','otro') NOT NULL,
  `celdas`             JSON            NOT NULL COMMENT 'GridCell[]',
  `centro_x`           DECIMAL(9,3)    NOT NULL,
  `centro_z`           DECIMAL(9,3)    NOT NULL,
  `radio_m`            SMALLINT UNSIGNED NOT NULL DEFAULT 45,
  `peso`               DECIMAL(4,2)    NOT NULL DEFAULT 1.00,
  `faccion_control_id` SMALLINT UNSIGNED NULL,
  `puntajes`           JSON            NULL COMMENT 'Puntaje acumulado por facción',
  `segundos_aguante`   SMALLINT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'Segundos sostenidos ≥60% hacia CAPTURE_HOLD_S',
  `faccion_aguante_id` SMALLINT UNSIGNED NULL COMMENT 'Facción que viene aguantando',
  `ultima_captura_en`  DATETIME(3)     NULL,
  `actualizado_en`     TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `ix_zonas_barrio` (`barrio`),
  KEY `ix_zonas_control` (`faccion_control_id`, `ultima_captura_en`),
  CONSTRAINT `fk_zonas_faccion` FOREIGN KEY (`faccion_control_id`) REFERENCES `facciones` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_zonas_aguante` FOREIGN KEY (`faccion_aguante_id`) REFERENCES `facciones` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `movilizaciones` (
  `id`                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `zona_id`            VARCHAR(48)     NOT NULL,
  `faccion_convocante` SMALLINT UNSIGNED NULL,
  `iniciada_en`        DATETIME(3)     NOT NULL,
  `finalizada_en`      DATETIME(3)     NULL,
  `participantes`      JSON            NULL COMMENT 'Headcount por facción, por tick agregado',
  `puntajes`           JSON            NULL,
  `pico_participantes` SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  `resultado`          ENUM('capturada','defendida','sin_efecto','cancelada') NULL,
  `clima`              VARCHAR(16)     NULL,
  `creada_en`          TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `ix_movilizaciones_zona` (`zona_id`, `iniciada_en`),
  KEY `ix_movilizaciones_faccion` (`faccion_convocante`, `iniciada_en`),
  CONSTRAINT `fk_movilizaciones_zona` FOREIGN KEY (`zona_id`) REFERENCES `zonas_territorio` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_movilizaciones_faccion` FOREIGN KEY (`faccion_convocante`) REFERENCES `facciones` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `noticias_senales` (
  `id`           VARCHAR(64)     NOT NULL COMMENT 'Hash estable de fuente+url+fecha',
  `fuente`       VARCHAR(80)     NOT NULL,
  `titular`      VARCHAR(255)    NOT NULL,
  `resumen`      TEXT            NULL,
  `url`          VARCHAR(500)    NULL,
  `publicada_en` DATETIME(3)     NOT NULL,
  `topics`       JSON            NULL,
  `barrios`      JSON            NULL,
  `sentimiento`  DECIMAL(4,3)    NOT NULL DEFAULT 0.000 COMMENT '[-1,1]',
  `relevancia`   DECIMAL(4,3)    NOT NULL DEFAULT 0.000 COMMENT '[0,1]',
  `procesada_en` DATETIME(3)     NULL,
  `misiones_generadas` SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  `creada_en`    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `ix_noticias_publicada` (`publicada_en`),
  KEY `ix_noticias_relevancia` (`relevancia` DESC, `publicada_en` DESC),
  KEY `ix_noticias_pendientes` (`procesada_en`, `relevancia` DESC),
  CONSTRAINT `ck_noticias_sentimiento` CHECK (`sentimiento` BETWEEN -1 AND 1),
  CONSTRAINT `ck_noticias_relevancia` CHECK (`relevancia` BETWEEN 0 AND 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Señales de noticias reales normalizadas que disparan misiones Live-Ops';

-- -----------------------------------------------------------------------------
--  misiones_historial — una fila por PARTICIPACIÓN (no por instancia).
--  Es la tabla de mayor crecimiento después de telemetría: índices pensados para
--  (a) el perfil del jugador, (b) el balance por tipología, (c) el mapa por barrio.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `misiones_historial` (
  `id`                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `personaje_id`      BIGINT UNSIGNED NOT NULL,
  `instancia_id`      CHAR(36)        NOT NULL COMMENT 'Id de la instancia viva en el VPS: agrupa participaciones',
  `mision_slug`       VARCHAR(64)     NOT NULL,
  `tipo`              ENUM('pegatina_relampago','banderazo_callejero','operacion_desmentida','reparto_barrial','caravana_de_bloques','corte_de_cinta','temporal_cordillerano','guerra_de_punteros','conferencia_prensa','sondeo_vecinal') NOT NULL,
  `disparador`        ENUM('noticia','clima','territorio','calendario','admin') NOT NULL DEFAULT 'calendario',
  `noticia_id`        VARCHAR(64)     NULL,
  `barrio`            ENUM('centro','badenes','ceferino','bella_vista','don_bosco','estacion','zona_norte','alta_esquel','plan_1000','valle_chico','matadero','villa_ayelen','alto_rio_percy','otro') NOT NULL,
  `zona_id`           VARCHAR(48)     NULL,
  `faccion_id`        SMALLINT UNSIGNED NULL COMMENT 'Facción del personaje al momento de jugarla',
  `rango_nivel`       TINYINT UNSIGNED NOT NULL DEFAULT 1,
  `iniciada_en`       DATETIME(3)     NOT NULL,
  `finalizada_en`     DATETIME(3)     NULL,
  `duracion_s`        SMALLINT UNSIGNED NULL,
  `resultado`         ENUM('completada','parcial','fallada','abandonada','expirada') NOT NULL DEFAULT 'parcial',
  `completitud`       DECIMAL(5,4)    NOT NULL DEFAULT 0.0000,
  `contadores`        JSON            NULL COMMENT 'QuestProgress.counters, para reconstruir una misión a medias',
  `contribucion`      DECIMAL(5,4)    NOT NULL DEFAULT 0.0000 COMMENT 'Peso dentro de la misión grupal',
  `xp_ganada`         INT             NOT NULL DEFAULT 0,
  `rep_ganada`        SMALLINT        NOT NULL DEFAULT 0,
  `guita_ganada`      BIGINT          NOT NULL DEFAULT 0,
  `territorio_score`  DECIMAL(8,2)    NOT NULL DEFAULT 0.00,
  `multiplicadores`   JSON            NULL COMMENT 'Desglose auditable de computeQuestReward()',
  `clima`             VARCHAR(16)     NULL,
  `hora_local`        TINYINT UNSIGNED NULL,
  `seed`              INT UNSIGNED    NOT NULL DEFAULT 0,
  `creado_en`         TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `dia`               DATE GENERATED ALWAYS AS (DATE(`iniciada_en`)) STORED,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_historial_participacion` (`instancia_id`, `personaje_id`),
  KEY `ix_historial_personaje` (`personaje_id`, `iniciada_en` DESC),
  KEY `ix_historial_tipo_dia` (`tipo`, `dia`),
  KEY `ix_historial_barrio_dia` (`barrio`, `dia`),
  KEY `ix_historial_faccion_dia` (`faccion_id`, `dia`),
  KEY `ix_historial_resultado` (`resultado`, `dia`),
  KEY `ix_historial_noticia` (`noticia_id`),
  CONSTRAINT `fk_historial_personaje` FOREIGN KEY (`personaje_id`) REFERENCES `personajes` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_historial_faccion` FOREIGN KEY (`faccion_id`) REFERENCES `facciones` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_historial_noticia` FOREIGN KEY (`noticia_id`) REFERENCES `noticias_senales` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `ck_historial_completitud` CHECK (`completitud` BETWEEN 0 AND 1),
  CONSTRAINT `ck_historial_contribucion` CHECK (`contribucion` BETWEEN 0 AND 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `duelos_debate` (
  `id`             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `retador_id`     BIGINT UNSIGNED NOT NULL,
  `defensor_id`    BIGINT UNSIGNED NOT NULL,
  `arena`          ENUM('esquina','plaza_san_martin','radio_local','concejo','asado') NOT NULL DEFAULT 'esquina',
  `zona_id`        VARCHAR(48)     NULL,
  `seed`           INT UNSIGNED    NOT NULL,
  `turnos`         TINYINT UNSIGNED NOT NULL DEFAULT 0,
  `ganador_id`     BIGINT UNSIGNED NULL,
  `empate`         TINYINT(1)      NOT NULL DEFAULT 0,
  `motivo`         ENUM('credibilidad','turnos','abandono','desconexion','moderacion') NOT NULL DEFAULT 'credibilidad',
  `dominancia`     DECIMAL(4,3)    NOT NULL DEFAULT 0.000,
  `pot_centavos`   BIGINT UNSIGNED NOT NULL DEFAULT 0,
  `espectadores`   SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  `log`            JSON            NULL COMMENT 'DebateLogEntry[]: reproducible con el seed',
  `iniciado_en`    DATETIME(3)     NOT NULL,
  `finalizado_en`  DATETIME(3)     NULL,
  `dia`            DATE GENERATED ALWAYS AS (DATE(`iniciado_en`)) STORED,
  PRIMARY KEY (`id`),
  KEY `ix_duelos_retador` (`retador_id`, `iniciado_en` DESC),
  KEY `ix_duelos_defensor` (`defensor_id`, `iniciado_en` DESC),
  KEY `ix_duelos_dia` (`dia`, `arena`),
  KEY `ix_duelos_ganador` (`ganador_id`),
  CONSTRAINT `fk_duelos_retador` FOREIGN KEY (`retador_id`) REFERENCES `personajes` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_duelos_defensor` FOREIGN KEY (`defensor_id`) REFERENCES `personajes` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_duelos_zona` FOREIGN KEY (`zona_id`) REFERENCES `zonas_territorio` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `ck_duelos_distintos` CHECK (`retador_id` <> `defensor_id`),
  CONSTRAINT `ck_duelos_dominancia` CHECK (`dominancia` BETWEEN 0 AND 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `sesiones_juego` (
  `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `usuario_id`    BIGINT UNSIGNED NOT NULL,
  `personaje_id`  BIGINT UNSIGNED NULL,
  `sesion_ref`    CHAR(36)        NOT NULL COMMENT 'Mismo valor que TelemetryEvent.sessionRef',
  `shard`         VARCHAR(48)     NULL,
  `plataforma`    ENUM('desktop','mobile','tablet') NOT NULL DEFAULT 'desktop',
  `client_version` VARCHAR(24)    NULL,
  `iniciada_en`   DATETIME(3)     NOT NULL,
  `finalizada_en` DATETIME(3)     NULL,
  `segundos`      INT UNSIGNED    NULL,
  `motivo_fin`    ENUM('logout','timeout','crash','kick') NULL,
  `dia`           DATE GENERATED ALWAYS AS (DATE(`iniciada_en`)) STORED,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_sesiones_ref` (`sesion_ref`),
  KEY `ix_sesiones_usuario` (`usuario_id`, `iniciada_en` DESC),
  KEY `ix_sesiones_dia` (`dia`),
  CONSTRAINT `fk_sesiones_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_sesiones_personaje` FOREIGN KEY (`personaje_id`) REFERENCES `personajes` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Retención y tiempo de juego. No guarda IP ni user-agent en claro.';

-- -----------------------------------------------------------------------------
--  campanas_candidato — una fila por campaña del Modo Candidato.
--  El single-player se juega en el cliente; el servidor valida el resultado
--  (ModeRegistry.settleCampaign) y recién ahí se persiste lo que pagó.
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
  CONSTRAINT `fk_campanas_personaje` FOREIGN KEY (`personaje_id`) REFERENCES `personajes` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Modo Candidato: partidas jugadas y lo que dejaron en el personaje.';

-- =============================================================================
--  §5. PIPELINE DE FACHADAS MODULARES
-- =============================================================================

CREATE TABLE IF NOT EXISTS `prefabs_edificios` (
  `id`               VARCHAR(64)     NOT NULL COMMENT 'prefabId: prefab:alvear-0850',
  `version`          INT UNSIGNED    NOT NULL DEFAULT 1,
  `parcela_id`       VARCHAR(48)     NOT NULL COMMENT 'parcel:C<col>-R<row>-P<idx>',
  `celda_col`        SMALLINT        NOT NULL,
  `celda_row`        SMALLINT        NOT NULL,
  `calle`            VARCHAR(48)     NOT NULL DEFAULT 'otra',
  `altura`           SMALLINT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'Altura catastral (0 = sin numeración)',
  `barrio`           ENUM('centro','badenes','ceferino','bella_vista','don_bosco','estacion','zona_norte','alta_esquel','plan_1000','valle_chico','matadero','villa_ayelen','alto_rio_percy','otro') NOT NULL DEFAULT 'centro',
  `uso_suelo`        ENUM('residencial','comercial','gastronomico','institucional','educativo','salud','religioso','hotelero','industrial','baldio','plaza','ferroviario') NOT NULL DEFAULT 'residencial',
  `fuente`           ENUM('procedural','voxel_json','gltf','hybrid') NOT NULL DEFAULT 'procedural',
  `meta`             JSON            NOT NULL COMMENT 'BuildingPrefabMeta completo, validado contra el JSON Schema',
  `asset_lod0`       VARCHAR(200)    NULL,
  `asset_hash`       CHAR(64)        NULL,
  `asset_bytes`      INT UNSIGNED    NULL,
  `estado_revision`  ENUM('borrador','en_revision','aprobado','rechazado','retirado') NOT NULL DEFAULT 'borrador',
  `landmark`         TINYINT(1)      NOT NULL DEFAULT 0,
  `activo`           TINYINT(1)      NOT NULL DEFAULT 0,
  `parcela_activa`   VARCHAR(48) GENERATED ALWAYS AS (IF(`activo` = 1, `parcela_id`, NULL)) STORED
                     COMMENT 'Truco de unicidad parcial: garantiza un solo prefab activo por parcela',
  `sponsor_id`       INT UNSIGNED    NULL,
  `revisor_id`       BIGINT UNSIGNED NULL,
  `revisado_en`      DATETIME(3)     NULL,
  `creado_en`        TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `actualizado_en`   TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_prefab_parcela_activa` (`parcela_activa`),
  KEY `ix_prefab_celda` (`celda_col`, `celda_row`, `activo`),
  KEY `ix_prefab_estado` (`estado_revision`, `actualizado_en`),
  KEY `ix_prefab_direccion` (`calle`, `altura`),
  KEY `ix_prefab_sponsor` (`sponsor_id`),
  CONSTRAINT `fk_prefab_revisor` FOREIGN KEY (`revisor_id`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `prefab_contribuciones` (
  `id`             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `usuario_id`     BIGINT UNSIGNED NOT NULL,
  `direccion`      JSON            NOT NULL COMMENT 'RealAddress',
  `uso_suelo`      ENUM('residencial','comercial','gastronomico','institucional','educativo','salud','religioso','hotelero','industrial','baldio','plaza','ferroviario') NOT NULL DEFAULT 'residencial',
  `fotos`          JSON            NOT NULL COMMENT 'Rutas privadas + flag de anonimización',
  `licencia`       ENUM('cc_by_sa','cesion_al_proyecto','uso_autorizado_comercio') NOT NULL,
  `consent_titular` TINYINT(1)     NOT NULL DEFAULT 0,
  `estado`         ENUM('recibida','en_proceso','aprobada','rechazada') NOT NULL DEFAULT 'recibida',
  `notas`          VARCHAR(1000)   NULL,
  `prefab_id`      VARCHAR(64)     NULL,
  `revisor_id`     BIGINT UNSIGNED NULL,
  `revisado_en`    DATETIME(3)     NULL,
  `creado_en`      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `ix_contrib_usuario` (`usuario_id`, `creado_en` DESC),
  KEY `ix_contrib_estado` (`estado`, `creado_en`),
  CONSTRAINT `fk_contrib_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_contrib_prefab` FOREIGN KEY (`prefab_id`) REFERENCES `prefabs_edificios` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_contrib_revisor` FOREIGN KEY (`revisor_id`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
--  §6. COMERCIOS PATROCINADOS
-- =============================================================================

CREATE TABLE IF NOT EXISTS `comercios_patrocinados` (
  `id`                   INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  `slug`                 VARCHAR(64)     NOT NULL,
  `razon_social`         VARCHAR(120)    NOT NULL,
  `nombre_fantasia`      VARCHAR(80)     NOT NULL,
  `rubro`                ENUM('cafeteria','chocolateria','indumentaria','deportes','libreria','kiosco','restaurante','hotel','turismo','servicios','supermercado','otro') NOT NULL DEFAULT 'otro',
  `calle`                VARCHAR(48)     NOT NULL DEFAULT 'otra',
  `altura`               SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  `barrio`               ENUM('centro','badenes','ceferino','bella_vista','don_bosco','estacion','zona_norte','alta_esquel','plan_1000','valle_chico','matadero','villa_ayelen','alto_rio_percy','otro') NOT NULL DEFAULT 'centro',
  `lat`                  DECIMAL(9,6)    NULL,
  `lon`                  DECIMAL(9,6)    NULL,
  `celda_col`            SMALLINT        NOT NULL DEFAULT 0,
  `celda_row`            SMALLINT        NOT NULL DEFAULT 0,
  `prefab_id`            VARCHAR(64)     NULL,
  `marquesina_textura`   VARCHAR(200)    NULL,
  `marquesina_texto`     VARCHAR(32)     NULL COMMENT 'Lo que dice el cartel (voxelizado)',
  `marquesina_color`     CHAR(7)         NOT NULL DEFAULT '#f2b441' COMMENT 'Color del cartel en hex',
  `marquesina_alto_m`    DECIMAL(4,2)    NOT NULL DEFAULT 1.20 COMMENT 'Alto del cartel en metros',
  `radio_impresion_m`    TINYINT UNSIGNED NOT NULL DEFAULT 15 COMMENT 'Distancia que cuenta como impresión',
  `buff_slug`            VARCHAR(48)     NULL COMMENT 'Buff otorgado al entrar/comprar',
  `buff_config`          JSON            NULL,
  `plan`                 ENUM('gratuito','basico','plus','premium') NOT NULL DEFAULT 'gratuito',
  `estado`               ENUM('prospecto','activo','pausado','vencido','rechazado') NOT NULL DEFAULT 'prospecto',
  `contacto_nombre`      VARCHAR(80)     NULL,
  `contacto_email`       VARCHAR(190)    NULL,
  `contacto_telefono`    VARCHAR(40)     NULL,
  `apertura_minuto`      SMALLINT UNSIGNED NOT NULL DEFAULT 540,
  `cierre_minuto`        SMALLINT UNSIGNED NOT NULL DEFAULT 1260,
  `dias_apertura`        TINYINT UNSIGNED NOT NULL DEFAULT 127 COMMENT 'Máscara de bits: bit0=domingo .. bit6=sábado',
  `contrato_desde`       DATE            NULL,
  `contrato_hasta`       DATE            NULL,
  `monto_mensual_centavos` INT UNSIGNED  NOT NULL DEFAULT 0,
  `impresiones_totales`  BIGINT UNSIGNED NOT NULL DEFAULT 0,
  `usuario_admin_id`     BIGINT UNSIGNED NULL COMMENT 'Cuenta con rol sponsor que administra la ficha',
  `creado_en`            TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `actualizado_en`       TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_comercios_slug` (`slug`),
  KEY `ix_comercios_estado` (`estado`, `contrato_hasta`),
  KEY `ix_comercios_celda` (`celda_col`, `celda_row`),
  KEY `ix_comercios_barrio_rubro` (`barrio`, `rubro`),
  KEY `ix_comercios_prefab` (`prefab_id`),
  CONSTRAINT `fk_comercios_prefab` FOREIGN KEY (`prefab_id`) REFERENCES `prefabs_edificios` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_comercios_admin` FOREIGN KEY (`usuario_admin_id`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `ck_comercios_horario` CHECK (`apertura_minuto` < 1440 AND `cierre_minuto` <= 1440),
  CONSTRAINT `ck_comercios_contrato` CHECK (`contrato_hasta` IS NULL OR `contrato_desde` IS NULL OR `contrato_hasta` >= `contrato_desde`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `comercios_metricas_diarias` (
  `comercio_id`     INT UNSIGNED    NOT NULL,
  `dia`             DATE            NOT NULL,
  `impresiones`     INT UNSIGNED    NOT NULL DEFAULT 0,
  `sujetos_unicos`  INT UNSIGNED    NOT NULL DEFAULT 0,
  `entradas`        INT UNSIGNED    NOT NULL DEFAULT 0,
  `buffs_otorgados` INT UNSIGNED    NOT NULL DEFAULT 0,
  `cta_clicks`      INT UNSIGNED    NOT NULL DEFAULT 0,
  `segundos_vista`  INT UNSIGNED    NOT NULL DEFAULT 0,
  `por_hora`        JSON            NULL COMMENT 'Array de 24 enteros',
  `por_barrio`      JSON            NULL COMMENT 'IntelCell[] con k-anonimato aplicado',
  `actualizado_en`  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`comercio_id`, `dia`),
  KEY `ix_metricas_dia` (`dia`),
  CONSTRAINT `fk_metricas_comercio` FOREIGN KEY (`comercio_id`) REFERENCES `comercios_patrocinados` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
--  §7. MOTOR DE INTELIGENCIA POLÍTICA
-- =============================================================================
--  telemetria_inteligencia es la tabla de mayor volumen del sistema
--  (estimación: 120 jugadores concurrentes × ~40 eventos/hora ≈ 4,8 M filas/mes).
--
--  Por eso:
--   * NO tiene claves foráneas → se puede particionar por RANGE(dia).
--   * El sujeto es un seudónimo HMAC rotativo, no `usuarios.id`.
--   * Los campos de segmentación se desnormalizan como columnas (no dentro del
--     JSON) para que los GROUP BY del dashboard usen índices.
--   * `payload` guarda sólo el detalle específico del evento.
-- -----------------------------------------------------------------------------
-- -----------------------------------------------------------------------------
--  telemetria_lotes — candado de idempotencia del ingest.
--  El VPS reintenta lotes ante un timeout; sin esto, un corte de red duplica
--  telemetría y el share de voto sale inflado.
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
  COMMENT='Un lote repetido no entra dos veces.';

CREATE TABLE IF NOT EXISTS `telemetria_inteligencia` (
  `id`             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `evento_id`      CHAR(36)        NOT NULL COMMENT 'UUID del cliente: idempotencia ante reintentos',
  `tipo`           ENUM('sistema','sesion','movimiento','progresion','social','economia','politico','comercial') NOT NULL,
  `nombre`         VARCHAR(40)     NOT NULL COMMENT 'Allow-list en TELEMETRY_EVENTS',
  `sujeto`         CHAR(32)        NOT NULL COMMENT 'HMAC-SHA256(usuario_id, sal_rotativa) truncado a 128 bits',
  `sesion_ref`     CHAR(36)        NOT NULL,
  `ocurrido_en`    DATETIME(3)     NOT NULL COMMENT 'Reloj del cliente',
  `recibido_en`    DATETIME(3)     NOT NULL COMMENT 'Reloj del servidor: detecta desfasajes',
  `barrio`         ENUM('centro','badenes','ceferino','bella_vista','don_bosco','estacion','zona_norte','alta_esquel','plan_1000','valle_chico','matadero','villa_ayelen','alto_rio_percy','otro') NOT NULL DEFAULT 'otro',
  `franja_etaria`  ENUM('16-17','18-24','25-34','35-49','50-64','65+') NULL,
  `genero`         ENUM('femenino','masculino','no_binario','prefiere_no_decir') NOT NULL DEFAULT 'prefiere_no_decir',
  `interes`        ENUM('nulo','bajo','medio','alto','militante') NOT NULL DEFAULT 'medio',
  `faccion_id`     SMALLINT UNSIGNED NULL,
  `rango_nivel`    TINYINT UNSIGNED NULL,
  `celda_col`      SMALLINT        NULL,
  `celda_row`      SMALLINT        NULL,
  `plataforma`     ENUM('desktop','mobile','tablet') NOT NULL DEFAULT 'desktop',
  `client_version` VARCHAR(24)     NOT NULL DEFAULT '',
  `hora_local`     TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'Hora de Esquel 0..23',
  `payload`        JSON            NULL,
  `schema_version` TINYINT UNSIGNED NOT NULL DEFAULT 1,
  `dia`            DATE GENERATED ALWAYS AS (DATE(`ocurrido_en`)) STORED,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_telemetria_evento` (`evento_id`),
  KEY `ix_telemetria_nombre_dia` (`nombre`, `dia`),
  KEY `ix_telemetria_segmento` (`nombre`, `barrio`, `franja_etaria`, `dia`),
  KEY `ix_telemetria_sujeto` (`sujeto`, `dia`),
  KEY `ix_telemetria_tipo_dia` (`tipo`, `dia`),
  KEY `ix_telemetria_celda` (`celda_col`, `celda_row`, `dia`),
  KEY `ix_telemetria_faccion` (`faccion_id`, `dia`),
  KEY `ix_telemetria_recibido` (`recibido_en`),
  CONSTRAINT `ck_telemetria_hora` CHECK (`hora_local` BETWEEN 0 AND 23)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Eventos pseudonimizados. Sin PII. Retención cruda: 180 días (ver §9).';

-- -----------------------------------------------------------------------------
--  telemetria_agregados — salida del job nocturno, ya con k-anonimato aplicado.
--  Es lo ÚNICO que consume el dashboard: la tabla cruda no se expone jamás.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `telemetria_agregados` (
  `dia`            DATE            NOT NULL,
  `metrica`        VARCHAR(48)     NOT NULL COMMENT 'vote_share, sentimiento_topic, dau, retencion_d1, ...',
  `dimension`      VARCHAR(48)     NOT NULL DEFAULT '' COMMENT 'Valor libre: topic, faccion slug, tipo de misión',
  `barrio`         ENUM('centro','badenes','ceferino','bella_vista','don_bosco','estacion','zona_norte','alta_esquel','plan_1000','valle_chico','matadero','villa_ayelen','alto_rio_percy','otro','__todos') NOT NULL DEFAULT '__todos',
  `franja_etaria`  ENUM('16-17','18-24','25-34','35-49','50-64','65+','__todas') NOT NULL DEFAULT '__todas',
  `n`              INT UNSIGNED    NOT NULL DEFAULT 0 COMMENT 'Sujetos distintos en la celda',
  `valor`          DECIMAL(12,5)   NOT NULL DEFAULT 0.00000,
  `moe`            DECIMAL(8,5)    NOT NULL DEFAULT 0.00000 COMMENT 'Margen de error al 95%',
  `publicable`     TINYINT(1)      NOT NULL DEFAULT 0 COMMENT 'n >= K_ANON_MIN (15)',
  `calculado_en`   TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`dia`, `metrica`, `dimension`, `barrio`, `franja_etaria`),
  KEY `ix_agregados_metrica` (`metrica`, `dia`),
  KEY `ix_agregados_publicable` (`publicable`, `metrica`, `dia`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
--  intencion_voto_diaria — corte diario, el producto estrella del motor.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `intencion_voto_diaria` (
  `dia`           DATE            NOT NULL,
  `faccion_id`    SMALLINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '0 = indecisos / no vota',
  `barrio`        ENUM('centro','badenes','ceferino','bella_vista','don_bosco','estacion','zona_norte','alta_esquel','plan_1000','valle_chico','matadero','villa_ayelen','alto_rio_percy','otro','__todos') NOT NULL DEFAULT '__todos',
  `franja_etaria` ENUM('16-17','18-24','25-34','35-49','50-64','65+','__todas') NOT NULL DEFAULT '__todas',
  `n`             INT UNSIGNED    NOT NULL DEFAULT 0,
  `share`         DECIMAL(6,5)    NOT NULL DEFAULT 0.00000,
  `share_ponderado` DECIMAL(6,5)  NOT NULL DEFAULT 0.00000 COMMENT 'Ponderado por peso de padrón del barrio',
  `delta_pp`      DECIMAL(6,3)    NOT NULL DEFAULT 0.000 COMMENT 'Variación en puntos vs. el corte anterior',
  `moe`           DECIMAL(6,5)    NOT NULL DEFAULT 0.00000,
  `publicable`    TINYINT(1)      NOT NULL DEFAULT 0,
  `calculado_en`  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`dia`, `faccion_id`, `barrio`, `franja_etaria`),
  KEY `ix_voto_faccion_dia` (`faccion_id`, `dia`),
  KEY `ix_voto_publicable` (`publicable`, `dia`),
  CONSTRAINT `ck_voto_share` CHECK (`share` BETWEEN 0 AND 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
--  sentimiento_barrio — mapa de calor de sentimiento por tema y barrio.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `sentimiento_barrio` (
  `dia`          DATE            NOT NULL,
  `topic`        VARCHAR(48)     NOT NULL COMMENT 'agua, obras, seguridad, nieve, turismo, presupuesto',
  `barrio`       ENUM('centro','badenes','ceferino','bella_vista','don_bosco','estacion','zona_norte','alta_esquel','plan_1000','valle_chico','matadero','villa_ayelen','alto_rio_percy','otro','__todos') NOT NULL,
  `n`            INT UNSIGNED    NOT NULL DEFAULT 0,
  `sentimiento`  DECIMAL(5,4)    NOT NULL DEFAULT 0.0000 COMMENT '[-1,1]',
  `publicable`   TINYINT(1)      NOT NULL DEFAULT 0,
  `calculado_en` TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`dia`, `topic`, `barrio`),
  KEY `ix_sentimiento_topic` (`topic`, `dia`),
  CONSTRAINT `ck_sentimiento_rango` CHECK (`sentimiento` BETWEEN -1 AND 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
--  §8. MODERACIÓN Y AUDITORÍA
-- =============================================================================

-- -----------------------------------------------------------------------------
--  admin_sesiones — tokens del dashboard de campaña.
--  El token en claro no se guarda: se guarda su SHA-256, así una filtración de
--  la base no entrega el acceso. Vencen y se pueden revocar de a uno.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `admin_sesiones` (
  `id`           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `usuario_id`   BIGINT UNSIGNED NULL COMMENT 'NULL = entró con la clave maestra',
  `token_hash`   CHAR(64)        NOT NULL COMMENT 'SHA-256 del token',
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
  COMMENT='Tokens del dashboard de campaña.';

CREATE TABLE IF NOT EXISTS `moderacion_denuncias` (
  `id`                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `denunciante_id`    BIGINT UNSIGNED NULL,
  `denunciado_id`     BIGINT UNSIGNED NULL,
  `categoria`         ENUM('insultos','spam','trampa','nombre','contenido_sexual','discriminacion','otro') NOT NULL,
  `contexto`          ENUM('chat','voz','nombre','avatar','prefab','duelo') NOT NULL DEFAULT 'chat',
  `nota`              VARCHAR(500)    NULL,
  `evidencia`         JSON            NULL COMMENT 'Referencias a mensajes/tiempos; nunca audio crudo',
  `estado`            ENUM('abierta','en_revision','resuelta','desestimada') NOT NULL DEFAULT 'abierta',
  `accion`            ENUM('ninguna','advertencia','silencio','suspension','baneo') NULL,
  `resuelto_por`      BIGINT UNSIGNED NULL,
  `resuelto_en`       DATETIME(3)     NULL,
  `creado_en`         TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `ix_denuncias_estado` (`estado`, `creado_en`),
  KEY `ix_denuncias_denunciado` (`denunciado_id`, `creado_en`),
  CONSTRAINT `fk_denuncias_denunciante` FOREIGN KEY (`denunciante_id`) REFERENCES `personajes` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_denuncias_denunciado` FOREIGN KEY (`denunciado_id`) REFERENCES `personajes` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_denuncias_resolutor` FOREIGN KEY (`resuelto_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `auditoria` (
  `id`         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `actor_id`   BIGINT UNSIGNED NULL COMMENT 'NULL = proceso automático',
  `accion`     VARCHAR(64)     NOT NULL,
  `entidad`    VARCHAR(48)     NOT NULL,
  `entidad_id` VARCHAR(64)     NULL,
  `datos`      JSON            NULL COMMENT 'Antes/después; nunca contraseñas ni tokens',
  `ip_hash`    CHAR(64)        NULL,
  `creado_en`  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `ix_auditoria_entidad` (`entidad`, `entidad_id`, `creado_en`),
  KEY `ix_auditoria_actor` (`actor_id`, `creado_en`),
  CONSTRAINT `fk_auditoria_actor` FOREIGN KEY (`actor_id`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
--  §9. VISTAS DE CONSULTA
-- =============================================================================

-- Ranking de militantes: la consulta más pedida por el HUD y la landing.
CREATE OR REPLACE VIEW `v_ranking_militantes` AS
SELECT
  p.`id`            AS personaje_id,
  p.`nombre`        AS nombre,
  p.`rango_nivel`   AS rango_nivel,
  r.`nombre`        AS rango_nombre,
  p.`xp`            AS xp,
  p.`reputacion`    AS reputacion,
  p.`barrio`        AS barrio,
  f.`slug`          AS faccion_slug,
  f.`nombre_corto`  AS faccion_corta,
  p.`duelos_ganados` AS duelos_ganados,
  p.`ultimo_online_en` AS ultimo_online_en
FROM `personajes` p
JOIN `rangos` r      ON r.`nivel` = p.`rango_nivel`
LEFT JOIN `facciones` f ON f.`id` = p.`faccion_id`
WHERE p.`estado` = 'activo';

-- Intención de voto publicable: aplica k-anonimato en la propia vista.
CREATE OR REPLACE VIEW `v_intencion_voto_publica` AS
SELECT
  v.`dia`,
  v.`faccion_id`,
  COALESCE(f.`nombre_corto`, 'INDEC') AS faccion_corta,
  v.`barrio`,
  v.`franja_etaria`,
  v.`n`,
  v.`share`,
  v.`share_ponderado`,
  v.`delta_pp`,
  v.`moe`
FROM `intencion_voto_diaria` v
LEFT JOIN `facciones` f ON f.`id` = v.`faccion_id`
WHERE v.`publicable` = 1 AND v.`n` >= 15;

-- Rendimiento de sponsors para el panel del comercio.
CREATE OR REPLACE VIEW `v_sponsor_performance` AS
SELECT
  c.`id`             AS comercio_id,
  c.`nombre_fantasia`,
  c.`plan`,
  c.`estado`,
  m.`dia`,
  m.`impresiones`,
  m.`sujetos_unicos`,
  m.`entradas`,
  m.`buffs_otorgados`,
  m.`cta_clicks`,
  ROUND(m.`entradas` / NULLIF(m.`impresiones`, 0), 4) AS tasa_entrada
FROM `comercios_patrocinados` c
JOIN `comercios_metricas_diarias` m ON m.`comercio_id` = c.`id`;

-- Balance real por tipología de misión (insumo de recalibración).
CREATE OR REPLACE VIEW `v_balance_misiones` AS
SELECT
  h.`tipo`,
  h.`dia`,
  COUNT(*)                                   AS participaciones,
  COUNT(DISTINCT h.`personaje_id`)            AS jugadores,
  ROUND(AVG(h.`completitud`), 4)              AS completitud_media,
  ROUND(AVG(h.`xp_ganada`), 1)                AS xp_media,
  ROUND(AVG(h.`duracion_s`), 1)               AS duracion_media_s,
  SUM(h.`resultado` = 'abandonada')           AS abandonos
FROM `misiones_historial` h
GROUP BY h.`tipo`, h.`dia`;

-- =============================================================================
--  §10. OPERACIÓN: PARTICIONADO Y RETENCIÓN (OPCIONAL POR ENTORNO)
-- =============================================================================
--  Hostinger compartido no siempre habilita particiones ni el event scheduler.
--  Aplicar SÓLO en el entorno que las soporte (VPS con MySQL 8 dedicado):
--
--  ALTER TABLE `telemetria_inteligencia`
--    DROP PRIMARY KEY,
--    ADD PRIMARY KEY (`id`, `dia`),
--    DROP INDEX `uq_telemetria_evento`,
--    ADD UNIQUE KEY `uq_telemetria_evento` (`evento_id`, `dia`)
--    PARTITION BY RANGE COLUMNS(`dia`) (
--      PARTITION p2027q1 VALUES LESS THAN ('2027-04-01'),
--      PARTITION p2027q2 VALUES LESS THAN ('2027-07-01'),
--      PARTITION p2027q3 VALUES LESS THAN ('2027-10-01'),
--      PARTITION p2027q4 VALUES LESS THAN ('2028-01-01'),
--      PARTITION pmax    VALUES LESS THAN (MAXVALUE)
--    );
--
--  POLÍTICA DE RETENCIÓN (implementada en /backend-php/src/Jobs/Retencion.php,
--  ejecutada por cron diario a las 05:10 hora de Esquel):
--    * telemetria_inteligencia: 180 días (luego sólo quedan los agregados).
--    * usuario_tokens vencidos: 7 días.
--    * sesiones_juego: 365 días.
--    * usuarios con `eliminado_en` < NOW() - 30 días: purga física en cascada.
--    * Revocación de consentimiento: borrado inmediato de los eventos del sujeto
--      y recálculo de los agregados de los días afectados.
--
--  ROTACIÓN DE LA SAL DEL SEUDÓNIMO: cada 30 días. La sal vieja se destruye, con
--  lo que los eventos anteriores dejan de ser vinculables entre períodos.
-- =============================================================================
