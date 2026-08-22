-- =============================================================================
--  ESQUEL 2027 — SEED: catálogo de misiones (10 tipologías Live-Ops)
--  GENERADO AUTOMÁTICAMENTE por server-vps/scripts/gen-catalog-seeds.ts.
--  NO EDITAR A MANO: se regenera con `npm run seeds --workspace server-vps`.
--  Fuente de verdad: /server-vps/src/quests/catalog/
-- =============================================================================
SET NAMES utf8mb4;

-- `objetivos` es una instancia de referencia (dificultad 0,5, tarde despejada):
-- el servidor arma los objetivos reales al spawnear, con el contexto del momento.
-- `recompensas_base` sale de QUEST_BASELINES en /shared/constants/balance.ts.

INSERT INTO `misiones_catalogo`
  (`id`, `slug`, `tipo`, `titulo`, `descripcion`, `objetivos`, `requisitos`, `recompensas_base`,
   `duracion_s`, `grupal`, `disputada`, `item_requerido`, `rango_min`, `cupo`, `exterior`,
   `peso_seleccion`, `habilitada`)
VALUES
  (1, 'pegatina_relampago', 'pegatina_relampago', 'Pegatina relámpago',
   'El comité mandó afiches nuevos y hay que dejarlos pegados antes de que se entere la competencia.',
   '[{"id":"pegar","kind":"pegar","label":"Pegá 15 afiches en la manzana","target":15,"position":{"x":0,"y":0,"z":0},"radiusM":55,"optional":false,"weight":0.85},{"id":"sin_testigos","kind":"evitar","label":"Que no te vea ningún militante rival","target":1,"optional":true,"weight":0.15}]',
   '{"minRank":2,"requiredItem":"engrudo_y_rodillo"}',
   '{"xp":210,"reputation":4,"money":4500,"items":[],"territoryScore":10,"factionTreasury":675}',
   300, 0, 1, 'engrudo_y_rodillo', 2, 0, 1, 1.000, 1),
  (2, 'banderazo_callejero', 'banderazo_callejero', 'Banderazo callejero',
   'Hay que llenar la esquina de bombos y banderas. Cinco militantes, y que se escuche.',
   '[{"id":"concentrar","kind":"concentrar","label":"Juntá 7 militantes en la esquina","target":7,"position":{"x":0,"y":0,"z":0},"radiusM":55,"optional":false,"weight":0.6},{"id":"aguantar","kind":"permanecer","label":"Aguantá la esquina 3 minutos","target":180,"position":{"x":0,"y":0,"z":0},"radiusM":55,"optional":false,"weight":0.4}]',
   '{"minRank":3,"requiredItem":"megafono"}',
   '{"xp":380,"reputation":12,"money":6000,"items":[],"territoryScore":28,"factionTreasury":900}',
   480, 1, 1, 'megafono', 3, 40, 1, 1.000, 1),
  (3, 'operacion_desmentida', 'operacion_desmentida', 'Operación desmentida',
   'Se armó un quilombo mediático. Salí a discutir al Centro y no vuelvas sin tres victorias.',
   '[{"id":"duelos","kind":"ganar_duelo","label":"Ganá 3 duelos de chicanas en el Centro","target":3,"position":{"x":0,"y":0,"z":0},"radiusM":240,"optional":false,"weight":1}]',
   '{"minRank":3}',
   '{"xp":420,"reputation":14,"money":7000,"items":[],"territoryScore":16,"factionTreasury":1050}',
   900, 0, 1, NULL, 3, 0, 1, 1.000, 1),
  (4, 'reparto_barrial', 'reparto_barrial', 'Reparto barrial',
   'Cargá los bolsones en el depósito y llevalos a Ceferino. Ojo con el barro de la entrada.',
   '[{"id":"cargar","kind":"transportar","label":"Cargá los bolsones en el depósito central","target":8,"position":{"x":-40,"y":0,"z":-120},"radiusM":25,"optional":false,"weight":0.3,"order":1},{"id":"entregar","kind":"entregar","label":"Entregá los bolsones en Ceferino","target":8,"position":{"x":-720,"y":0,"z":-720},"radiusM":100,"optional":false,"weight":0.7,"order":2}]',
   '{"minRank":4,"requiredItem":"camioneta_bloques"}',
   '{"xp":300,"reputation":16,"money":5200,"items":[],"territoryScore":12,"factionTreasury":780}',
   600, 0, 0, 'camioneta_bloques', 4, 0, 1, 1.000, 1),
  (5, 'caravana_de_bloques', 'caravana_de_bloques', 'Caravana de bloques',
   'Seis puntos de la ciudad, bocina y bandera, sin bajarse de la camioneta. El que se baja, no cuenta.',
   '[{"id":"checkpoint_1","kind":"checkpoint","label":"Pasá por Plaza San Martín","target":1,"position":{"x":0,"y":0,"z":0},"radiusM":70,"optional":false,"weight":0.16666666666666666,"order":1},{"id":"checkpoint_6","kind":"checkpoint","label":"Cerrá la caravana en la Plaza San Martín","target":1,"position":{"x":0,"y":0,"z":0},"radiusM":60,"optional":false,"weight":0.16666666666666666,"order":6}]',
   '{"minRank":4,"requiredItem":"camioneta_bloques"}',
   '{"xp":360,"reputation":10,"money":6500,"items":[],"territoryScore":20,"factionTreasury":975}',
   540, 1, 0, 'camioneta_bloques', 4, 20, 1, 1.000, 1),
  (6, 'corte_de_cinta', 'corte_de_cinta', 'Corte de cinta',
   'La obra está al 90% desde hace dos años. Terminala y cortá la cinta antes de que la inaugure la oposición.',
   '[{"id":"obra","kind":"inaugurar","label":"Poné los 13 bloques que faltan","target":13,"position":{"x":0,"y":0,"z":0},"radiusM":55,"optional":false,"weight":0.7},{"id":"cinta","kind":"inaugurar","label":"Cortá la cinta con la prensa presente","target":1,"position":{"x":0,"y":0,"z":0},"radiusM":20,"optional":false,"weight":0.3,"order":2}]',
   '{"minRank":6,"requiredItem":"sello_de_area"}',
   '{"xp":400,"reputation":15,"money":9000,"items":[],"territoryScore":22,"factionTreasury":1350}',
   720, 1, 1, 'sello_de_area', 6, 25, 1, 1.000, 1),
  (7, 'temporal_cordillerano', 'temporal_cordillerano', 'Temporal cordillerano',
   'Bajó la helada y el viento no afloja. En Plan 1000 necesitan una mano con los accesos y la leña.',
   '[{"id":"lenia","kind":"entregar","label":"Repartí 22 cargas de leña","target":22,"position":{"x":720,"y":0,"z":-720},"radiusM":120,"optional":false,"weight":0.55},{"id":"despejar","kind":"despejar","label":"Despejá 7 veredas","target":7,"position":{"x":720,"y":0,"z":-720},"radiusM":120,"optional":false,"weight":0.45}]',
   '{"minRank":1}',
   '{"xp":450,"reputation":22,"money":7000,"items":[],"territoryScore":12,"factionTreasury":1050}',
   600, 1, 0, NULL, 1, 50, 1, 1.000, 1),
  (8, 'guerra_de_punteros', 'guerra_de_punteros', 'Guerra de punteros',
   'El puntero del bando de enfrente se hizo fuerte en un comercio del barrio. Andá a discutirle la esquina.',
   '[{"id":"ganar","kind":"ganar_duelo","label":"Ganale 1 duelo(s) al puntero rival","target":1,"optional":false,"weight":1}]',
   '{"minRank":3}',
   '{"xp":340,"reputation":8,"money":5500,"items":[],"territoryScore":18,"factionTreasury":825}',
   420, 0, 1, NULL, 3, 0, 1, 1.000, 1),
  (9, 'conferencia_prensa', 'conferencia_prensa', 'Conferencia de prensa',
   'Cinco preguntas, cinco. Los periodistas ya saben dónde apretar; vos tratá de no bajar del 50% de credibilidad.',
   '[{"id":"preguntas","kind":"responder","label":"Contestá las 5 preguntas de la prensa","target":5,"position":{"x":-62,"y":0,"z":0},"radiusM":42,"optional":false,"weight":0.75},{"id":"credibilidad","kind":"evitar","label":"No bajes del 50% de credibilidad","target":1,"optional":false,"weight":0.25}]',
   '{"minRank":5,"requiredItem":"credencial_concejo"}',
   '{"xp":320,"reputation":11,"money":5200,"items":[],"territoryScore":8,"factionTreasury":780}',
   240, 0, 0, 'credencial_concejo', 5, 1, 0, 1.000, 1),
  (10, 'sondeo_vecinal', 'sondeo_vecinal', 'Sondeo vecinal',
   'Ocho puertas en zona_norte. La mitad no abre, un tercio te putea y el resto te cuenta la vida entera.',
   '[{"id":"encuestas","kind":"encuestar","label":"Completá 8 encuestas puerta a puerta","target":8,"position":{"x":0,"y":0,"z":720},"radiusM":110,"optional":false,"weight":0.85},{"id":"cobertura","kind":"encuestar","label":"Cubrí al menos 3 manzanas distintas","target":3,"optional":true,"weight":0.15}]',
   '{"minRank":1}',
   '{"xp":260,"reputation":7,"money":4200,"items":[],"territoryScore":6,"factionTreasury":630}',
   420, 0, 0, NULL, 1, 0, 1, 1.000, 1)
ON DUPLICATE KEY UPDATE
  `tipo` = VALUES(`tipo`), `titulo` = VALUES(`titulo`), `descripcion` = VALUES(`descripcion`),
  `objetivos` = VALUES(`objetivos`), `requisitos` = VALUES(`requisitos`),
  `recompensas_base` = VALUES(`recompensas_base`), `duracion_s` = VALUES(`duracion_s`),
  `grupal` = VALUES(`grupal`), `disputada` = VALUES(`disputada`),
  `item_requerido` = VALUES(`item_requerido`), `rango_min` = VALUES(`rango_min`),
  `cupo` = VALUES(`cupo`), `exterior` = VALUES(`exterior`), `habilitada` = VALUES(`habilitada`);
