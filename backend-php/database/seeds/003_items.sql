-- =============================================================================
--  ESQUEL 2027 — SEED: catálogo de ítems
--  Curado a mano. Los efectos siguen el contrato `ActiveBuff.modifiers`.
-- =============================================================================
SET NAMES utf8mb4;

INSERT INTO `items_catalogo`
  (`id`, `slug`, `nombre`, `descripcion`, `tipo`, `rareza`, `apilable`, `max_pila`, `precio_centavos`, `slot`, `durabilidad_max`, `rango_min`, `efectos`, `icono`, `habilitado`)
VALUES
  (1,  'afiche_campania',   'Afiche de campaña',      'Papel, cara del candidato y una promesa en letra grande.',              'consumible',  'comun',       1, 99,  1200,  'ninguno', 0,  1, NULL, 'item_afiche', 1),
  (2,  'balde_engrudo',     'Balde de engrudo',       'Harina, agua y paciencia. Pega afiches y también los dedos.',           'herramienta', 'comun',       0, 1,   9000,  'mano',    50, 1, '{"questSpeed":1.15}', 'item_engrudo', 1),
  (3,  'volante',           'Volante',                'Se reparte en la esquina y termina en el piso a media cuadra.',         'consumible',  'comun',       1, 99,  600,   'ninguno', 0,  1, NULL, 'item_volante', 1),
  (4,  'mate_cebado',       'Mate cebado',            'El arma social más poderosa de la Patagonia.',                          'consumible',  'comun',       1, 20,  3500,  'mano',    0,  1, '{"staminaRegen":1.25,"repGain":1.1}', 'item_mate', 1),
  (5,  'termo_agua',        'Termo con agua caliente','Dura una ronda entera si nadie se pasa de vueltas.',                    'herramienta', 'infrecuente', 0, 1,   28000, 'espalda', 30, 2, '{"staminaRegen":1.1}', 'item_termo', 1),
  (6,  'bombo',             'Bombo',                  'No se toca: se hace sentir.',                                            'herramienta', 'infrecuente', 0, 1,   45000, 'espalda', 80, 3, '{"moveSpeed":0.95}', 'item_bombo', 1),
  (7,  'megafono',          'Megáfono',               'Amplía tu voz y tu ego en la misma proporción.',                        'herramienta', 'rara',        0, 1,   120000,'mano',    60, 3, '{"voiceRange":2.7}', 'item_megafono', 1),
  (8,  'aerosol',           'Aerosol',                'Para tapar lo que dijo el otro. O lo que dijiste vos.',                 'consumible',  'infrecuente', 1, 12,  8000,  'mano',    20, 3, '{"questSpeed":1.2}', 'item_aerosol', 1),
  (9,  'celular_viejo',     'Celular viejo',          'Saca fotos borrosas de baches con una dignidad conmovedora.',           'herramienta', 'comun',       0, 1,   15000, 'mano',    0,  1, NULL, 'item_celular', 1),
  (10, 'planilla_censo',    'Planilla de censo',      'Doce preguntas y una birome que no anda.',                              'herramienta', 'comun',       0, 1,   2000,  'mano',    40, 1, NULL, 'item_planilla', 1),
  (11, 'pechera_faccion',   'Pechera de facción',     'Te identifica a 50 metros. Para bien y para mal.',                      'cosmetico',   'comun',       0, 1,   0,     'torso',   0,  1, '{"repGain":1.05}', 'item_pechera', 1),
  (12, 'gorro_lana',        'Gorro de lana',          'Tejido en la feria. Aguanta el viento del oeste.',                      'cosmetico',   'comun',       0, 1,   18000, 'cabeza',  0,  1, '{"staminaRegen":1.05}', 'item_gorro', 1),
  (13, 'cafe_de_especialidad','Café de especialidad', 'Cortado en jarrito. Buff cortesía de un comercio patrocinante.',        'consumible',  'infrecuente', 1, 10,  9500,  'ninguno', 0,  1, '{"debateRhetoric":1.12,"staminaRegen":1.2}', 'item_cafe', 1),
  (14, 'chocolate_artesanal','Chocolate artesanal',   'Setenta por ciento cacao, cien por ciento estrategia.',                 'consumible',  'infrecuente', 1, 10,  14000, 'ninguno', 0,  1, '{"debateCredibility":1.1,"xpGain":1.08}', 'item_chocolate', 1),
  (15, 'lenia',             'Leña',                   'La ayuda que se agradece de verdad cuando baja la nieve.',              'consumible',  'comun',       1, 50,  4000,  'espalda', 0,  1, NULL, 'item_lenia', 1),
  (16, 'credencial_concejo','Credencial del Concejo', 'Abre puertas, ascensores y algunos expedientes.',                       'documento',   'rara',        0, 1,   0,     'ninguno', 0,  5, '{"debateCredibility":1.15}', 'item_credencial', 1),
  (17, 'archivo_carpeta',   'Carpeta con el archivo', 'Recortes, capturas y una foto de 2011 que no envejeció bien.',          'documento',   'epica',       0, 1,   0,     'mano',    0,  4, '{"debateRhetoric":1.2}', 'item_carpeta', 1),
  (18, 'insignia_militante','Insignia de militante',  'Se gana caminando, no comprando.',                                      'insignia',    'rara',        0, 1,   0,     'ninguno', 0,  2, '{"repGain":1.12}', 'item_insignia', 1)
ON DUPLICATE KEY UPDATE
  `nombre` = VALUES(`nombre`), `descripcion` = VALUES(`descripcion`), `tipo` = VALUES(`tipo`),
  `rareza` = VALUES(`rareza`), `precio_centavos` = VALUES(`precio_centavos`), `efectos` = VALUES(`efectos`),
  `slot` = VALUES(`slot`), `durabilidad_max` = VALUES(`durabilidad_max`), `rango_min` = VALUES(`rango_min`);
