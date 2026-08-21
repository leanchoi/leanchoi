-- =============================================================================
--  ESQUEL 2027 — SEED: zonas de disputa territorial
--  GENERADO AUTOMÁTICAMENTE por tools/ci/gen-seeds.ts — NO EDITAR A MANO.
--  Fuente de verdad: /shared/constants/
-- =============================================================================
SET NAMES utf8mb4;

INSERT INTO `zonas_territorio`
  (`id`, `nombre`, `barrio`, `celdas`, `centro_x`, `centro_z`, `radio_m`, `peso`)
VALUES
  ('zone:plaza-san-martin', 'Plaza San Martín', 'centro', '[{"col":0,"row":0}]', 0.000, 0.000, 45, 3.00),
  ('zone:alvear-25mayo', 'Alvear y 25 de Mayo', 'centro', '[{"col":1,"row":0},{"col":1,"row":1}]', 120.000, 60.000, 45, 2.40),
  ('zone:san-martin-fontana', 'San Martín y Fontana', 'centro', '[{"col":-1,"row":1}]', -120.000, 120.000, 45, 2.20),
  ('zone:la-trochita', 'Estación La Trochita', 'estacion', '[{"col":-3,"row":2}]', -360.000, 240.000, 45, 2.40),
  ('zone:municipalidad', 'Frente Municipal', 'centro', '[{"col":0,"row":1}]', 0.000, 120.000, 45, 2.60),
  ('zone:ceferino-cancha', 'Cancha de Ceferino', 'ceferino', '[{"col":-6,"row":-6}]', -720.000, -720.000, 45, 1.60),
  ('zone:baden-feria', 'Feria del Badén', 'badenes', '[{"col":-6,"row":0}]', -720.000, 0.000, 45, 1.50),
  ('zone:terminal', 'Terminal', 'centro', '[{"col":2,"row":-3}]', 240.000, -360.000, 45, 1.80)
ON DUPLICATE KEY UPDATE
  `nombre` = VALUES(`nombre`), `barrio` = VALUES(`barrio`), `celdas` = VALUES(`celdas`),
  `centro_x` = VALUES(`centro_x`), `centro_z` = VALUES(`centro_z`), `peso` = VALUES(`peso`);
