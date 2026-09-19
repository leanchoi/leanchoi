/**
 * Contratos del módulo de codificación: agrupar en temas las respuestas abiertas
 * que los vecinos contestaron hablando, ponerle nombre a cada tema y guardar una
 * cita textual que lo represente.
 *
 * Dos reglas ordenan el módulo:
 *
 *  1. **La cita es literal o no es.** Si el texto de la cita no aparece tal cual en
 *     la transcripción, se descarta. Un informe que se cuelga en la sede vecinal no
 *     puede tener frases que el vecino nunca dijo.
 *  2. **Todo esto es opcional.** Con `FEATURE_CLUSTERING` apagado el sistema funciona
 *     completo: se sigue encuestando, sincronizando, derivando y devolviendo.
 */

/** Un texto a codificar. Nunca lleva dato de identidad: solo ticket y barrio. */
export type FragmentoACodificar = {
  transcripcionId: string;
  ticket: string;
  preguntaId: string;
  barrioId: string | null;
  texto: string;
};

export type EntradaClustering = {
  /** Para qué pregunta abierta se agrupa. Los temas dependen de la pregunta. */
  preguntaId: string;
  /** Enunciado de la pregunta, si se conoce: ayuda a nombrar los temas. */
  preguntaTexto?: string | undefined;
  fragmentos: readonly FragmentoACodificar[];
  /** Tope de temas. Más de una docena no se lee en una carilla A4. */
  maximoClusters?: number | undefined;
};

export type MiembroCluster = {
  transcripcionId: string;
  /**
   * Fragmento textual de esa transcripción que representa al tema. Debe aparecer
   * literalmente en el texto: el pipeline lo verifica y descarta lo que no.
   */
  citaTextual?: string | undefined;
};

export type ClusterTematico = {
  /** Identificador estable y legible del tema: `alumbrado`, `basura`, `otros`. */
  clusterId: string;
  /** Nombre corto en castellano, tal como se muestra en el tablero. */
  etiqueta: string;
  miembros: readonly MiembroCluster[];
};

export type ResultadoClustering = {
  clusters: readonly ClusterTematico[];
  proveedor: string;
  modelo?: string | undefined;
};

export type VerificacionProveedor = { ok: true } | { ok: false; problemas: string[] };

/**
 * Un proveedor de agrupamiento temático. Implementar esta interfaz es todo lo que
 * hace falta para enchufar otro servicio. Ver `docs/codificacion.md`.
 */
export interface ClusteringProvider {
  /** Nombre corto y estable: se guarda en `codificaciones.proveedor`. */
  readonly nombre: string;
  /** false en el stub: permite correr el sistema completo sin red. */
  readonly requiereRed: boolean;
  /** Valida la configuración sin gastar una llamada real. */
  verificarConfiguracion(): VerificacionProveedor;
  agrupar(entrada: EntradaClustering, señal?: AbortSignal): Promise<ResultadoClustering>;
}

/** Error de codificación con causa tipificada, para decidir si se reintenta. */
export class ErrorClustering extends Error {
  readonly causa:
    | 'configuracion'
    | 'red'
    | 'respuesta_invalida'
    | 'rechazado_por_proveedor'
    | 'vacio';
  readonly reintentable: boolean;
  readonly detalle: Record<string, unknown> | undefined;

  constructor(
    causa: ErrorClustering['causa'],
    mensaje: string,
    opciones?: { reintentable?: boolean; detalle?: Record<string, unknown> },
  ) {
    super(mensaje);
    this.name = 'ErrorClustering';
    this.causa = causa;
    this.reintentable = opciones?.reintentable ?? (causa === 'red' || causa === 'vacio');
    this.detalle = opciones?.detalle;
  }
}

/**
 * Normaliza para comparar: espacios colapsados, minúsculas, sin acentos y sin
 * comillas ni puntuación de borde. Lo justo para que una cita bien copiada no se
 * caiga por un espacio de más, y nada más que eso.
 */
export function normalizarParaCotejo(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[«»"“”'‘’]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** La cita vale solo si aparece literalmente en la transcripción. */
export function esCitaTextual(cita: string, transcripcion: string): boolean {
  const c = normalizarParaCotejo(cita);
  if (c.length < 10) return false;
  return normalizarParaCotejo(transcripcion).includes(c);
}
