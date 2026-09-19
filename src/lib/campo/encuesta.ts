import type { Cuestionario, Pregunta } from '@/lib/cuestionario';
import { nuevoTicket } from './ticket';
import type { EncuestaLocal, Ubicacion, ValorRespuesta } from './tipos';

/**
 * La máquina de la encuesta: pura, sin IndexedDB ni React, para poder probarla
 * entera y para que la interfaz sea solo una vista de este estado.
 *
 * Hace cumplir dos reglas:
 *   - regla 2: sin consentimiento aceptado no se avanza del primer paso;
 *   - regla 8: al cerrar un bloque autoadministrado se sella, y el encuestador no
 *     puede volver a verlo ni abrirlo.
 */

export type Paso =
  | { tipo: 'consentimiento'; indice: number }
  | { tipo: 'entrega_celular'; indice: number; bloqueId: string; titulo: string }
  | {
      tipo: 'pregunta';
      indice: number;
      bloqueId: string;
      bloqueTitulo: string;
      autoadministrada: boolean;
      pregunta: Pregunta;
    }
  | { tipo: 'devolucion_celular'; indice: number; bloqueId: string }
  | { tipo: 'cierre'; indice: number };

/**
 * Convierte el cuestionario en la secuencia de pantallas. Los bloques
 * autoadministrados quedan envueltos entre la entrega del celular al vecino y su
 * devolución, que es donde se sella el bloque.
 */
export function construirPasos(cuestionario: Cuestionario): Paso[] {
  const pasos: Paso[] = [{ tipo: 'consentimiento', indice: 0 }];

  for (const bloque of cuestionario.bloques) {
    if (bloque.autoadministrada) {
      pasos.push({
        tipo: 'entrega_celular',
        indice: pasos.length,
        bloqueId: bloque.id,
        titulo: bloque.titulo,
      });
    }
    for (const pregunta of bloque.preguntas) {
      pasos.push({
        tipo: 'pregunta',
        indice: pasos.length,
        bloqueId: bloque.id,
        bloqueTitulo: bloque.titulo,
        autoadministrada: bloque.autoadministrada,
        pregunta,
      });
    }
    if (bloque.autoadministrada) {
      pasos.push({ tipo: 'devolucion_celular', indice: pasos.length, bloqueId: bloque.id });
    }
  }

  pasos.push({ tipo: 'cierre', indice: pasos.length });
  return pasos;
}

export function pasoActual(encuesta: EncuestaLocal, pasos: Paso[]): Paso {
  const paso = pasos[Math.min(encuesta.paso, pasos.length - 1)];
  if (!paso) throw new Error('El cuestionario no tiene pasos.');
  return paso;
}

export function bloqueDelPaso(paso: Paso): string | null {
  return 'bloqueId' in paso ? paso.bloqueId : null;
}

export type OpcionesCreacion = {
  cuestionario: Cuestionario;
  viviendaId: string;
  barrioId: string;
  dispositivoId: string;
  gps?: Ubicacion;
  ahora?: Date;
};

export function crearEncuesta(opciones: OpcionesCreacion): EncuestaLocal {
  const ahora = opciones.ahora ?? new Date();
  return {
    // El ticket sale del celular, no del servidor: así se puede relevar sin señal.
    ticket: nuevoTicket(),
    viviendaId: opciones.viviendaId,
    barrioId: opciones.barrioId,
    cuestionarioVersion: opciones.cuestionario.version,
    consentimientoVersion: null,
    paso: 0,
    respuestas: {},
    bloquesSellados: [],
    abiertaEn: ahora.toISOString(),
    cerradaEn: null,
    gpsApertura: opciones.gps ?? null,
    gpsCierre: null,
    dispositivoId: opciones.dispositivoId,
    duracionSegundos: null,
  };
}

/** Regla 2: sin esto, la encuesta no arranca. */
export function aceptarConsentimiento(encuesta: EncuestaLocal, version: string): EncuestaLocal {
  return { ...encuesta, consentimientoVersion: version };
}

export function responder(
  encuesta: EncuestaLocal,
  preguntaId: string,
  valor: ValorRespuesta,
): EncuestaLocal {
  return { ...encuesta, respuestas: { ...encuesta.respuestas, [preguntaId]: valor } };
}

function respondida(encuesta: EncuestaLocal, pregunta: Pregunta): boolean {
  const valor = encuesta.respuestas[pregunta.id];
  if (valor === undefined || valor === null || valor === '') return false;
  if (Array.isArray(valor)) return valor.length > 0;
  return true;
}

