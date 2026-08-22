-- =============================================================================
--  ESQUEL 2027 — SEED: zonas de disputa territorial
--  GENERADO AUTOMÁTICAMENTE por tools/ci/gen-seeds.ts — NO EDITAR A MANO.
--  Fuente de verdad: /shared/constants/
-- =============================================================================
SET NAMES utf8mb4;

INSERT INTO `zonas_territorio`
  (`id`, `nombre`, `barrio`, `celdas`, `centro_x`, `centro_z`, `radio_m`, `peso`)
VALUES
  ('zone:plaza-san-martin', 'Plaza San Martín', 'centro', '[{"col":0,"row":0}]', 0.000, 0.000, 55, 3.00),
  ('zone:explanada-municipalidad', 'Explanada de la Municipalidad', 'centro', '[{"col":-1,"row":0},{"col":0,"row":0}]', -62.000, 0.000, 42, 2.60),
  ('zone:estacion-la-trochita', 'Estación La Trochita', 'estacion', '[{"col":-3,"row":2},{"col":-4,"row":2}]', -400.000, 292.000, 48, 2.40),
  ('zone:alvear-y-25', 'Alvear y 25 de Mayo', 'centro', '[{"col":0,"row":0},{"col":0,"row":-1},{"col":1,"row":0},{"col":1,"row":-1}]', 60.000, -60.000, 38, 2.80),
  ('zone:acceso-la-zeta-baden', 'Acceso La Zeta — Badén', 'badenes', '[{"col":-6,"row":0},{"col":-6,"row":1}]', -720.000, 60.000, 60, 2.00)
ON DUPLICATE KEY UPDATE
  `nombre` = VALUES(`nombre`), `barrio` = VALUES(`barrio`), `celdas` = VALUES(`celdas`),
  `centro_x` = VALUES(`centro_x`), `centro_z` = VALUES(`centro_z`),
  `radio_m` = VALUES(`radio_m`), `peso` = VALUES(`peso`);
