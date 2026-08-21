-- =============================================================================
--  ESQUEL 2027 — SEED: comercios patrocinados (DATOS DE DEMOSTRACIÓN)
--
--  ⚠ TODOS los comercios de este archivo son FICTICIOS. Sirven para probar el
--  pipeline de marquesinas y el panel de métricas sin comprometer a ningún
--  comercio real. Antes de producción:
--    1. Vaciar esta tabla.
--    2. Cargar comercios reales SÓLO con contrato firmado y consentimiento
--       explícito de uso de nombre, marca y fachada (ver PrefabProvenance).
-- =============================================================================
SET NAMES utf8mb4;

INSERT INTO `comercios_patrocinados`
  (`id`, `slug`, `razon_social`, `nombre_fantasia`, `rubro`, `calle`, `altura`, `barrio`, `celda_col`, `celda_row`,
   `marquesina_textura`, `buff_slug`, `buff_config`, `plan`, `estado`, `apertura_minuto`, `cierre_minuto`,
   `dias_apertura`, `monto_mensual_centavos`)
VALUES
  (1, 'demo-cafe-cordillera', 'DEMO Café Cordillera S.R.L.', 'Café Cordillera', 'cafeteria', 'av_alvear', 820, 'centro', 1, 0,
   '/cdn/signs/demo-cafe-cordillera.png', 'cafe_focus',
   '{"label":"Cortado en jarrito","modifiers":{"debateRhetoric":1.12,"staminaRegen":1.2},"durationMinutes":30}',
   'plus', 'activo', 480, 1200, 126, 4500000),

  (2, 'demo-chocolates-lahoya', 'DEMO Chocolates La Hoya S.A.', 'Chocolates La Hoya', 'chocolateria', '25_de_mayo', 640, 'centro', 0, 1,
   '/cdn/signs/demo-chocolates.png', 'chocolate_calor',
   '{"label":"Setenta por ciento","modifiers":{"debateCredibility":1.1,"xpGain":1.08},"durationMinutes":25}',
   'premium', 'activo', 540, 1290, 127, 8000000),

  (3, 'demo-indumentaria-viento', 'DEMO Indumentaria del Viento', 'Viento Outdoor', 'indumentaria', 'san_martin', 455, 'centro', -1, 0,
   '/cdn/signs/demo-viento.png', 'abrigo_tecnico',
   '{"label":"Campera de pluma","modifiers":{"moveSpeed":1.05},"durationMinutes":45}',
   'basico', 'activo', 570, 1230, 62, 2200000),

  (4, 'demo-kiosco-trochita', 'DEMO Kiosco La Trochita', 'Kiosco La Trochita', 'kiosco', 'rivadavia', 120, 'estacion', -3, 2,
   '/cdn/signs/demo-kiosco.png', NULL, NULL, 'gratuito', 'activo', 420, 1380, 127, 0)
ON DUPLICATE KEY UPDATE
  `nombre_fantasia` = VALUES(`nombre_fantasia`), `rubro` = VALUES(`rubro`), `plan` = VALUES(`plan`),
  `estado` = VALUES(`estado`), `buff_slug` = VALUES(`buff_slug`), `buff_config` = VALUES(`buff_config`);
