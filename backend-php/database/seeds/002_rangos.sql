-- =============================================================================
--  ESQUEL 2027 — SEED: rangos (árbol de carrera militante)
--  GENERADO AUTOMÁTICAMENTE por tools/ci/gen-seeds.ts — NO EDITAR A MANO.
--  Fuente de verdad: /shared/constants/
-- =============================================================================
SET NAMES utf8mb4;

INSERT INTO `rangos`
  (`nivel`, `slug`, `nombre`, `descripcion`, `xp_to_next`, `xp_total`, `reputacion_req`, `lealtad_req`,
   `xp_multiplicador`, `estipendio_centavos`, `peso_territorial`, `cupo_misiones`, `rareza_max`, `desbloqueos`)
VALUES
  (1, 'chopanero', 'Chopanero', 'Cargás las sillas, servís el choripán y aprendés quién es quién en la unidad básica.', 900, 0, 0, 0.000, 1.000, 0, 1.00, 8, 'comun', '["misiones_basicas","chat_local","inventario"]'),
  (2, 'soldado', 'Soldado', 'Pegás afiches de madrugada y ya te reconocen en dos esquinas del barrio.', 3225, 900, 30, 0.350, 1.060, 15000, 1.30, 10, 'comun', '["duelos_debate","mazo_personalizado","voz_espacial"]'),
  (3, 'puntero', 'Puntero', 'Manejás una cuadra, dos grupos de WhatsApp y la lista de los que van al acto.', 7275, 4125, 69, 0.400, 1.120, 21800, 1.60, 12, 'infrecuente', '["convocar_movilizacion","reclutar_militantes","misiones_grupales"]'),
  (4, 'mano_derecha', 'Mano Derecha', 'Le llevás el mate al jefe y, de paso, la agenda. Sabés cosas que no se escriben.', 13600, 11400, 112, 0.450, 1.180, 31500, 1.90, 12, 'infrecuente', '["acceso_archivo_historico","negociar_apoyos","chat_faccion"]'),
  (5, 'concejal', 'Concejal', 'Bancás una banca. Ahora te filman cuando dormís en sesión.', 22925, 25000, 158, 0.500, 1.240, 45700, 2.20, 14, 'rara', '["debates_en_concejo","presentar_proyectos","oficina_propia"]'),
  (6, 'director', 'Director', 'Dirección de algo. Nadie sabe bien de qué, pero tenés sello y camioneta.', 36200, 47925, 207, 0.550, 1.300, 66300, 2.50, 14, 'rara', '["asignar_recursos","contratar_npc","obras_menores"]'),
  (7, 'subsecretario', 'Subsecretario', 'Firmás expedientes que nadie lee y cortás cintas que nadie recuerda.', 54675, 84125, 258, 0.600, 1.360, 96100, 2.80, 16, 'epica', '["anuncios_publicos","sponsor_deals","movilizacion_ampliada"]'),
  (8, 'secretario', 'Secretario', 'Tenés área, presupuesto y enemigos internos. Los tres crecen juntos.', 79875, 138800, 310, 0.650, 1.420, 139400, 3.10, 16, 'epica', '["conferencia_prensa","vetar_mision_rival","caja_de_campania"]'),
  (9, 'viceministro', 'Viceministro', 'Viajás a Rawson una vez por semana y volvés hablando de "la provincia".', 113775, 218675, 364, 0.700, 1.480, 202100, 3.40, 18, 'mitica', '["alianzas_interfaccion","spot_televisivo","territorio_provincial"]'),
  (10, 'candidato_provincial', 'Candidato Provincial', 'Tu cara está en el afiche. Ya no pegás afiches: los mandás a pegar.', 0, 332450, 419, 0.750, 1.540, 293100, 3.70, 20, 'mitica', '["campania_provincial","debate_estelar","prestigio_reinicio"]')
ON DUPLICATE KEY UPDATE
  `nombre` = VALUES(`nombre`), `descripcion` = VALUES(`descripcion`), `xp_to_next` = VALUES(`xp_to_next`),
  `xp_total` = VALUES(`xp_total`), `reputacion_req` = VALUES(`reputacion_req`), `lealtad_req` = VALUES(`lealtad_req`),
  `xp_multiplicador` = VALUES(`xp_multiplicador`), `estipendio_centavos` = VALUES(`estipendio_centavos`),
  `peso_territorial` = VALUES(`peso_territorial`), `cupo_misiones` = VALUES(`cupo_misiones`),
  `rareza_max` = VALUES(`rareza_max`), `desbloqueos` = VALUES(`desbloqueos`);
