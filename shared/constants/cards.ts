/**
 * Vive en `/shared` y no en el servidor a propósito: el cliente necesita los
 * mismos datos para dibujar la carta —nombre, familia, coste, poder, sabor— y
 * cuando había dos copias, la del cliente podía mostrar un coste y el servidor
 * cobrar otro. Una sola lista, importada por los dos.
 */

/**
 * Las 24 cartas del Duelo de Chicanas.
 *
 * Cuatro por familia, y cada familia se juega distinto. El balance no está en que
 * todas peguen parecido, sino en que cada una tenga su momento:
 *
 *   CHICANA           barata y confiable: el pan de todos los días
 *   CARPETAZO         demoledora si el rival acaba de prometer cualquier cosa; si no, papelón
 *   PROMESA_INVIABLE  te levanta la credibilidad y te deja expuesto al carpetazo
 *   ROMPER_QUORUM     no lastima, ordena el duelo: le apaga la especial al rival
 *   CHANCHULLO        le sacás la labia y lo dejás sin nafta
 *   INVOCAR_AL_LIDER  golpe grande donde tu facción manda; flojo en zona ajena
 *
 * El costo está en LABIA (arrancás con 5, recuperás 3 por turno, tope 12). Las
 * caras se juegan cada dos o tres turnos: eso es lo que le da ritmo al duelo.
 *
 * Este catálogo es la fuente de verdad; `backend-php/database/seeds/004_cartas_debate.sql`
 * se genera desde acá con `npm run seeds`.
 */

import type { DebateCardSlug } from '../types/common.ts';
import type { DebateCard, DebateFamily } from '../types/debate.ts';

const card = (c: Omit<DebateCard, 'slug'> & { slug: string }): DebateCard =>
  ({ ...c, slug: c.slug as DebateCardSlug });

