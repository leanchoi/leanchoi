import { v7 as uuidv7 } from 'uuid';
import type { Cuestionario } from '@/lib/cuestionario';
import type { BaseCampo } from './db';
import { cerrar, construirPasos, crearEncuesta } from './encuesta';
import { encolar } from './outbox';
import { MOTIVOS_NO_RESPUESTA } from './tipos';
import type {
  AudioLocal,
  CuestionarioCacheado,
  EncuestaLocal,
  MotivoNoRespuesta,
  NoRespuestaLocal,
  SesionCampo,
  Ubicacion,
  ViviendaLocal,
} from './tipos';

/**
 * Operaciones de la app de campo sobre la base local.
 *
 * Regla 3: una vivienda solo sale de la lista de pendientes por dos caminos, y los
 * dos dejan registro: encuesta completa o no-respuesta con motivo tipificado y
 * número de intento. No existe ninguna función para "saltearla".
 */

export async function guardarSesion(base: BaseCampo, sesion: SesionCampo): Promise<void> {
  await base.sesion.put(sesion);
}

export async function obtenerSesion(base: BaseCampo): Promise<SesionCampo | undefined> {
  return base.sesion.get('actual');
}

export async function guardarCuestionario(
  base: BaseCampo,
  definicion: Cuestionario,
  ahora = new Date(),
): Promise<CuestionarioCacheado> {
  const cacheado: CuestionarioCacheado = {
    id: 'vigente',
    version: definicion.version,
    consentimientoVersion: definicion.consentimiento.version,
    definicion,
    descargadoEn: ahora.toISOString(),
  };
  await base.cuestionario.put(cacheado);
  return cacheado;
}

export async function obtenerCuestionario(
  base: BaseCampo,
): Promise<CuestionarioCacheado | undefined> {
  return base.cuestionario.get('vigente');
}

export async function guardarViviendas(base: BaseCampo, viviendas: ViviendaLocal[]): Promise<void> {
  // No pisa el estado local: lo que se relevó en el celular manda sobre la lista.
  for (const vivienda of viviendas) {
    const existente = await base.viviendas.get(vivienda.id);
    if (existente) continue;
    await base.viviendas.put(vivienda);
  }
}

export async function listarViviendas(
  base: BaseCampo,
  barrioSlug: string,
): Promise<ViviendaLocal[]> {
  const todas = await base.viviendas.where('barrioSlug').equals(barrioSlug).toArray();
  return todas.sort((a, b) => a.identificador.localeCompare(b.identificador, 'es'));
}

/** Una casa que no estaba en la lista y aparece en la recorrida. */
export async function agregarVivienda(
  base: BaseCampo,
  datos: { barrioId: string; barrioSlug: string; identificador: string },
  ahora = new Date(),
): Promise<ViviendaLocal> {
  const vivienda: ViviendaLocal = {
    id: uuidv7(),
    barrioId: datos.barrioId,
    barrioSlug: datos.barrioSlug,
    identificador: datos.identificador.trim(),
    estado: 'pendiente',
    intentos: 0,
    agregadaEnCampo: true,
    actualizadaEn: ahora.toISOString(),
  };
  await base.viviendas.put(vivienda);
  await encolar(base, {
    ticket: vivienda.id,
    tipo: 'vivienda_nueva',
    payload: vivienda,
    ahora,
  });
  return vivienda;
}

async function actualizarVivienda(
  base: BaseCampo,
  id: string,
  cambio: Partial<ViviendaLocal>,
  ahora: Date,
): Promise<void> {
  const vivienda = await base.viviendas.get(id);
  if (!vivienda) return;
  await base.viviendas.put({ ...vivienda, ...cambio, actualizadaEn: ahora.toISOString() });
}

// ---------------------------------------------------------------- encuestas

export async function iniciarEncuesta(
  base: BaseCampo,
  datos: {
    vivienda: ViviendaLocal;
    cuestionario: Cuestionario;
    dispositivoId: string;
    gps?: Ubicacion;
  },
  ahora = new Date(),
): Promise<EncuestaLocal> {
  const encuesta = crearEncuesta({
    cuestionario: datos.cuestionario,
    viviendaId: datos.vivienda.id,
    barrioId: datos.vivienda.barrioId,
    dispositivoId: datos.dispositivoId,
    gps: datos.gps ?? null,
    ahora,
  });

  await base.encuestas.put(encuesta);
  await actualizarVivienda(base, datos.vivienda.id, { estado: 'en_curso' }, ahora);
  return encuesta;
}

/** Se llama en CADA paso: si el celular se apaga, al volver se retoma acá. */
export async function guardarAvance(base: BaseCampo, encuesta: EncuestaLocal): Promise<void> {
  await base.encuestas.put(encuesta);
}

export async function obtenerEncuesta(
  base: BaseCampo,
  ticket: string,
): Promise<EncuestaLocal | undefined> {
  return base.encuestas.get(ticket);
}

/** Encuesta empezada y no terminada para esa vivienda, si quedó alguna a medias. */
export async function encuestaEnCurso(
  base: BaseCampo,
  viviendaId: string,
): Promise<EncuestaLocal | undefined> {
  const todas = await base.encuestas.where('viviendaId').equals(viviendaId).toArray();
  return todas.find((encuesta) => encuesta.cerradaEn === null);
}