export type Impedimento = { motivo: 'sin_consentimiento' | 'falta_obligatoria'; mensaje: string };

/** ¿Se puede pasar al paso siguiente? */
export function impedimentoParaAvanzar(encuesta: EncuestaLocal, pasos: Paso[]): Impedimento | null {
  const paso = pasoActual(encuesta, pasos);

  if (paso.tipo === 'consentimiento' && !encuesta.consentimientoVersion) {
    return {
      motivo: 'sin_consentimiento',
      mensaje: 'Sin el consentimiento del vecino la encuesta no puede empezar.',
    };
  }

  if (
    paso.tipo === 'pregunta' &&
    paso.pregunta.obligatoria &&
    !respondida(encuesta, paso.pregunta)
  ) {
    return { motivo: 'falta_obligatoria', mensaje: 'Esta pregunta hay que contestarla.' };
  }

  return null;
}

/**
 * Avanza un paso. Si el paso que se deja atrás es la devolución del celular,
 * sella el bloque autoadministrado: a partir de acá el encuestador no lo ve más.
 */
export function avanzar(encuesta: EncuestaLocal, pasos: Paso[]): EncuestaLocal {
  if (impedimentoParaAvanzar(encuesta, pasos)) return encuesta;

  const paso = pasoActual(encuesta, pasos);
  const sellados =
    paso.tipo === 'devolucion_celular' && !encuesta.bloquesSellados.includes(paso.bloqueId)
      ? [...encuesta.bloquesSellados, paso.bloqueId]
      : encuesta.bloquesSellados;

  return {
    ...encuesta,
    paso: Math.min(encuesta.paso + 1, pasos.length - 1),
    bloquesSellados: sellados,
  };
}

/**
 * Regla 8: no se puede volver a un paso de un bloque ya sellado. Dentro del bloque,
 * mientras el vecino lo está contestando, sí puede corregir su respuesta anterior.
 */
export function puedeRetroceder(encuesta: EncuestaLocal, pasos: Paso[]): boolean {
  if (encuesta.paso <= 0) return false;
  const destino = pasos[encuesta.paso - 1];
  if (!destino) return false;
  const bloque = bloqueDelPaso(destino);
  return !(bloque && encuesta.bloquesSellados.includes(bloque));
}

export function retroceder(encuesta: EncuestaLocal, pasos: Paso[]): EncuestaLocal {
  if (!puedeRetroceder(encuesta, pasos)) return encuesta;
  return { ...encuesta, paso: encuesta.paso - 1 };
}

export function cerrar(
  encuesta: EncuestaLocal,
  opciones?: { gps?: Ubicacion; ahora?: Date },
): EncuestaLocal {
  const ahora = opciones?.ahora ?? new Date();
  const abierta = new Date(encuesta.abiertaEn).getTime();
  return {
    ...encuesta,
    cerradaEn: ahora.toISOString(),
    gpsCierre: opciones?.gps ?? null,
    duracionSegundos: Math.max(0, Math.round((ahora.getTime() - abierta) / 1000)),
  };
}

export function progreso(
  encuesta: EncuestaLocal,
  pasos: Paso[],
): { actual: number; total: number; porcentaje: number } {
  const total = pasos.length;
  const actual = Math.min(encuesta.paso + 1, total);
  return { actual, total, porcentaje: Math.round((actual / total) * 100) };
}

/**
 * Lo que el encuestador puede ver. Las respuestas de los bloques sellados no
 * aparecen: ni en la revisión final, ni en el detalle, ni en la cola de sync.
 */
export function respuestasVisiblesParaEncuestador(
  encuesta: EncuestaLocal,
  pasos: Paso[],
): Record<string, ValorRespuesta> {
  const ocultas = new Set(
    pasos
      .filter(
        (paso): paso is Extract<Paso, { tipo: 'pregunta' }> =>
          paso.tipo === 'pregunta' && encuesta.bloquesSellados.includes(paso.bloqueId),
      )
      .map((paso) => paso.pregunta.id),
  );

  return Object.fromEntries(
    Object.entries(encuesta.respuestas).filter(([preguntaId]) => !ocultas.has(preguntaId)),
  );
}

/** ¿La encuesta está lista para cerrarse? */
export function estaCompleta(encuesta: EncuestaLocal, pasos: Paso[]): boolean {
  if (!encuesta.consentimientoVersion) return false;
  return pasos.every((paso) => {
    if (paso.tipo !== 'pregunta') return true;
    return !paso.pregunta.obligatoria || respondida(encuesta, paso.pregunta);
  });
}
