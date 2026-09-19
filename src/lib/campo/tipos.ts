import type { Cuestionario, Pregunta } from '@/lib/cuestionario';

/**
 * Tipos de la app de campo. Todo esto vive en el celular (IndexedDB) y sobrevive
 * a que se cierre el navegador o se apague el teléfono.
 */

export const MOTIVOS_NO_RESPUESTA = [
  'sin_moradores',
  'rechazo',
  'deshabitada',
  'no_accesible',
  'volver_mas_tarde',
] as const;

export type MotivoNoRespuesta = (typeof MOTIVOS_NO_RESPUESTA)[number];

export const ETIQUETA_MOTIVO: Record<MotivoNoRespuesta, string> = {
  sin_moradores: 'No había nadie',
  rechazo: 'No quisieron contestar',
  deshabitada: 'La vivienda está deshabitada',
  no_accesible: 'No se pudo acceder',
  volver_mas_tarde: 'Pidieron volver más tarde',
};

export type Ubicacion = {
  lat: number;
  lng: number;
  precisionM: number;
  tomadaEn: string;
} | null;

export type ValorRespuesta = string | number | boolean | string[] | null;

export type EstadoVivienda = 'pendiente' | 'en_curso' | 'relevada' | 'cerrada_sin_respuesta';

export type ViviendaLocal = {
  id: string;
  barrioId: string;
  barrioSlug: string;
  identificador: string;
  estado: EstadoVivienda;
  intentos: number;
  /** true si la agregó el encuestador en la puerta, porque no estaba en la lista. */
  agregadaEnCampo: boolean;
  actualizadaEn: string;
};

/** Una encuesta en curso o terminada, tal como vive en el celular. */
export type EncuestaLocal = {
  ticket: string;
  viviendaId: string;
  barrioId: string;
  cuestionarioVersion: number;
  /** null = todavía no aceptó el consentimiento: la encuesta no puede empezar. */
  consentimientoVersion: string | null;
  paso: number;
  respuestas: Record<string, ValorRespuesta>;
  /**
   * Bloques autoadministrados ya cerrados. Una vez sellado, el encuestador no
   * puede volver a verlos ni a abrirlos (regla 8).
   */
  bloquesSellados: string[];
  abiertaEn: string;
  cerradaEn: string | null;
  gpsApertura: Ubicacion;
  gpsCierre: Ubicacion;
  dispositivoId: string;
  /** Segundos que llevó la encuesta de verdad, no los estimados (regla 6). */
  duracionSegundos: number | null;
};

export type NoRespuestaLocal = {
  id: string;
  viviendaId: string;
  barrioId: string;
  motivo: MotivoNoRespuesta;
  intento: number;
  observacion: string;
  gps: Ubicacion;
  registradaEn: string;
  dispositivoId: string;
};

export type TipoEvento = 'encuesta' | 'no_respuesta' | 'vivienda_nueva' | 'audio' | 'contacto';

/**
 * Datos de contacto que el vecino da para que le avisen cómo sigue su pedido.
 * Es lo único identificatorio que toca el celular, va al schema `identificada` y
 * se borra del teléfono apenas el servidor confirma que lo recibió.
 */
export type ContactoLocal = {
  ticket: string;
  nombre: string;
  apellido: string;
  dniUltimos: string;
  telefono: string;
  email: string;
  domicilio: string;
  barrioNombre: string;
  creadoEn: string;
};

/** Audio de una pregunta abierta, esperando señal para subirse. */
export type AudioLocal = {
  id: string;
  ticket: string;
  preguntaId: string;
  blob: Blob;
  mime: string;
  duracionSegundos: number;
  creadoEn: string;
};

/**
 * Un evento de la cola de salida. La clave es determinística, así que encolar dos
 * veces lo mismo no duplica nada: la sincronización es idempotente (regla 9).
 */
export type EventoSync = {
  id: string;
  ticket: string;
  tipo: TipoEvento;
  payload: unknown;
  creadoEn: string;
  intentos: number;
  ultimoError: string | null;
  /** Marca de envío confirmado por el servidor. Al confirmarse, se purga. */
  confirmadoEn: string | null;
};

export type SesionCampo = {
  id: 'actual';
  dispositivoId: string;
  barrioId: string;
  barrioSlug: string;
  barrioNombre: string;
  alias: string;
  iniciadaEn: string;
};

export type CuestionarioCacheado = {
  id: 'vigente';
  version: number;
  consentimientoVersion: string;
  definicion: Cuestionario;
  descargadoEn: string;
};

export type { Cuestionario, Pregunta };
