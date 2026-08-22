-- =============================================================================
--  ESQUEL 2027 — SEED: cartas de debate (24, seis familias)
--  GENERADO AUTOMÁTICAMENTE por server-vps/scripts/gen-catalog-seeds.ts.
--  NO EDITAR A MANO: se regenera con `npm run seeds --workspace server-vps`.
--  Fuente de verdad: /server-vps/src/debate/CardCatalog.ts
-- =============================================================================
SET NAMES utf8mb4;

INSERT INTO `cartas_debate`
  (`id`, `slug`, `nombre`, `flavor`, `familia`, `rareza`, `costo`, `poder`, `precision_base`,
   `backfire`, `efectos`, `rango_min`, `faccion_afinidad`, `cooldown`, `max_copias`, `icono`, `habilitada`)
VALUES
  (1, 'chicana_del_asado', 'Chicana del asado', 'Le recordás, delante de todos, que se fue del asado sin poner la plata.', 'chicana', 'comun', 2, 14, 0.920, 0.060, '[{"kind":"daño","value":14,"turns":0}]', 1, NULL, 0, 3, 'card_chicana_asado', 1),
  (2, 'apodo_del_barrio', 'El apodo del barrio', 'Todo el mundo sabe cómo le dicen. Vos lo decís al micrófono.', 'chicana', 'infrecuente', 3, 20, 0.880, 0.100, '[{"kind":"daño","value":20,"turns":0},{"kind":"favor_publico","value":0.04,"turns":0}]', 2, NULL, 1, 2, 'card_apodo', 1),
  (3, 'risa_incomoda', 'Risa incómoda', 'No contestás: te reís. Funciona más de lo que debería.', 'chicana', 'rara', 2, 11, 0.950, 0.040, '[{"kind":"daño","value":11,"turns":0},{"kind":"silenciar","value":1,"turns":1,"family":"CARPETAZO"}]', 3, 4, 2, 2, 'card_risa', 1),
  (4, 'te_vi_en_la_fila', 'Te vi en la fila', 'Hablás de austeridad y te vieron sacando pasaje en cuotas. Con la del Estado.', 'chicana', 'rara', 4, 26, 0.850, 0.120, '[{"kind":"daño","value":26,"turns":0}]', 4, NULL, 2, 2, 'card_fila', 1),
  (5, 'carpeta_del_2011', 'La carpeta del 2011', 'La hemeroteca no perdona: eso lo dijiste exactamente al revés hace dieciséis años.', 'carpetazo', 'infrecuente', 3, 22, 0.850, 0.100, '[{"kind":"daño_condicional","value":22,"turns":0}]', 2, NULL, 1, 3, 'card_carpeta', 1),
  (6, 'la_captura_guardada', 'La captura guardada', 'Lo borró del muro a los diez minutos. Alguien fue más rápido.', 'carpetazo', 'rara', 4, 22, 0.820, 0.140, '[{"kind":"daño_condicional","value":22,"turns":0},{"kind":"sangrado","value":2,"turns":2}]', 4, 3, 2, 2, 'card_captura', 1),
  (7, 'el_audio_que_circula', 'El audio que circula', 'Nadie sabe quién lo grabó, pero está en todos los grupos del pueblo.', 'carpetazo', 'epica', 5, 20, 0.760, 0.220, '[{"kind":"daño_condicional","value":20,"turns":0}]', 6, NULL, 3, 1, 'card_audio', 1),
  (8, 'la_declaracion_jurada', 'La declaración jurada', 'Leés en voz alta lo que declaró y lo que se le ve puesto. No coincide.', 'carpetazo', 'comun', 3, 18, 0.900, 0.080, '[{"kind":"daño_condicional","value":18,"turns":0},{"kind":"robar_labia","value":1,"turns":0}]', 3, NULL, 1, 3, 'card_ddjj', 1),
  (9, 'asfalto_para_todos', 'Asfalto para todos', 'Todas las calles, en dos años, sin subir un peso de tasas.', 'promesa_inviable', 'comun', 2, 16, 0.940, 0.050, '[{"kind":"curar","value":21,"turns":0},{"kind":"mentira","value":1,"turns":1}]', 1, 2, 1, 3, 'card_asfalto', 1),
  (10, 'el_polideportivo', 'El polideportivo nuevo', 'Con pileta climatizada, estacionamiento y, si se puede, helipuerto.', 'promesa_inviable', 'infrecuente', 3, 24, 0.900, 0.080, '[{"kind":"curar","value":24,"turns":0},{"kind":"mentira","value":1,"turns":1},{"kind":"favor_publico","value":0.06,"turns":0}]', 2, NULL, 2, 2, 'card_poli', 1),
  (11, 'tren_a_la_hoya', 'Tren a La Hoya', 'Un tren turístico que sube al cerro. Los números los vemos después.', 'promesa_inviable', 'rara', 4, 32, 0.860, 0.120, '[{"kind":"curar","value":32,"turns":0},{"kind":"mentira","value":1,"turns":1},{"kind":"escudo","value":0.2,"turns":1}]', 4, NULL, 3, 2, 'card_tren', 1),
  (12, 'sueldo_al_dia', 'Sueldos al día', 'El mes que viene se paga todo junto. Y con aumento.', 'promesa_inviable', 'comun', 2, 12, 0.950, 0.040, '[{"kind":"curar","value":16,"turns":0},{"kind":"mentira","value":1,"turns":1},{"kind":"ganar_labia","value":2,"turns":0}]', 1, NULL, 1, 3, 'card_sueldo', 1),
  (13, 'me_levanto_de_la_banca', 'Me levanto de la banca', 'Te parás, juntás los papeles y te vas. Sin número no hay sesión.', 'romper_quorum', 'comun', 2, 8, 0.930, 0.050, '[{"kind":"daño","value":8,"turns":0},{"kind":"bloquear_habilidad","value":1,"turns":1},{"kind":"silenciar","value":1,"turns":1,"family":"INVOCAR_AL_LIDER"}]', 2, NULL, 1, 3, 'card_banca', 1),
  (14, 'no_hay_numero', 'No hay número', 'Faltan dos y ninguno atiende el teléfono. Qué casualidad.', 'romper_quorum', 'infrecuente', 3, 12, 0.900, 0.060, '[{"kind":"daño","value":12,"turns":0},{"kind":"bloquear_habilidad","value":1,"turns":1},{"kind":"silenciar","value":1,"turns":2,"family":"CARPETAZO"}]', 5, NULL, 2, 2, 'card_numero', 1),
  (15, 'cuestion_de_privilegio', 'Cuestión de privilegio', 'Interrumpís por reglamento y hablás cinco minutos de otra cosa.', 'romper_quorum', 'rara', 3, 10, 0.920, 0.050, '[{"kind":"daño","value":10,"turns":0},{"kind":"bloquear_habilidad","value":1,"turns":1},{"kind":"escudo","value":0.25,"turns":2}]', 5, 5, 2, 2, 'card_privilegio', 1),
  (16, 'pido_la_palabra', 'Pido la palabra', 'La pedís, la tomás y no la soltás más.', 'romper_quorum', 'comun', 1, 5, 0.970, 0.020, '[{"kind":"daño","value":5,"turns":0},{"kind":"silenciar","value":1,"turns":1,"family":"CHICANA"},{"kind":"ganar_labia","value":1,"turns":0}]', 1, NULL, 1, 3, 'card_palabra', 1),
  (17, 'licitacion_amiga', 'Licitación amiga', 'Se presentaron tres empresas y las tres eran del mismo galpón.', 'chanchullo', 'comun', 2, 10, 0.900, 0.100, '[{"kind":"daño","value":10,"turns":0},{"kind":"robar_labia","value":2,"turns":0}]', 3, NULL, 1, 3, 'card_licitacion', 1),
  (18, 'pase_a_planta', 'Pase a planta', 'Diciembre, último día hábil, cuarenta expedientes y un sello cansado.', 'chanchullo', 'infrecuente', 3, 14, 0.870, 0.140, '[{"kind":"daño","value":14,"turns":0},{"kind":"robar_labia","value":3,"turns":0}]', 5, NULL, 2, 2, 'card_planta', 1),
  (19, 'la_camioneta_oficial', 'La camioneta oficial', 'Aparece los fines de semana a doscientos kilómetros. Con caña de pescar.', 'chanchullo', 'rara', 4, 18, 0.830, 0.200, '[{"kind":"daño","value":18,"turns":0},{"kind":"robar_labia","value":3,"turns":0}]', 6, 4, 2, 2, 'card_camioneta', 1),
  (20, 'sobreprecio_en_la_obra', 'Sobreprecio en la obra', 'La misma vereda, tres veces el precio, dos veces por año.', 'chanchullo', 'infrecuente', 3, 12, 0.880, 0.120, '[{"kind":"daño","value":10,"turns":0},{"kind":"robar_labia","value":2,"turns":0},{"kind":"sangrado","value":2,"turns":2}]', 4, NULL, 2, 2, 'card_sobreprecio', 1),
  (21, 'la_foto_con_el_jefe', 'La foto con el jefe', 'Cuando no tenés argumento, tenés una foto. Y la mostrás.', 'invocar_al_lider', 'comun', 3, 20, 0.880, 0.100, '[{"kind":"daño","value":20,"turns":0}]', 2, NULL, 1, 3, 'card_foto', 1),
  (22, 'bajaron_linea', 'Bajaron línea', 'Llamaron de arriba. El tema se cierra acá.', 'invocar_al_lider', 'rara', 4, 26, 0.850, 0.120, '[{"kind":"daño","value":26,"turns":0},{"kind":"silenciar","value":1,"turns":1,"family":"PROMESA_INVIABLE"}]', 5, NULL, 2, 2, 'card_linea', 1),
  (23, 'el_dedo_del_dedo', 'El dedo del dedo', 'No te eligieron a vos, pero te señalaron. Con eso alcanza.', 'invocar_al_lider', 'epica', 5, 27, 0.800, 0.150, '[{"kind":"daño","value":27,"turns":0}]', 7, NULL, 3, 1, 'card_dedo', 1),
  (24, 'vino_el_ministro', 'Vino el ministro', 'Bajó del auto, cortó la cinta, sacó la foto y se volvió a Rawson.', 'invocar_al_lider', 'infrecuente', 4, 17, 0.860, 0.100, '[{"kind":"daño","value":17,"turns":0},{"kind":"favor_publico","value":0.05,"turns":0}]', 4, 2, 2, 2, 'card_ministro', 1)
ON DUPLICATE KEY UPDATE
  `nombre` = VALUES(`nombre`), `flavor` = VALUES(`flavor`), `familia` = VALUES(`familia`),
  `rareza` = VALUES(`rareza`), `costo` = VALUES(`costo`), `poder` = VALUES(`poder`),
  `precision_base` = VALUES(`precision_base`), `backfire` = VALUES(`backfire`),
  `efectos` = VALUES(`efectos`), `rango_min` = VALUES(`rango_min`),
  `faccion_afinidad` = VALUES(`faccion_afinidad`), `cooldown` = VALUES(`cooldown`),
  `max_copias` = VALUES(`max_copias`), `icono` = VALUES(`icono`), `habilitada` = VALUES(`habilitada`);