export const CARD_LIST: readonly DebateCard[] = [
  /* ---------------- CHICANA ---------------- */
  card({
    slug: 'chicana_del_asado',
    name: 'Chicana del asado',
    flavor: 'Le recordás, delante de todos, que se fue del asado sin poner la plata.',
    family: 'CHICANA',
    rarity: 'comun',
    cost: 2,
    power: 14,
    accuracy: 0.92 as never,
    backfire: 0.06 as never,
    effects: [{ kind: 'daño', value: 14, turns: 0 }],
    minRank: 1,
    cooldown: 0,
    maxCopies: 3,
    icon: 'card_chicana_asado',
    enabled: true,
  }),
  card({
    slug: 'apodo_del_barrio',
    name: 'El apodo del barrio',
    flavor: 'Todo el mundo sabe cómo le dicen. Vos lo decís al micrófono.',
    family: 'CHICANA',
    rarity: 'infrecuente',
    cost: 3,
    power: 20,
    accuracy: 0.88 as never,
    backfire: 0.1 as never,
    effects: [
      { kind: 'daño', value: 20, turns: 0 },
      { kind: 'favor_publico', value: 0.04, turns: 0 },
    ],
    minRank: 2,
    cooldown: 1,
    maxCopies: 2,
    icon: 'card_apodo',
    enabled: true,
  }),
  card({
    slug: 'risa_incomoda',
    name: 'Risa incómoda',
    flavor: 'No contestás: te reís. Funciona más de lo que debería.',
    family: 'CHICANA',
    rarity: 'rara',
    cost: 2,
    power: 11,
    accuracy: 0.95 as never,
    backfire: 0.04 as never,
    effects: [
      { kind: 'daño', value: 11, turns: 0 },
      { kind: 'silenciar', value: 1, turns: 1, family: 'CARPETAZO' },
    ],
    minRank: 3,
    factionAffinity: 4 as never,
    cooldown: 2,
    maxCopies: 2,
    icon: 'card_risa',
    enabled: true,
  }),
  card({
    slug: 'te_vi_en_la_fila',
    name: 'Te vi en la fila',
    flavor: 'Hablás de austeridad y te vieron sacando pasaje en cuotas. Con la del Estado.',
    family: 'CHICANA',
    rarity: 'rara',
    cost: 4,
    power: 26,
    accuracy: 0.85 as never,
    backfire: 0.12 as never,
    effects: [{ kind: 'daño', value: 26, turns: 0 }],
    minRank: 4,
    cooldown: 2,
    maxCopies: 2,
    icon: 'card_fila',
    enabled: true,
  }),

  /* ---------------- CARPETAZO ---------------- */
  card({
    slug: 'carpeta_del_2011',
    name: 'La carpeta del 2011',
    flavor: 'La hemeroteca no perdona: eso lo dijiste exactamente al revés hace dieciséis años.',
    family: 'CARPETAZO',
    rarity: 'infrecuente',
    cost: 3,
    power: 22,
    accuracy: 0.85 as never,
    backfire: 0.1 as never,
    effects: [{ kind: 'daño_condicional', value: 22, turns: 0 }],
    minRank: 2,
    cooldown: 1,
    maxCopies: 3,
    icon: 'card_carpeta',
    enabled: true,
  }),
  card({
    slug: 'la_captura_guardada',
    name: 'La captura guardada',
    flavor: 'Lo borró del muro a los diez minutos. Alguien fue más rápido.',
    family: 'CARPETAZO',
    rarity: 'rara',
    cost: 4,
    power: 22,
    accuracy: 0.82 as never,
    backfire: 0.14 as never,
    effects: [
      { kind: 'daño_condicional', value: 22, turns: 0 },
      { kind: 'sangrado', value: 2, turns: 2 },
    ],
    minRank: 4,
    factionAffinity: 3 as never,
    cooldown: 2,
    maxCopies: 2,
    icon: 'card_captura',
    enabled: true,
  }),
  card({
    slug: 'el_audio_que_circula',
    name: 'El audio que circula',
    flavor: 'Nadie sabe quién lo grabó, pero está en todos los grupos del pueblo.',
    family: 'CARPETAZO',
    rarity: 'epica',
    cost: 5,
    power: 20,
    accuracy: 0.76 as never,
    backfire: 0.22 as never,
    effects: [{ kind: 'daño_condicional', value: 20, turns: 0 }],
    minRank: 6,
    cooldown: 3,
    maxCopies: 1,
    icon: 'card_audio',
    enabled: true,
  }),
  card({
    slug: 'la_declaracion_jurada',
    name: 'La declaración jurada',
    flavor: 'Leés en voz alta lo que declaró y lo que se le ve puesto. No coincide.',
    family: 'CARPETAZO',
    rarity: 'comun',
    cost: 3,
    power: 18,
    accuracy: 0.9 as never,
    backfire: 0.08 as never,
    effects: [
      { kind: 'daño_condicional', value: 18, turns: 0 },
      { kind: 'robar_labia', value: 1, turns: 0 },
    ],
    minRank: 3,
    cooldown: 1,
    maxCopies: 3,
    icon: 'card_ddjj',
    enabled: true,
  }),

  /* ---------------- PROMESA_INVIABLE ---------------- */
  card({
    slug: 'asfalto_para_todos',
    name: 'Asfalto para todos',
    flavor: 'Todas las calles, en dos años, sin subir un peso de tasas.',
    family: 'PROMESA_INVIABLE',
    rarity: 'comun',
    cost: 2,
    power: 16,
    accuracy: 0.94 as never,
    backfire: 0.05 as never,
    effects: [
      { kind: 'curar', value: 21, turns: 0 },
      { kind: 'mentira', value: 1, turns: 1 },
    ],
    minRank: 1,
    factionAffinity: 2 as never,
    cooldown: 1,
    maxCopies: 3,
    icon: 'card_asfalto',
    enabled: true,
  }),
  card({
    slug: 'el_polideportivo',
    name: 'El polideportivo nuevo',
    flavor: 'Con pileta climatizada, estacionamiento y, si se puede, helipuerto.',
    family: 'PROMESA_INVIABLE',
    rarity: 'infrecuente',
    cost: 3,
    power: 24,
    accuracy: 0.9 as never,
    backfire: 0.08 as never,
    effects: [
      { kind: 'curar', value: 24, turns: 0 },
      { kind: 'mentira', value: 1, turns: 1 },
      { kind: 'favor_publico', value: 0.06, turns: 0 },
    ],
    minRank: 2,
    cooldown: 2,
    maxCopies: 2,
    icon: 'card_poli',
    enabled: true,
  }),
  card({
    slug: 'tren_a_la_hoya',
    name: 'Tren a La Hoya',
    flavor: 'Un tren turístico que sube al cerro. Los números los vemos después.',
    family: 'PROMESA_INVIABLE',
    rarity: 'rara',
    cost: 4,
    power: 32,
    accuracy: 0.86 as never,
    backfire: 0.12 as never,
    effects: [
      { kind: 'curar', value: 32, turns: 0 },
      { kind: 'mentira', value: 1, turns: 1 },
      { kind: 'escudo', value: 0.2, turns: 1 },
    ],
    minRank: 4,
    cooldown: 3,
    maxCopies: 2,
    icon: 'card_tren',
    enabled: true,
  }),
  card({
    slug: 'sueldo_al_dia',
    name: 'Sueldos al día',
    flavor: 'El mes que viene se paga todo junto. Y con aumento.',
    family: 'PROMESA_INVIABLE',
    rarity: 'comun',
    cost: 2,
    power: 12,
    accuracy: 0.95 as never,
    backfire: 0.04 as never,
    effects: [
      { kind: 'curar', value: 16, turns: 0 },
      { kind: 'mentira', value: 1, turns: 1 },
      { kind: 'ganar_labia', value: 2, turns: 0 },
    ],
    minRank: 1,
    cooldown: 1,
    maxCopies: 3,
    icon: 'card_sueldo',
    enabled: true,
  }),

  /* ---------------- ROMPER_QUORUM ---------------- */
  card({
    slug: 'me_levanto_de_la_banca',
    name: 'Me levanto de la banca',
    flavor: 'Te parás, juntás los papeles y te vas. Sin número no hay sesión.',
    family: 'ROMPER_QUORUM',
    rarity: 'comun',
    cost: 2,
    power: 8,
    accuracy: 0.93 as never,
    backfire: 0.05 as never,
    effects: [
      { kind: 'daño', value: 8, turns: 0 },
      { kind: 'bloquear_habilidad', value: 1, turns: 1 },
      { kind: 'silenciar', value: 1, turns: 1, family: 'INVOCAR_AL_LIDER' },
    ],
    minRank: 2,
    cooldown: 1,
    maxCopies: 3,
    icon: 'card_banca',
    enabled: true,
  }),
  card({
    slug: 'no_hay_numero',
    name: 'No hay número',
    flavor: 'Faltan dos y ninguno atiende el teléfono. Qué casualidad.',
    family: 'ROMPER_QUORUM',
    rarity: 'infrecuente',
    cost: 3,
    power: 12,
    accuracy: 0.9 as never,
    backfire: 0.06 as never,
    effects: [
      { kind: 'daño', value: 12, turns: 0 },
      { kind: 'bloquear_habilidad', value: 1, turns: 1 },
      { kind: 'silenciar', value: 1, turns: 2, family: 'CARPETAZO' },
    ],
    minRank: 5,
    cooldown: 2,
    maxCopies: 2,
    icon: 'card_numero',
    enabled: true,
  }),
  card({
    slug: 'cuestion_de_privilegio',
    name: 'Cuestión de privilegio',
    flavor: 'Interrumpís por reglamento y hablás cinco minutos de otra cosa.',
    family: 'ROMPER_QUORUM',
    rarity: 'rara',
    cost: 3,
    power: 10,
    accuracy: 0.92 as never,
    backfire: 0.05 as never,
    effects: [
      { kind: 'daño', value: 10, turns: 0 },
      { kind: 'bloquear_habilidad', value: 1, turns: 1 },
      { kind: 'escudo', value: 0.25, turns: 2 },
    ],
    minRank: 5,
    factionAffinity: 5 as never,
    cooldown: 2,
    maxCopies: 2,
    icon: 'card_privilegio',
    enabled: true,
  }),
  card({
    slug: 'pido_la_palabra',
    name: 'Pido la palabra',
    flavor: 'La pedís, la tomás y no la soltás más.',
    family: 'ROMPER_QUORUM',
    rarity: 'comun',
    cost: 1,
    power: 5,
    accuracy: 0.97 as never,
    backfire: 0.02 as never,
    effects: [
      { kind: 'daño', value: 5, turns: 0 },
      { kind: 'silenciar', value: 1, turns: 1, family: 'CHICANA' },
      { kind: 'ganar_labia', value: 1, turns: 0 },
    ],
    minRank: 1,
    cooldown: 1,
    maxCopies: 3,
    icon: 'card_palabra',
    enabled: true,
  }),

  /* ---------------- CHANCHULLO ---------------- */
  card({
    slug: 'licitacion_amiga',
    name: 'Licitación amiga',
    flavor: 'Se presentaron tres empresas y las tres eran del mismo galpón.',
    family: 'CHANCHULLO',
    rarity: 'comun',
    cost: 2,
    power: 10,
    accuracy: 0.9 as never,
    backfire: 0.1 as never,
    effects: [
      { kind: 'daño', value: 10, turns: 0 },
      { kind: 'robar_labia', value: 2, turns: 0 },
    ],
    minRank: 3,
    cooldown: 1,
    maxCopies: 3,
    icon: 'card_licitacion',
    enabled: true,
  }),
  card({
    slug: 'pase_a_planta',
    name: 'Pase a planta',
    flavor: 'Diciembre, último día hábil, cuarenta expedientes y un sello cansado.',
    family: 'CHANCHULLO',
    rarity: 'infrecuente',
    cost: 3,
    power: 14,
    accuracy: 0.87 as never,
    backfire: 0.14 as never,
    effects: [
      { kind: 'daño', value: 14, turns: 0 },
      { kind: 'robar_labia', value: 3, turns: 0 },
    ],
    minRank: 5,
    cooldown: 2,
    maxCopies: 2,
    icon: 'card_planta',
    enabled: true,
  }),
  card({
    slug: 'la_camioneta_oficial',
    name: 'La camioneta oficial',
    flavor: 'Aparece los fines de semana a doscientos kilómetros. Con caña de pescar.',
    family: 'CHANCHULLO',
    rarity: 'rara',
    cost: 4,
    power: 18,
    accuracy: 0.83 as never,
    backfire: 0.2 as never,
    effects: [
      { kind: 'daño', value: 18, turns: 0 },
      { kind: 'robar_labia', value: 3, turns: 0 },
    ],
    minRank: 6,
    factionAffinity: 4 as never,
    cooldown: 2,
    maxCopies: 2,
    icon: 'card_camioneta',
    enabled: true,
  }),
  card({
    slug: 'sobreprecio_en_la_obra',
    name: 'Sobreprecio en la obra',
    flavor: 'La misma vereda, tres veces el precio, dos veces por año.',
    family: 'CHANCHULLO',
    rarity: 'infrecuente',
    cost: 3,
    power: 12,
    accuracy: 0.88 as never,
    backfire: 0.12 as never,
    effects: [
      { kind: 'daño', value: 10, turns: 0 },
      { kind: 'robar_labia', value: 2, turns: 0 },
      { kind: 'sangrado', value: 2, turns: 2 },
    ],
    minRank: 4,
    cooldown: 2,
    maxCopies: 2,
    icon: 'card_sobreprecio',
    enabled: true,
  }),

  /* ---------------- INVOCAR_AL_LIDER ---------------- */
  card({
    slug: 'la_foto_con_el_jefe',
    name: 'La foto con el jefe',
    flavor: 'Cuando no tenés argumento, tenés una foto. Y la mostrás.',
    family: 'INVOCAR_AL_LIDER',
    rarity: 'comun',
    cost: 3,
    power: 20,
    accuracy: 0.88 as never,
    backfire: 0.1 as never,
    effects: [{ kind: 'daño', value: 20, turns: 0 }],
    minRank: 2,
    cooldown: 1,
    maxCopies: 3,
    icon: 'card_foto',
    enabled: true,
  }),
  card({
    slug: 'bajaron_linea',
    name: 'Bajaron línea',
    flavor: 'Llamaron de arriba. El tema se cierra acá.',
    family: 'INVOCAR_AL_LIDER',
    rarity: 'rara',
    cost: 4,
    power: 26,
    accuracy: 0.85 as never,
    backfire: 0.12 as never,
    effects: [
      { kind: 'daño', value: 26, turns: 0 },
      { kind: 'silenciar', value: 1, turns: 1, family: 'PROMESA_INVIABLE' },
    ],
    minRank: 5,
    cooldown: 2,
    maxCopies: 2,
    icon: 'card_linea',
    enabled: true,
  }),
  card({
    slug: 'el_dedo_del_dedo',
    name: 'El dedo del dedo',
    flavor: 'No te eligieron a vos, pero te señalaron. Con eso alcanza.',
    family: 'INVOCAR_AL_LIDER',
    rarity: 'epica',
    cost: 5,
    power: 27,
    accuracy: 0.8 as never,
    backfire: 0.15 as never,
    effects: [{ kind: 'daño', value: 27, turns: 0 }],
    minRank: 7,
    cooldown: 3,
    maxCopies: 1,
    icon: 'card_dedo',
    enabled: true,
  }),
  card({
    slug: 'vino_el_ministro',
    name: 'Vino el ministro',
    flavor: 'Bajó del auto, cortó la cinta, sacó la foto y se volvió a Rawson.',
    family: 'INVOCAR_AL_LIDER',
    rarity: 'infrecuente',
    cost: 4,
    power: 17,
    accuracy: 0.86 as never,
    backfire: 0.1 as never,
    effects: [
      { kind: 'daño', value: 17, turns: 0 },
      { kind: 'favor_publico', value: 0.05, turns: 0 },
    ],
    minRank: 4,
    factionAffinity: 2 as never,
    cooldown: 2,
    maxCopies: 2,
    icon: 'card_ministro',
    enabled: true,
  }),
];

