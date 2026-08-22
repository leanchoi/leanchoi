/**
 * Esquel 2027 — Árbol de carrera militante.
 *
 * Diez escalones, del que prende el fuego al que tiene la cara en el afiche.
 * Cada rango desbloquea **algo que se usa**: una herramienta, una acción o una
 * atribución. No hay rangos decorativos; si subís, cambia lo que podés hacer en
 * la calle.
 *
 * La tabla numérica (XP, reputación, estipendios) vive en
 * `/shared/constants/ranks.ts`; acá está lo que cada escalón *habilita*.
 */

import type { RankId, RankLevel } from './common.ts';

/* ------------------------------------------------------------------ */
/* Desbloqueos                                                         */
/* ------------------------------------------------------------------ */

/** Herramientas que se ganan subiendo. Cada una habilita acciones concretas. */
export const CAREER_ITEMS = [
  'termo_y_mate',      // cebar en la esquina: recupera energía y suma reputación
  'engrudo_y_rodillo', // pegar afiches y pintar paredones
  'megafono',          // convocar movilizaciones y hablarle a media cuadra
  'camioneta_bloques', // transportar bolsones y encabezar caravanas
  'credencial_concejo',// entrar al recinto y presentar proyectos
  'sello_de_area',     // firmar expedientes y asignar presupuesto
  'agenda_de_medios',  // operar prensa y desmentir en el aire
  'caja_politica',     // autorizar grandes movilizaciones y financiar actos
  'pasaje_a_rawson',   // articular con la provincia
  'afiche_propio',     // tu cara en la calle: la cúspide
] as const;
export type CareerItem = (typeof CAREER_ITEMS)[number];

/** Acciones de calle y de despacho que habilita cada rango. */
export const CAREER_ABILITIES = [
  'cebar_mate',
  'repartir_choripan',
  'pegar_afiche',
  'pintar_paredon',
  'reclutar_vecino',
  'controlar_esquina',
  'convocar_movilizacion',
  'armar_acto',
  'coordinar_logistica',
  'presentar_proyecto',
  'trabar_ordenanza',
  'asignar_presupuesto',
  'inaugurar_obra',
  'operar_prensa',
  'sellar_alianza',
  'autorizar_movilizacion_masiva',
  'financiar_campania',
  'articular_provincia',
  'encabezar_lista',
  'debate_estelar',
] as const;
export type CareerAbility = (typeof CAREER_ABILITIES)[number];

/** Nombre en criollo de cada herramienta, para el panel de carrera. */
export const CAREER_ITEM_LABELS: Readonly<Record<CareerItem, string>> = {
  termo_y_mate: 'Termo y mate',
  engrudo_y_rodillo: 'Engrudo y rodillo',
  megafono: 'Megáfono',
  camioneta_bloques: 'Camioneta con bloques',
  credencial_concejo: 'Credencial del Concejo',
  sello_de_area: 'Sello del área',
  agenda_de_medios: 'Agenda de medios',
  caja_politica: 'Caja política',
  pasaje_a_rawson: 'Pasaje a Rawson',
  afiche_propio: 'Afiche propio',
};

/** Cómo se dice cada acción cuando la lee un jugador. */
export const CAREER_ABILITY_LABELS: Readonly<Record<CareerAbility, string>> = {
  cebar_mate: 'Cebar mate',
  repartir_choripan: 'Repartir choripán',
  pegar_afiche: 'Pegar afiches',
  pintar_paredon: 'Pintar paredones',
  reclutar_vecino: 'Reclutar vecinos',
  controlar_esquina: 'Controlar la esquina',
  convocar_movilizacion: 'Convocar movilización',
  armar_acto: 'Armar el acto',
  coordinar_logistica: 'Coordinar la logística',
  presentar_proyecto: 'Presentar proyectos',
  trabar_ordenanza: 'Trabar ordenanzas',
  asignar_presupuesto: 'Asignar presupuesto',
  inaugurar_obra: 'Inaugurar obra',
  operar_prensa: 'Operar prensa',
  sellar_alianza: 'Sellar alianzas',
  autorizar_movilizacion_masiva: 'Autorizar movilización masiva',
  financiar_campania: 'Financiar campaña',
  articular_provincia: 'Articular con la provincia',
  encabezar_lista: 'Encabezar la lista',
  debate_estelar: 'Debate estelar',
};

