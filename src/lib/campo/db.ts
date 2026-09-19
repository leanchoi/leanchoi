import Dexie from 'dexie';
import type { Table } from 'dexie';
import type {
  AudioLocal,
  ContactoLocal,
  CuestionarioCacheado,
  EncuestaLocal,
  EventoSync,
  NoRespuestaLocal,
  SesionCampo,
  ViviendaLocal,
} from './tipos';

/**
 * Base local del celular (IndexedDB vía Dexie).
 *
 * Es la única memoria del dispositivo: NO se usa localStorage ni sessionStorage
 * para datos de vecinos. Lo que está acá se purga apenas la sincronización queda
 * confirmada por el servidor.
 */
export class BaseCampo extends Dexie {
  sesion!: Table<SesionCampo, string>;
  cuestionario!: Table<CuestionarioCacheado, string>;
  viviendas!: Table<ViviendaLocal, string>;
  encuestas!: Table<EncuestaLocal, string>;
  noRespuestas!: Table<NoRespuestaLocal, string>;
  audios!: Table<AudioLocal, string>;
  contactos!: Table<ContactoLocal, string>;
  outbox!: Table<EventoSync, string>;

  constructor(nombre = 'relevamiento-esquel', opciones?: ConstructorParameters<typeof Dexie>[1]) {
    super(nombre, opciones);
    this.version(1).stores({
      sesion: 'id',
      cuestionario: 'id',
      viviendas: 'id, barrioSlug, estado',
      encuestas: 'ticket, viviendaId, cerradaEn',
      noRespuestas: 'id, viviendaId',
      audios: 'id, ticket',
      contactos: 'ticket',
      outbox: 'id, tipo, confirmadoEn, creadoEn',
    });
  }
}

let instancia: BaseCampo | null = null;

export function getBaseCampo(): BaseCampo {
  instancia ??= new BaseCampo();
  return instancia;
}

/** Solo para tests: usar una base aparte. */
export function crearBaseCampo(
  nombre: string,
  opciones?: ConstructorParameters<typeof Dexie>[1],
): BaseCampo {
  return new BaseCampo(nombre, opciones);
}