export class EncuestaIncompleta extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'EncuestaIncompleta';
  }
}

export async function cerrarEncuesta(
  base: BaseCampo,
  encuesta: EncuestaLocal,
  datos: { cuestionario: Cuestionario; gps?: Ubicacion },
  ahora = new Date(),
): Promise<EncuestaLocal> {
  if (!encuesta.consentimientoVersion) {
    throw new EncuestaIncompleta('No se puede cerrar una encuesta sin consentimiento registrado.');
  }

  const cerrada = cerrar(encuesta, { gps: datos.gps ?? null, ahora });
  await base.encuestas.put(cerrada);
  await actualizarVivienda(base, encuesta.viviendaId, { estado: 'relevada' }, ahora);

  // El evento es lo que viaja al servidor. Se encola una sola vez por ticket.
  await encolar(base, {
    ticket: cerrada.ticket,
    tipo: 'encuesta',
    payload: {
      ...cerrada,
      pasosTotales: construirPasos(datos.cuestionario).length,
    },
    ahora,
  });

  return cerrada;
}

// ---------------------------------------------------------------- no-respuesta

export class MotivoInvalido extends Error {
  constructor(motivo: string) {
    super(`"${motivo}" no es un motivo de no-respuesta válido.`);
    this.name = 'MotivoInvalido';
  }
}

/**
 * Regla 3: cerrar una vivienda sin encuesta EXIGE motivo tipificado y número de
 * intento. Los motivos son cinco y no hay un sexto camino.
 */
export async function registrarNoRespuesta(
  base: BaseCampo,
  datos: {
    vivienda: ViviendaLocal;
    motivo: MotivoNoRespuesta;
    observacion?: string;
    dispositivoId: string;
    gps?: Ubicacion;
  },
  ahora = new Date(),
): Promise<NoRespuestaLocal> {
  if (!MOTIVOS_NO_RESPUESTA.includes(datos.motivo)) {
    throw new MotivoInvalido(String(datos.motivo));
  }

  const intento = datos.vivienda.intentos + 1;
  const registro: NoRespuestaLocal = {
    id: uuidv7(),
    viviendaId: datos.vivienda.id,
    barrioId: datos.vivienda.barrioId,
    motivo: datos.motivo,
    intento,
    observacion: datos.observacion?.trim() ?? '',
    gps: datos.gps ?? null,
    registradaEn: ahora.toISOString(),
    dispositivoId: datos.dispositivoId,
  };

  await base.noRespuestas.put(registro);

  // "Volver más tarde" deja la vivienda pendiente: se vuelve, y queda el intento.
  await actualizarVivienda(
    base,
    datos.vivienda.id,
    {
      intentos: intento,
      estado: datos.motivo === 'volver_mas_tarde' ? 'pendiente' : 'cerrada_sin_respuesta',
    },
    ahora,
  );

  await encolar(base, {
    ticket: registro.id,
    tipo: 'no_respuesta',
    payload: registro,
    sufijo: intento,
    ahora,
  });

  return registro;
}

export type ResumenBarrio = {
  total: number;
  relevadas: number;
  cerradasSinRespuesta: number;
  pendientes: number;
  enCurso: number;
};

export async function resumenDelBarrio(
  base: BaseCampo,
  barrioSlug: string,
): Promise<ResumenBarrio> {
  const viviendas = await listarViviendas(base, barrioSlug);
  return {
    total: viviendas.length,
    relevadas: viviendas.filter((v) => v.estado === 'relevada').length,
    cerradasSinRespuesta: viviendas.filter((v) => v.estado === 'cerrada_sin_respuesta').length,
    pendientes: viviendas.filter((v) => v.estado === 'pendiente').length,
    enCurso: viviendas.filter((v) => v.estado === 'en_curso').length,
  };
}

// ---------------------------------------------------------------- audio

/**
 * Guarda el audio de una pregunta abierta en el celular y lo pone en la cola.
 * Se sube cuando hay señal; una vez confirmado, el archivo se borra del teléfono
 * (y del servidor, apenas se desgraba: ver docs/audio-y-transcripcion.md).
 */
export async function guardarAudio(
  base: BaseCampo,
  datos: { ticket: string; preguntaId: string; blob: Blob; mime: string; duracionSegundos: number },
  ahora = new Date(),
): Promise<AudioLocal> {
  const audio: AudioLocal = {
    id: uuidv7(),
    ticket: datos.ticket,
    preguntaId: datos.preguntaId,
    blob: datos.blob,
    mime: datos.mime,
    duracionSegundos: datos.duracionSegundos,
    creadoEn: ahora.toISOString(),
  };

  await base.audios.put(audio);
  await encolar(base, {
    ticket: datos.ticket,
    tipo: 'audio',
    sufijo: datos.preguntaId,
    // El payload viaja liviano: el archivo se lee de la base al subirlo.
    payload: {
      id: audio.id,
      ticket: audio.ticket,
      preguntaId: audio.preguntaId,
      mime: audio.mime,
      duracionSegundos: audio.duracionSegundos,
    },
    ahora,
  });

  return audio;
}

export async function audioDePregunta(
  base: BaseCampo,
  ticket: string,
  preguntaId: string,
): Promise<AudioLocal | undefined> {
  const todos = await base.audios.where('ticket').equals(ticket).toArray();
  return todos.find((audio) => audio.preguntaId === preguntaId);
}
