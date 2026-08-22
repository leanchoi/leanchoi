-- =============================================================================
--  ESQUEL 2027 — SEED: comercios auspiciados
--  GENERADO AUTOMÁTICAMENTE por tools/ci/gen-seeds.ts — NO EDITAR A MANO.
--  Fuente de verdad: /shared/constants/
-- =============================================================================
SET NAMES utf8mb4;

-- Arquetipos, no comercios identificados. Un comercio real entra sólo con
-- contrato firmado y consentimiento de uso de nombre, marca y fachada.

INSERT INTO `comercios_patrocinados`
  (`id`, `slug`, `razon_social`, `nombre_fantasia`, `rubro`, `calle`, `altura`, `barrio`,
   `marquesina_texto`, `marquesina_color`, `marquesina_alto_m`, `radio_impresion_m`,
   `buff_slug`, `buff_config`, `plan`, `estado`, `apertura_minuto`, `cierre_minuto`,
   `dias_apertura`, `monto_mensual_centavos`)
VALUES
  (1, 'chocolateria_del_centro', 'Chocolatería del Centro (arquetipo)', 'Chocolatería del Centro', 'chocolateria', 'san_martin', 450, 'centro', 'CHOCOLATES', '#6b3a1f', 1.20, 15, 'chocolate_artesanal', '{"label":"Chocolate artesanal","kind":"labia","description":"Azúcar y cacao: la labia rinde el doble en el próximo duelo.","magnitude":2,"durationSeconds":600,"priceCentavos":3500}', 'basico', 'activo', 540, 1260, 127, 0),
  (2, 'cafe_de_la_estacion', 'Café de la Estación (arquetipo)', 'Café de la Estación', 'cafeteria', 'roggero', 100, 'estacion', 'CAFE', '#3f2a1c', 1.20, 15, 'cafe_caliente', '{"label":"Café caliente","kind":"velocidad","description":"Treinta y cinco por ciento más de paso durante cinco minutos.","magnitude":1.35,"durationSeconds":300,"priceCentavos":1800}', 'basico', 'activo', 420, 1200, 127, 0),
  (3, 'indumentaria_cordillerana', 'Indumentaria Cordillerana (arquetipo)', 'Indumentaria Cordillerana', 'indumentaria', 'av_alvear', 900, 'centro', 'ABRIGO', '#2f4a6d', 1.20, 15, 'campera_termica', '{"label":"Campera térmica","kind":"abrigo","description":"La nieve deja de frenarte: caminás como si estuviera despejado.","magnitude":1,"durationSeconds":900,"priceCentavos":12000}', 'basico', 'activo', 600, 1230, 127, 0)
ON DUPLICATE KEY UPDATE
  `nombre_fantasia` = VALUES(`nombre_fantasia`), `rubro` = VALUES(`rubro`),
  `calle` = VALUES(`calle`), `altura` = VALUES(`altura`), `barrio` = VALUES(`barrio`),
  `marquesina_texto` = VALUES(`marquesina_texto`), `marquesina_color` = VALUES(`marquesina_color`),
  `radio_impresion_m` = VALUES(`radio_impresion_m`),
  `buff_slug` = VALUES(`buff_slug`), `buff_config` = VALUES(`buff_config`),
  `apertura_minuto` = VALUES(`apertura_minuto`), `cierre_minuto` = VALUES(`cierre_minuto`);
