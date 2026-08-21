-- =============================================================================
--  ESQUEL 2027 — SEED: facciones
--  GENERADO AUTOMÁTICAMENTE por tools/ci/gen-seeds.ts — NO EDITAR A MANO.
--  Fuente de verdad: /shared/constants/
-- =============================================================================
SET NAMES utf8mb4;

INSERT INTO `facciones`
  (`id`, `slug`, `nombre`, `nombre_corto`, `lema`, `color_primario`, `color_secundario`, `perks`, `afinidad`, `bastiones`, `activa`)
VALUES
  (1, 'frente_vecinal_cordillerano', 'Frente Vecinal Cordillerano', 'FVC', 'La montaña primero, el asfalto después.', '#1F6F4A', '#E7D8A1', '{"questXp":1.05,"debateRhetoric":1,"debateCredibility":1.08,"territoryHold":1.1,"stipend":0.95}', '["empatia_vecinal","dato_duro"]', '["ceferino","badenes"]', 1),
  (2, 'union_del_valle', 'Unión del Valle', 'UdV', 'Gestión, orden y una rotonda nueva.', '#1B4F9C', '#FFFFFF', '{"questXp":1,"debateRhetoric":1.08,"debateCredibility":1,"territoryHold":1.05,"stipend":1.1}', '["promesa_inviable","invocar_al_lider"]', '["centro","bella_vista"]', 1),
  (3, 'movimiento_trochita', 'Movimiento La Trochita', 'MLT', 'Lento, pero llega.', '#8C2F1D', '#F2B441', '{"questXp":1.12,"debateRhetoric":1,"debateCredibility":0.98,"territoryHold":1,"stipend":1}', '["archivo_historico","chicana"]', '["estacion","don_bosco"]', 1),
  (4, 'partido_del_viento', 'Partido del Viento', 'PdV', 'Menos oficinas, más motosierra... eléctrica.', '#5B2E90', '#D7C7F2', '{"questXp":1,"debateRhetoric":1.12,"debateCredibility":0.95,"territoryHold":0.95,"stipend":1.15}', '["chicana","promesa_inviable"]', '["alta_esquel","plan_1000"]', 1),
  (5, 'asamblea_del_agua', 'Asamblea del Agua', 'AdA', 'El agua no se negocia.', '#0E7C86', '#BFF0F2', '{"questXp":1.08,"debateRhetoric":1,"debateCredibility":1.12,"territoryHold":1.08,"stipend":0.85}', '["dato_duro","defensa"]', '["zona_norte","valle_chico"]', 1)
ON DUPLICATE KEY UPDATE
  `nombre` = VALUES(`nombre`), `nombre_corto` = VALUES(`nombre_corto`), `lema` = VALUES(`lema`),
  `color_primario` = VALUES(`color_primario`), `color_secundario` = VALUES(`color_secundario`),
  `perks` = VALUES(`perks`), `afinidad` = VALUES(`afinidad`), `bastiones` = VALUES(`bastiones`);