/** Catálogo indexado por slug: es lo que consulta el motor en cada jugada. */
export const CARD_CATALOG: ReadonlyMap<string, DebateCard> = new Map(CARD_LIST.map((c) => [c.slug, c]));

export const cardsOfFamily = (family: DebateFamily): DebateCard[] =>
  CARD_LIST.filter((c) => c.family === family);

/**
 * Mazo inicial para un rango: doce cartas legales, equilibradas entre familias.
 * Es lo que recibe el que todavía no armó el suyo.
 */
export const starterDeck = (rankTier: number): DebateCardSlug[] => {
  const legales = CARD_LIST.filter((c) => c.enabled && c.minRank <= rankTier);
  const mazo: DebateCardSlug[] = [];
  const familias: DebateFamily[] = [
    'CHICANA',
    'PROMESA_INVIABLE',
    'ROMPER_QUORUM',
    'CARPETAZO',
    'CHANCHULLO',
    'INVOCAR_AL_LIDER',
  ];

  // Dos por familia, empezando por las más baratas: un mazo que se puede jugar.
  for (const familia of familias) {
    const dela = legales.filter((c) => c.family === familia).sort((a, b) => a.cost - b.cost);
    for (const carta of dela.slice(0, 2)) mazo.push(carta.slug);
  }

  // Si alguna familia no tenía cartas legales, se completa con lo más barato.
  const relleno = legales.slice().sort((a, b) => a.cost - b.cost);
  let i = 0;
  while (mazo.length < 12 && relleno.length > 0) {
    const carta = relleno[i % relleno.length];
    if (mazo.filter((s) => s === carta.slug).length < carta.maxCopies) mazo.push(carta.slug);
    i++;
    if (i > 500) break;
  }

  return mazo.slice(0, 12);
};
