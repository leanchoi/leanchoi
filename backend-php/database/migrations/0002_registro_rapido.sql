-- =============================================================================
--  0002 — Onboarding sin email y control de idempotencia del volcado del VPS
--
--  El registro rápido de la Fase 2 pide alias y contraseña; el email pasa a ser
--  opcional. En MySQL un índice único admite varios NULL, así que la unicidad
--  del email se mantiene para quienes sí lo cargan.
-- =============================================================================
SET NAMES utf8mb4;

ALTER TABLE `usuarios`
  MODIFY `email` VARCHAR(190) NULL,
  MODIFY `email_normalizado` VARCHAR(190) NULL COMMENT 'lower(trim(email)); NULL si se registró sólo con alias';

-- Lotes de estadísticas ya aplicados: el candado que evita cobrar dos veces la
-- misma guita cuando el VPS reintenta después de un timeout.
CREATE TABLE IF NOT EXISTS `sync_lotes` (
  `batch_id`    CHAR(36)        NOT NULL,
  `shard`       VARCHAR(48)     NOT NULL,
  `personajes`  SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  `recibido_en` DATETIME(3)     NOT NULL,
  PRIMARY KEY (`batch_id`),
  KEY `ix_sync_lotes_recibido` (`recibido_en`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Idempotencia del puente VPS → Hostinger. Se purga a los 7 días.';
