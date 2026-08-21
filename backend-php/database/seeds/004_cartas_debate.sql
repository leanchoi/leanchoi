-- =============================================================================
--  ESQUEL 2027 — SEED: cartas de debate
--  Rueda de familias en /shared/types/debate.ts (DEBATE_COUNTERS).
--  Balance: poder × (1 + retórica/25) × contra × afinidad × defensa del público.
--  POLÍTICA EDITORIAL: la sátira apunta a prácticas y a cargos ficticios,
--  nunca a personas reales identificables.
-- =============================================================================
SET NAMES utf8mb4;

INSERT INTO `cartas_debate`
  (`id`, `slug`, `nombre`, `flavor`, `familia`, `rareza`, `costo`, `poder`, `precision_base`, `backfire`, `efectos`, `rango_min`, `faccion_afinidad`, `cooldown`, `max_copias`, `icono`, `habilitada`)
VALUES
  -- CHICANA -------------------------------------------------------------------
  (1,  'chicana_del_asado',    'Chicana del asado',      'Le recordás, en público, que se fue del asado sin poner la plata.', 'chicana', 'comun', 2, 18, 0.900, 0.080, NULL, 1, NULL, 0, 3, 'card_chicana_asado', 1),
  (2,  'apodo_del_barrio',     'El apodo del barrio',    'Todo el mundo sabe cómo le dicen. Vos lo decís al aire.',            'chicana', 'infrecuente', 3, 26, 0.850, 0.120, '[{"kind":"robar_publico","value":0.08,"turns":0}]', 2, NULL, 1, 2, 'card_apodo', 1),
  (3,  'risa_incomoda',        'Risa incómoda',          'No respondés: te reís. Funciona más de lo que debería.',             'chicana', 'rara', 2, 14, 0.950, 0.050, '[{"kind":"silenciar","value":1,"turns":1,"family":"dato_duro"}]', 3, 4, 2, 2, 'card_risa', 1),
  -- ARCHIVO HISTÓRICO ---------------------------------------------------------
  (4,  'archivo_2011',         'Archivo 2011',           'La hemeroteca no perdona: eso lo dijiste al revés hace 16 años.',    'archivo_historico', 'infrecuente', 3, 30, 0.820, 0.100, NULL, 2, NULL, 1, 3, 'card_archivo', 1),
  (5,  'la_captura_guardada',  'La captura guardada',    'Lo borró del muro, pero alguien la guardó.',                         'archivo_historico', 'rara', 4, 38, 0.800, 0.140, '[{"kind":"sangrado","value":4,"turns":2}]', 4, 3, 2, 2, 'card_captura', 1),
  (6,  'la_promesa_del_2019',  'La promesa del 2019',    'La obra se inauguró tres veces. Sigue sin terminarse.',              'archivo_historico', 'epica', 4, 44, 0.780, 0.160, '[{"kind":"desmentir","value":1,"turns":0}]', 6, NULL, 3, 1, 'card_promesa19', 1),
  -- PROMESA INVIABLE ----------------------------------------------------------
  (7,  'asfalto_para_todos',   'Asfalto para todos',     'Todas las calles, en dos años, sin subir un peso de tasas.',         'promesa_inviable', 'comun', 2, 20, 0.880, 0.100, NULL, 1, 2, 0, 3, 'card_asfalto', 1),
  (8,  'el_polideportivo',     'El polideportivo nuevo', 'Con pileta climatizada. Y estacionamiento. Y un helipuerto.',        'promesa_inviable', 'infrecuente', 3, 28, 0.850, 0.150, '[{"kind":"inspirar","value":4,"turns":2}]', 2, NULL, 1, 3, 'card_poli', 1),
  (9,  'tren_a_la_hoya',       'Tren a La Hoya',         'Un tren turístico que sube al cerro. Los números después.',          'promesa_inviable', 'rara', 4, 36, 0.800, 0.200, '[{"kind":"robar_publico","value":0.12,"turns":0}]', 4, 3, 2, 2, 'card_tren', 1),
  -- CHANCHULLO ----------------------------------------------------------------
  (10, 'licitacion_amiga',     'Licitación amiga',       'Se presentaron tres empresas. Las tres del mismo galpón.',           'chanchullo', 'infrecuente', 3, 32, 0.800, 0.180, NULL, 3, NULL, 1, 2, 'card_licitacion', 1),
  (11, 'planta_permanente',    'Pase a planta',          'Diciembre, último día hábil, cuarenta expedientes.',                 'chanchullo', 'rara', 4, 40, 0.760, 0.220, '[{"kind":"sangrado","value":5,"turns":2}]', 5, NULL, 2, 2, 'card_planta', 1),
  (12, 'la_camioneta_oficial', 'La camioneta oficial',   'Aparece los fines de semana a 200 km de la ciudad.',                 'chanchullo', 'epica', 5, 50, 0.740, 0.260, '[{"kind":"robar_argumento","value":2,"turns":0}]', 7, 4, 3, 1, 'card_camioneta', 1),
  -- INVOCAR AL LÍDER ----------------------------------------------------------
  (13, 'invocar_al_lider',     'Invocar al líder',       'Cuando no tenés argumento, tenés una foto con el jefe.',             'invocar_al_lider', 'comun', 2, 22, 0.870, 0.120, NULL, 2, NULL, 1, 3, 'card_lider', 1),
  (14, 'la_foto_en_rawson',    'La foto en Rawson',      'Provincia mandó los fondos. La foto lo demuestra.',                  'invocar_al_lider', 'rara', 3, 34, 0.830, 0.140, '[{"kind":"escudo","value":0.3,"turns":2}]', 5, 2, 2, 2, 'card_rawson', 1),
  (15, 'el_dedo_del_dedo',     'El dedo del dedo',       'No te eligieron a vos, pero te señalaron. Alcanza.',                 'invocar_al_lider', 'epica', 4, 46, 0.790, 0.180, '[{"kind":"inspirar","value":8,"turns":3}]', 8, NULL, 3, 1, 'card_dedo', 1),
  -- DATO DURO -----------------------------------------------------------------
  (16, 'la_planilla',          'La planilla',            'Traés el Excel impreso. Nadie lo lee, pero pesa.',                   'dato_duro', 'comun', 2, 19, 0.920, 0.040, NULL, 1, 1, 0, 3, 'card_planilla', 1),
  (17, 'el_censo_vecinal',     'El censo vecinal',       'Cuatrocientas puertas golpeadas, barrio por barrio.',                'dato_duro', 'infrecuente', 3, 29, 0.900, 0.060, '[{"kind":"desmentir","value":1,"turns":0}]', 3, 5, 1, 3, 'card_censo', 1),
  (18, 'informe_del_agua',     'Informe del agua',       'El análisis de la toma, firmado y con fecha.',                       'dato_duro', 'rara', 4, 38, 0.880, 0.070, '[{"kind":"escudo","value":0.25,"turns":2}]', 5, 5, 2, 2, 'card_agua', 1),
  -- EMPATÍA VECINAL -----------------------------------------------------------
  (19, 'la_vecina_de_ceferino','La vecina de Ceferino',  'Contás su historia con nombre, apellido y bidón de agua.',           'empatia_vecinal', 'comun', 2, 17, 0.930, 0.030, '[{"kind":"robar_publico","value":0.06,"turns":0}]', 1, 1, 0, 3, 'card_vecina', 1),
  (20, 'la_estufa_prendida',   'La estufa prendida',     'Julio, -8°C, y una boleta de gas que no cierra.',                    'empatia_vecinal', 'infrecuente', 3, 25, 0.910, 0.050, '[{"kind":"escudo","value":0.2,"turns":2}]', 2, NULL, 1, 3, 'card_estufa', 1),
  (21, 'el_micro_de_las_6',    'El micro de las 6',      'Los que trabajan del otro lado del puente te escuchan.',             'empatia_vecinal', 'rara', 3, 33, 0.890, 0.060, '[{"kind":"inspirar","value":6,"turns":2}]', 4, 1, 2, 2, 'card_micro', 1),
  -- DEFENSA -------------------------------------------------------------------
  (22, 'no_me_consta',         'No me consta',           'Elegante, aburrido y sorprendentemente eficaz.',                     'defensa', 'comun', 1, 8, 0.980, 0.020, '[{"kind":"escudo","value":0.35,"turns":1}]', 1, NULL, 0, 3, 'card_nomeconsta', 1),
  (23, 'el_expediente_dice',   'El expediente dice',     'Leés en voz alta el párrafo que te conviene.',                       'defensa', 'infrecuente', 2, 12, 0.960, 0.030, '[{"kind":"reflejar","value":0.3,"turns":1}]', 3, NULL, 1, 3, 'card_expediente', 1),
  (24, 'cambio_de_tema',       'Cambio de tema',         'Hablabas de la basura. Ahora hablás de la Nación.',                  'defensa', 'rara', 2, 10, 0.970, 0.040, '[{"kind":"silenciar","value":1,"turns":1,"family":"chanchullo"}]', 4, 4, 2, 2, 'card_cambiotema', 1)
ON DUPLICATE KEY UPDATE
  `nombre` = VALUES(`nombre`), `flavor` = VALUES(`flavor`), `familia` = VALUES(`familia`),
  `rareza` = VALUES(`rareza`), `costo` = VALUES(`costo`), `poder` = VALUES(`poder`),
  `precision_base` = VALUES(`precision_base`), `backfire` = VALUES(`backfire`), `efectos` = VALUES(`efectos`),
  `rango_min` = VALUES(`rango_min`), `cooldown` = VALUES(`cooldown`), `max_copias` = VALUES(`max_copias`);
