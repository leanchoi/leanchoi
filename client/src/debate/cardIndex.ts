/**
 * Índice de cartas del lado del cliente.
 *
 * El servidor manda los duelos por slug: acá viven los datos que hacen falta
 * para dibujar la carta (nombre, familia, coste, poder y el texto de sabor).
 * Trae una copia embebida para que la UI nunca quede vacía, y puede refrescarse
 * desde el catálogo de la API cuando se agreguen cartas sin recompilar.
 */

import type { DebateFamily } from '@esquel/shared';
import { CONFIG } from '../config.ts';

export interface CardInfo {
  readonly slug: string;
  readonly name: string;
  readonly family: DebateFamily;
  readonly cost: number;
  readonly power: number;
  readonly flavor: string;
  readonly rarity: string;
}

const EMBEBIDAS: readonly CardInfo[] = [
  { slug: 'chicana_del_asado', name: 'Chicana del asado', family: 'CHICANA', cost: 2, power: 14, rarity: 'comun', flavor: 'Se fue del asado sin poner la plata.' },
  { slug: 'apodo_del_barrio', name: 'El apodo del barrio', family: 'CHICANA', cost: 3, power: 20, rarity: 'infrecuente', flavor: 'Todos saben cómo le dicen.' },
  { slug: 'risa_incomoda', name: 'Risa incómoda', family: 'CHICANA', cost: 2, power: 11, rarity: 'rara', flavor: 'No contestás: te reís.' },
  { slug: 'te_vi_en_la_fila', name: 'Te vi en la fila', family: 'CHICANA', cost: 4, power: 26, rarity: 'rara', flavor: 'Hablás de austeridad y sacás pasaje en cuotas.' },
  { slug: 'carpeta_del_2011', name: 'La carpeta del 2011', family: 'CARPETAZO', cost: 3, power: 22, rarity: 'infrecuente', flavor: 'Eso lo dijiste al revés hace dieciséis años.' },
  { slug: 'la_captura_guardada', name: 'La captura guardada', family: 'CARPETAZO', cost: 4, power: 22, rarity: 'rara', flavor: 'Lo borró, pero alguien fue más rápido.' },
  { slug: 'el_audio_que_circula', name: 'El audio que circula', family: 'CARPETAZO', cost: 5, power: 20, rarity: 'epica', flavor: 'Está en todos los grupos del pueblo.' },
  { slug: 'la_declaracion_jurada', name: 'La declaración jurada', family: 'CARPETAZO', cost: 3, power: 18, rarity: 'comun', flavor: 'Lo que declaró y lo que se le ve puesto.' },
  { slug: 'asfalto_para_todos', name: 'Asfalto para todos', family: 'PROMESA_INVIABLE', cost: 2, power: 16, rarity: 'comun', flavor: 'Todas las calles, en dos años, sin subir tasas.' },
  { slug: 'el_polideportivo', name: 'El polideportivo nuevo', family: 'PROMESA_INVIABLE', cost: 3, power: 24, rarity: 'infrecuente', flavor: 'Con pileta climatizada y helipuerto.' },
  { slug: 'tren_a_la_hoya', name: 'Tren a La Hoya', family: 'PROMESA_INVIABLE', cost: 4, power: 32, rarity: 'rara', flavor: 'Los números los vemos después.' },
  { slug: 'sueldo_al_dia', name: 'Sueldos al día', family: 'PROMESA_INVIABLE', cost: 2, power: 12, rarity: 'comun', flavor: 'El mes que viene se paga todo junto.' },
  { slug: 'me_levanto_de_la_banca', name: 'Me levanto de la banca', family: 'ROMPER_QUORUM', cost: 2, power: 8, rarity: 'comun', flavor: 'Sin número no hay sesión.' },
  { slug: 'no_hay_numero', name: 'No hay número', family: 'ROMPER_QUORUM', cost: 3, power: 12, rarity: 'infrecuente', flavor: 'Faltan dos y ninguno atiende.' },
  { slug: 'cuestion_de_privilegio', name: 'Cuestión de privilegio', family: 'ROMPER_QUORUM', cost: 3, power: 10, rarity: 'rara', flavor: 'Interrumpís por reglamento.' },
  { slug: 'pido_la_palabra', name: 'Pido la palabra', family: 'ROMPER_QUORUM', cost: 1, power: 5, rarity: 'comun', flavor: 'La pedís y no la soltás más.' },
  { slug: 'licitacion_amiga', name: 'Licitación amiga', family: 'CHANCHULLO', cost: 2, power: 10, rarity: 'comun', flavor: 'Tres empresas del mismo galpón.' },
  { slug: 'pase_a_planta', name: 'Pase a planta', family: 'CHANCHULLO', cost: 3, power: 14, rarity: 'infrecuente', flavor: 'Diciembre, último día hábil.' },
  { slug: 'la_camioneta_oficial', name: 'La camioneta oficial', family: 'CHANCHULLO', cost: 4, power: 18, rarity: 'rara', flavor: 'Aparece los fines de semana con caña de pescar.' },
  { slug: 'sobreprecio_en_la_obra', name: 'Sobreprecio en la obra', family: 'CHANCHULLO', cost: 3, power: 10, rarity: 'infrecuente', flavor: 'La misma vereda, tres veces el precio.' },
  { slug: 'la_foto_con_el_jefe', name: 'La foto con el jefe', family: 'INVOCAR_AL_LIDER', cost: 3, power: 20, rarity: 'comun', flavor: 'Cuando no tenés argumento, tenés una foto.' },
  { slug: 'bajaron_linea', name: 'Bajaron línea', family: 'INVOCAR_AL_LIDER', cost: 4, power: 26, rarity: 'rara', flavor: 'Llamaron de arriba. El tema se cierra acá.' },
  { slug: 'el_dedo_del_dedo', name: 'El dedo del dedo', family: 'INVOCAR_AL_LIDER', cost: 5, power: 27, rarity: 'epica', flavor: 'No te eligieron, pero te señalaron.' },
  { slug: 'vino_el_ministro', name: 'Vino el ministro', family: 'INVOCAR_AL_LIDER', cost: 4, power: 17, rarity: 'infrecuente', flavor: 'Cortó la cinta y se volvió a Rawson.' },
];

const indice = new Map<string, CardInfo>(EMBEBIDAS.map((c) => [c.slug, c]));

export const CARD_INDEX: ReadonlyMap<string, CardInfo> = indice;

/** Refresca el índice desde el catálogo de la API. */
export const refreshCardIndex = async (): Promise<void> => {
  try {
    const res = await fetch(`${CONFIG.api.baseUrl}/catalog/cards`, { cache: 'no-cache' });
    if (!res.ok) return;
    const cartas = (await res.json()) as CardInfo[];
    for (const carta of cartas) indice.set(carta.slug, carta);
  } catch {
    // Sin catálogo remoto se sigue con la copia embebida.
  }
};
