-- Esquel LAB — esquema de base de datos (MySQL / MariaDB, InnoDB, utf8mb4)
-- Ejecutar una sola vez en la base creada desde hPanel de Hostinger
-- (phpMyAdmin -> Importar, o pegar en la pestaña SQL).

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ---------------------------------------------------------------------
-- usuarios: acceso al panel /admin
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS usuarios (
    id                     INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    nombre                 VARCHAR(120) NOT NULL,
    usuario                VARCHAR(60)  NOT NULL COMMENT 'nombre de usuario para el login (no el email)',
    email                  VARCHAR(190) NOT NULL,
    password_hash          VARCHAR(255) NOT NULL,
    rol                    ENUM('admin', 'editor', 'viewer') NOT NULL DEFAULT 'viewer',
    activo                 TINYINT(1) NOT NULL DEFAULT 1,
    debe_cambiar_password  TINYINT(1) NOT NULL DEFAULT 0,
    creado_en              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_usuarios_usuario (usuario),
    UNIQUE KEY uq_usuarios_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- intentos_login: rate-limiting básico del panel
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS intentos_login (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    usuario     VARCHAR(60) NOT NULL,
    ip          VARCHAR(64) NOT NULL,
    exitoso     TINYINT(1) NOT NULL DEFAULT 0,
    creado_en   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_intentos_usuario_ip (usuario, ip, creado_en)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- postulaciones: una fila por envío del formulario de /postulacion
-- Los campos de texto largo se corresponden 1:1 con los pasos del
-- formulario descritos en docs/00-investigacion-y-plan.md §6.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS postulaciones (
    id                      INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    programa                ENUM('acelera', 'raiz') NOT NULL,
    estado                  ENUM('nueva','en_revision','preseleccionada','entrevista','aprobada','rechazada','lista_espera')
                                NOT NULL DEFAULT 'nueva',

    -- Paso 2 · Quién sos
    nombre_contacto         VARCHAR(160) NOT NULL,
    email                   VARCHAR(190) NOT NULL,
    telefono                VARCHAR(60)  NULL,
    nombre_emprendimiento   VARCHAR(160) NOT NULL,
    tipo_figura             VARCHAR(60)  NULL,
    rubro                   VARCHAR(160) NULL,
    anios_operando          VARCHAR(60)  NULL,
    redes_sociales          VARCHAR(255) NULL,
    ubicacion               VARCHAR(160) NULL,
    cuit_dni                VARCHAR(40)  NULL,

    -- Paso 3 · Tu propuesta (urbana o rural, según programa)
    propuesta_actual        TEXT NULL,

    -- Paso 4 · Diferenciación
    diferenciacion          TEXT NULL,

    -- Paso 5 · Impacto en la matriz turística
    matriz_turistica        TEXT NULL,

    -- Paso 6 · Producto físico / Economía de los Recuerdos
    tiene_producto_fisico   TINYINT(1) NULL,
    producto_fisico         TEXT NULL,

    -- Paso 7 · Viabilidad operativa mínima
    recursos_actuales       TEXT NULL,
    que_necesita            TEXT NULL,

    -- Paso 8 · Motivación y compromiso (el criterio más pesado)
    motivacion              TEXT NULL,
    compromiso_horas        TINYINT(1) NOT NULL DEFAULT 0,
    equipo_participante     VARCHAR(255) NULL,

    -- Paso 9 · Material de apoyo (opcional)
    material_apoyo_url      VARCHAR(255) NULL,

    -- Paso 10 · Cierre
    acepto_bases            TINYINT(1) NOT NULL DEFAULT 0,

    -- Interno
    puntaje_interno         DECIMAL(4,1) NULL,
    ip_envio                VARCHAR(64)  NULL,
    creado_en               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    actualizado_en          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    KEY idx_postulaciones_programa (programa),
    KEY idx_postulaciones_estado (estado),
    KEY idx_postulaciones_creado (creado_en)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- notas: bitácora del equipo técnico sobre cada postulación (1 a N)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notas (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    postulacion_id  INT UNSIGNED NOT NULL,
    usuario_id      INT UNSIGNED NOT NULL,
    texto           TEXT NOT NULL,
    creado_en       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_notas_postulacion FOREIGN KEY (postulacion_id) REFERENCES postulaciones(id) ON DELETE CASCADE,
    CONSTRAINT fk_notas_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
    KEY idx_notas_postulacion (postulacion_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- historial_estado: trazabilidad de cambios de estado (transparencia
-- del proceso de evaluación ante el Cuadro Técnico)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS historial_estado (
    id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    postulacion_id    INT UNSIGNED NOT NULL,
    usuario_id        INT UNSIGNED NOT NULL,
    estado_anterior   VARCHAR(40) NULL,
    estado_nuevo      VARCHAR(40) NOT NULL,
    creado_en         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_historial_postulacion FOREIGN KEY (postulacion_id) REFERENCES postulaciones(id) ON DELETE CASCADE,
    CONSTRAINT fk_historial_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
    KEY idx_historial_postulacion (postulacion_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET FOREIGN_KEY_CHECKS = 1;