/** Etiqueta de una herramienta o de una acción, sin importar cuál sea. */
export const careerLabel = (token: string): string =>
  CAREER_ITEM_LABELS[token as CareerItem] ?? CAREER_ABILITY_LABELS[token as CareerAbility] ?? token;

/** Dónde se ejerce el rango: la calle, el comité, el Concejo o la provincia. */
export const CAREER_ARENAS = ['calle', 'comite', 'concejo', 'municipio', 'provincia'] as const;
export type CareerArena = (typeof CAREER_ARENAS)[number];

/* ------------------------------------------------------------------ */
/* Definición de un escalón                                            */
/* ------------------------------------------------------------------ */

export interface CareerRank {
  readonly level: RankLevel;
  readonly id: RankId;
  readonly name: string;
  /** Qué hace, en una línea y en criollo. */
  readonly job: string;
  /** Dónde se mueve principalmente. */
  readonly arena: CareerArena;
  /** Herramientas que se ganan al llegar. */
  readonly items: readonly CareerItem[];
  /** Acciones nuevas que habilita. */
  readonly abilities: readonly CareerAbility[];
  /** Militantes que puede tener a cargo (0 = no manda a nadie). */
  readonly cargo: number;
  /** Zonas de disputa que puede reclamar simultáneamente. */
  readonly claimableZones: number;
  /** `true` si puede iniciar un duelo de chicanas sin ser desafiado primero. */
  readonly canChallenge: boolean;
  /** Canal de chat más amplio al que llega. */
  readonly chatReach: 'local' | 'faccion' | 'global';
}

/**
 * Los diez escalones. Lo que dice `job` es lo que el jugador hace en el juego,
 * no una descripción de adorno.
 */
export const CAREER_TREE: readonly CareerRank[] = [
  {
    level: 1,
    id: 'chopanero',
    name: 'Chopanero',
    job: 'Prendés el fuego, repartís los choris y cebás mate hasta que te duele la muñeca.',
    arena: 'calle',
    items: ['termo_y_mate'],
    abilities: ['cebar_mate', 'repartir_choripan'],
    cargo: 0,
    claimableZones: 0,
    canChallenge: false,
    chatReach: 'local',
  },
  {
    level: 2,
    id: 'soldado',
    name: 'Soldado',
    job: 'Pegatinas de madrugada y paredones en Av. Alvear. El engrudo no se lava más.',
    arena: 'calle',
    items: ['engrudo_y_rodillo'],
    abilities: ['pegar_afiche', 'pintar_paredon'],
    cargo: 0,
    claimableZones: 0,
    canChallenge: true,
    chatReach: 'faccion',
  },
  {
    level: 3,
    id: 'puntero',
    name: 'Puntero',
    job: 'Reclutás vecinos, manejás una esquina y sabés quién falta en la lista del acto.',
    arena: 'calle',
    items: ['megafono'],
    abilities: ['reclutar_vecino', 'controlar_esquina', 'convocar_movilizacion'],
    cargo: 5,
    claimableZones: 1,
    canChallenge: true,
    chatReach: 'faccion',
  },
  {
    level: 4,
    id: 'mano_derecha',
    name: 'Mano Derecha',
    job: 'Coordinás la logística del comité y armás los actos: sillas, sonido y micro.',
    arena: 'comite',
    items: ['camioneta_bloques'],
    abilities: ['armar_acto', 'coordinar_logistica'],
    cargo: 12,
    claimableZones: 1,
    canChallenge: true,
    chatReach: 'faccion',
  },
  {
    level: 5,
    id: 'concejal',
    name: 'Concejal',
    job: 'Presentás proyectos y trabás ordenanzas en el Concejo Deliberante.',
    arena: 'concejo',
    items: ['credencial_concejo'],
    abilities: ['presentar_proyecto', 'trabar_ordenanza'],
    cargo: 20,
    claimableZones: 2,
    canChallenge: true,
    chatReach: 'faccion',
  },
  {
    level: 6,
    id: 'director',
    name: 'Director de Área',
    job: 'Manejás el presupuesto de un sector municipal y cortás alguna cinta.',
    arena: 'municipio',
    items: ['sello_de_area'],
    abilities: ['asignar_presupuesto', 'inaugurar_obra'],
    cargo: 30,
    claimableZones: 2,
    canChallenge: true,
    chatReach: 'faccion',
  },
  {
    level: 7,
    id: 'subsecretario',
    name: 'Subsecretario',
    job: 'Operás medios locales y cerrás alianzas con los que ayer puteabas.',
    arena: 'municipio',
    items: ['agenda_de_medios'],
    abilities: ['operar_prensa', 'sellar_alianza'],
    cargo: 45,
    claimableZones: 3,
    canChallenge: true,
    chatReach: 'global',
  },
  {
    level: 8,
    id: 'secretario',
    name: 'Secretario General',
    job: 'Manejás la caja política y autorizás las movilizaciones grandes.',
    arena: 'municipio',
    items: ['caja_politica'],
    abilities: ['autorizar_movilizacion_masiva', 'financiar_campania'],
    cargo: 70,
    claimableZones: 4,
    canChallenge: true,
    chatReach: 'global',
  },
  {
    level: 9,
    id: 'viceministro',
    name: 'Viceministro Provincial',
    job: 'Viajás a Rawson una vez por semana y volvés hablando de "la provincia".',
    arena: 'provincia',
    items: ['pasaje_a_rawson'],
    abilities: ['articular_provincia'],
    cargo: 110,
    claimableZones: 5,
    canChallenge: true,
    chatReach: 'global',
  },
  {
    level: 10,
    id: 'candidato_provincial',
    name: 'Candidato Provincial',
    job: 'Tu cara está en el afiche. Ya no pegás afiches: los mandás a pegar.',
    arena: 'provincia',
    items: ['afiche_propio'],
    abilities: ['encabezar_lista', 'debate_estelar'],
    cargo: 200,
    claimableZones: 5,
    canChallenge: true,
    chatReach: 'global',
  },
];

