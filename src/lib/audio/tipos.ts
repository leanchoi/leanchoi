/**
 * Contratos del módulo de audio.
 *
 * Regla que ordena todo el módulo: **el audio es temporal**. Existe solo hasta que
 * la transcripción queda asegurada (escrita y releída de la base) o hasta que vence
 * el TTL. Después desaparece del sistema y queda únicamente el texto, los metadatos
 * y el rastro en `audit_log`.
 */

/** Lo que recibe un proveedor para desgrabar. Nunca se le pasa dato del vecino. */
export type EntradaTranscripcion = {
  audioId: string;
  bytes: Uint8Array;
  mime: string;
  duracionSegundos?: number | undefined;
  /** BCP-47. En este operativo, siempre español rioplatense. */
  idiomaSugerido?: string | undefined;
  /** Términos del dominio (nombres de barrios, jerga local) para mejorar el reconocimiento. */
  vocabulario?: readonly string[] | undefined;
};

export type ResultadoTranscripcion = {
  texto: string;
  idioma?: string | undefined;
  proveedor: string;
  modelo?: string | undefined;
  /** Respuesta cruda útil para depurar. NUNCA incluye el audio ni base64. */
  metadata?: Record<string, unknown> | undefined;
};

export type VerificacionProveedor = { ok: true } | { ok: false; problemas: string[] };

/**
 * Un proveedor de desgrabación. Implementar esta interfaz es todo lo que hace falta
 * para enchufar Gemini, un Whisper autohospedado o cualquier otro servicio.
 * Ver `docs/audio-y-transcripcion.md`.
 */
export interface TranscriptionProvider {
  /** Nombre corto y estable: se guarda en `transcripciones.proveedor`. */
  readonly nombre: string;
  /** MIMEs que acepta el servicio. `['*']` significa "cualquiera". */
  readonly mimesSoportados: readonly string[];
  /** false en el stub: permite correr el sistema completo sin red. */
  readonly requiereRed: boolean;
  /** Valida la configuración sin gastar una llamada real. */
  verificarConfiguracion(): VerificacionProveedor;
  transcribir(entrada: EntradaTranscripcion, señal?: AbortSignal): Promise<ResultadoTranscripcion>;
}

/** Error de desgrabación con causa tipificada, para decidir si se reintenta. */
export class ErrorTranscripcion extends Error {
  readonly causa:
    | 'configuracion'
    | 'formato_no_soportado'
    | 'red'
    | 'respuesta_invalida'
    | 'rechazado_por_proveedor'
    | 'vacio';
  readonly reintentable: boolean;
  readonly detalle: Record<string, unknown> | undefined;

  constructor(
    causa: ErrorTranscripcion['causa'],
    mensaje: string,
    opciones?: { reintentable?: boolean; detalle?: Record<string, unknown> },
  ) {
    super(mensaje);
    this.name = 'ErrorTranscripcion';
    this.causa = causa;
    this.reintentable = opciones?.reintentable ?? (causa === 'red' || causa === 'vacio');
    this.detalle = opciones?.detalle;
  }
}

export function soportaMime(proveedor: TranscriptionProvider, mime: string): boolean {
  if (proveedor.mimesSoportados.includes('*')) return true;
  const base = mime.split(';')[0]?.trim().toLowerCase() ?? '';
  return proveedor.mimesSoportados.some((m) => m.toLowerCase() === base);
}
