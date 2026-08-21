-- =============================================================================
--  ESQUEL 2027 — SEED: catálogo de misiones (10 tipologías Live-Ops)
--  `objetivos` sigue el contrato QuestObjective[] de /shared/types/quests.ts.
--  `recompensas_base` debe coincidir con QUEST_BASELINES de /shared/constants/balance.ts.
-- =============================================================================
SET NAMES utf8mb4;

INSERT INTO `misiones_catalogo`
  (`id`, `slug`, `tipo`, `titulo`, `descripcion`, `objetivos`, `requisitos`, `recompensas_base`, `duracion_s`, `grupal`, `exterior`, `peso_seleccion`, `habilitada`)
VALUES
  (1, 'afiches_alvear', 'afiches_relampago',
   'Pegatina relámpago en Alvear',
   'Salió una nota que nos pega y hay que tapar la ciudad antes del mediodía. Balde, afiche y velocidad: el que llega primero manda el mensaje.',
   '[{"id":"pegar","kind":"interactuar","label":"Pegá 12 afiches sobre la arteria asignada","target":12,"optional":false,"weight":0.8},{"id":"limpio","kind":"evitar","label":"No te agarre el inspector municipal","target":1,"optional":true,"weight":0.2}]',
   '{"minRank":1,"requiredItems":[{"itemId":1,"qty":12},{"itemId":2,"qty":1}]}',
   '{"xp":210,"reputation":4,"money":4500,"territoryScore":8,"factionTreasury":450,"items":[]}',
   300, 0, 1, 1.400, 1),

  (2, 'volanteada_esquina', 'volanteada',
   'Volanteada en la esquina',
   'Cien volantes, una esquina y la paciencia de explicar la misma propuesta cien veces con la misma sonrisa.',
   '[{"id":"repartir","kind":"entregar","label":"Repartí 30 volantes a vecinos","target":30,"optional":false,"weight":0.7},{"id":"charlar","kind":"interactuar","label":"Charlá con 5 vecinos que se frenen","target":5,"optional":false,"weight":0.3}]',
   '{"minRank":1,"requiredItems":[{"itemId":3,"qty":30}]}',
   '{"xp":180,"reputation":5,"money":3800,"territoryScore":6,"factionTreasury":380,"items":[]}',
   300, 0, 1, 1.500, 1),

  (3, 'mateada_plaza', 'mateada_solidaria',
   'Mateada en la plaza',
   'Ronda de mate en la plaza. No se milita: se conversa. Que es exactamente lo mismo, pero con agua caliente.',
   '[{"id":"cebar","kind":"interactuar","label":"Cebá 15 mates","target":15,"optional":false,"weight":0.5},{"id":"sostener","kind":"permanecer","label":"Sostené la ronda 8 minutos","target":480,"optional":false,"weight":0.5}]',
   '{"minRank":1,"requiredItems":[{"itemId":4,"qty":1},{"itemId":5,"qty":1}]}',
   '{"xp":240,"reputation":9,"money":3000,"territoryScore":10,"factionTreasury":300,"items":[]}',
   480, 1, 1, 1.100, 1),

  (4, 'movilizacion_esquina_clave', 'movilizacion_esquina',
   'Aguantar la esquina',
   'La esquina se defiende con cuerpos, bombo y coordinación. Diez juntos valen más que veinte dispersos: la fórmula lo dice y la calle también.',
   '[{"id":"presencia","kind":"permanecer","label":"Sostené la zona 10 minutos","target":600,"optional":false,"weight":0.6},{"id":"cohesion","kind":"permanecer","label":"Mantenete cerca del núcleo de la movilización","target":300,"optional":false,"weight":0.4}]',
   '{"minRank":3,"requiredItems":[]}',
   '{"xp":380,"reputation":12,"money":6000,"territoryScore":26,"factionTreasury":600,"items":[]}',
   600, 1, 1, 0.900, 1),

  (5, 'contracampania_nocturna', 'contracampania',
   'Operativo tapado',
   'De noche, sin testigos, tapás lo que pegaron ellos. Sube la guita, baja la reputación: la política también tiene contabilidad moral.',
   '[{"id":"tapar","kind":"interactuar","label":"Tapá 8 afiches rivales","target":8,"optional":false,"weight":0.7},{"id":"sin_ver","kind":"evitar","label":"Que no te vea ningún militante rival","target":1,"optional":false,"weight":0.3}]',
   '{"minRank":3,"requiredItems":[{"itemId":8,"qty":4}]}',
   '{"xp":300,"reputation":-3,"money":8000,"territoryScore":14,"factionTreasury":800,"items":[]}',
   420, 0, 1, 0.700, 1),

  (6, 'operativo_prensa_radio', 'operativo_prensa',
   'Te para el periodista',
   'Un micrófono, tres preguntas incómodas y treinta segundos para no arruinarlo todo.',
   '[{"id":"responder","kind":"ganar_debate","label":"Ganá el mini-debate con el periodista","target":1,"optional":false,"weight":1.0}]',
   '{"minRank":2,"requiredItems":[]}',
   '{"xp":320,"reputation":11,"money":5200,"territoryScore":9,"factionTreasury":520,"items":[]}',
   240, 0, 0, 0.800, 1),

  (7, 'caza_baches_barrio', 'caza_baches',
   'Cazador de baches',
   'Foto, dirección y a la planilla. El reclamo vecinal es la unidad mínima de la política municipal.',
   '[{"id":"relevar","kind":"recolectar","label":"Relevá 10 baches o luminarias rotas","target":10,"optional":false,"weight":0.8},{"id":"presentar","kind":"entregar","label":"Presentá el reclamo en la mesa de entradas","target":1,"optional":false,"weight":0.2}]',
   '{"minRank":1,"requiredItems":[{"itemId":9,"qty":1}]}',
   '{"xp":200,"reputation":8,"money":3500,"territoryScore":5,"factionTreasury":350,"items":[]}',
   360, 0, 1, 1.200, 1),

  (8, 'escrache_debate_calle', 'escrache_debate',
   'Duelo en la vereda',
   'Un militante rival te cruza en plena cuadra. Hay público, hay celulares y no hay forma elegante de esquivarlo.',
   '[{"id":"ganar","kind":"ganar_debate","label":"Ganá el duelo de debate","target":1,"optional":false,"weight":1.0}]',
   '{"minRank":2,"requiredItems":[]}',
   '{"xp":340,"reputation":10,"money":5500,"territoryScore":12,"factionTreasury":550,"items":[]}',
   300, 0, 1, 1.000, 1),

  (9, 'censo_vecinal_puerta', 'censo_vecinal',
   'Censo vecinal',
   'Doce preguntas, puerta por puerta. La mitad no abre, un tercio te putea y el resto te cuenta la vida entera.',
   '[{"id":"encuestar","kind":"encuestar","label":"Completá 12 encuestas","target":12,"optional":false,"weight":0.9},{"id":"cobertura","kind":"alcanzar","label":"Cubrí al menos 3 manzanas distintas","target":3,"optional":true,"weight":0.1}]',
   '{"minRank":1,"requiredItems":[{"itemId":10,"qty":1}]}',
   '{"xp":260,"reputation":7,"money":4200,"territoryScore":4,"factionTreasury":420,"items":[]}',
   420, 0, 1, 1.000, 1),

  (10, 'emergencia_nevada', 'emergencia_climatica',
   'Cayó la nevada',
   'Se cortó el gas en dos manzanas y hay que repartir leña antes de que baje más la temperatura. Acá no hay bandos: hay frío.',
   '[{"id":"repartir_lenia","kind":"entregar","label":"Entregá 20 cargas de leña","target":20,"optional":false,"weight":0.6},{"id":"despejar","kind":"interactuar","label":"Despejá 6 veredas","target":6,"optional":false,"weight":0.4}]',
   '{"minRank":1,"requiredItems":[{"itemId":15,"qty":20}]}',
   '{"xp":420,"reputation":18,"money":7000,"territoryScore":10,"factionTreasury":700,"items":[]}',
   540, 1, 1, 0.600, 1)
ON DUPLICATE KEY UPDATE
  `titulo` = VALUES(`titulo`), `descripcion` = VALUES(`descripcion`), `objetivos` = VALUES(`objetivos`),
  `requisitos` = VALUES(`requisitos`), `recompensas_base` = VALUES(`recompensas_base`),
  `duracion_s` = VALUES(`duracion_s`), `grupal` = VALUES(`grupal`), `exterior` = VALUES(`exterior`),
  `peso_seleccion` = VALUES(`peso_seleccion`);