export const CAREER_BY_LEVEL: Readonly<Record<RankLevel, CareerRank>> = Object.freeze(
  CAREER_TREE.reduce(
    (acc, rank) => {
      acc[rank.level] = rank;
      return acc;
    },
    {} as Record<RankLevel, CareerRank>,
  ),
);

/** Todo lo que un jugador tiene desbloqueado a su nivel (acumulativo). */
export const unlockedItems = (level: RankLevel): CareerItem[] =>
  CAREER_TREE.filter((r) => r.level <= level).flatMap((r) => [...r.items]);

export const unlockedAbilities = (level: RankLevel): CareerAbility[] =>
  CAREER_TREE.filter((r) => r.level <= level).flatMap((r) => [...r.abilities]);

/** `true` si el rango habilita esa acción. Lo consulta el servidor antes de aceptarla. */
export const canDo = (level: RankLevel, ability: CareerAbility): boolean =>
  unlockedAbilities(level).includes(ability);

/** Alcance máximo del chat según el rango: el canal general se gana. */
export const chatReachOf = (level: RankLevel): 'local' | 'faccion' | 'global' =>
  CAREER_BY_LEVEL[level]?.chatReach ?? 'local';

/* ------------------------------------------------------------------ */
/* Progreso del jugador                                                */
/* ------------------------------------------------------------------ */

/** Foto de la carrera de un militante, tal como la muestra el HUD. */
export interface CareerProgress {
  readonly level: RankLevel;
  readonly rank: CareerRank;
  readonly xp: number;
  readonly xpToNext: number;
  /** Progreso dentro del rango actual [0,1]. */
  readonly progress: number;
  readonly reputation: number;
  readonly loyalty: number;
  /** Qué le falta para el ascenso, ya desglosado. */
  readonly missing: { readonly xp: number; readonly reputation: number; readonly loyalty: number };
  readonly items: readonly CareerItem[];
  readonly abilities: readonly CareerAbility[];
}
