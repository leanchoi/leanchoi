import type { BaseCampo } from './db';
import type { EventoSync, TipoEvento } from './tipos';

/**
 * Cola de salida. Es el corazón del offline (regla 9):
 *
 *   - la clave de cada evento es determinística, así que encolar dos veces lo mismo
 *     no duplica nada;
 *   - **nunca se sobrescribe** un evento ya encolado: si vuelve a encolarse, se
 *     conserva el original;
 *   - un evento solo desaparece cuando el servidor confirma que lo recibió, y ahí
 *     se purgan también los datos del vecino que estaban en el celular.
 */

export function idEvento(ticket: string, tipo: TipoEvento, sufijo?: string | number): string {
  return sufijo === undefined ? `${ticket}:${tipo}` : `${ticket}:${tipo}:${sufijo}`;
}

export type EntradaEvento = {
  ticket: string;
  tipo: TipoEvento;
  payload: unknown;
  /** Distingue eventos del mismo tipo para el mismo ticket (p. ej. el intento). */
  sufijo?: string | number;
  ahora?: Date;
};

/** Encola sin duplicar y sin pisar: si ya estaba, no toca nada. */
export async function encolar(base: BaseCampo, entrada: EntradaEvento): Promise<EventoSync> {
  const id = idEvento(entrada.ticket, entrada.tipo, entrada.sufijo);
  const existente = await base.outbox.get(id);
  if (existente) return existente;

  const evento: EventoSync = {
    id,
    ticket: entrada.ticket,
    tipo: entrada.tipo,
    payload: entrada.payload,
    creadoEn: (entrada.ahora ?? new Date()).toISOString(),
    intentos: 0,
    ultimoError: null,
    confirmadoEn: null,
  };

  await base.outbox.add(evento);
  return evento;
}

export async function pendientes(base: BaseCampo, limite = 50): Promise<EventoSync[]> {
  const todos = await base.outbox.orderBy('creadoEn').toArray();
  return todos.filter((evento) => evento.confirmadoEn === null).slice(0, limite);
}

export async function contarPendientes(base: BaseCampo): Promise<number> {
  return (await pendientes(base, Number.MAX_SAFE_INTEGER)).length;
}

export async function marcarConfirmado(
  base: BaseCampo,
  id: string,
  ahora = new Date(),
): Promise<void> {
  const evento = await base.outbox.get(id);
  if (!evento) return;
  await base.outbox.put({ ...evento, confirmadoEn: ahora.toISOString(), ultimoError: null });
}

export async function registrarFallo(base: BaseCampo, id: string, error: string): Promise<void> {
  const evento = await base.outbox.get(id);
  if (!evento) return;
  await base.outbox.put({
    ...evento,
    intentos: evento.intentos + 1,
    ultimoError: error.slice(0, 300),
  });
}

/**
 * Purga lo confirmado: el evento y, con él, los datos del vecino que quedaban en el
 * celular. Solo se borra lo que el servidor dijo que ya tiene.
 */
export async function purgarConfirmados(base: BaseCampo): Promise<number> {
  const confirmados = (await base.outbox.toArray()).filter((e) => e.confirmadoEn !== null);

  for (const evento of confirmados) {
    if (evento.tipo === 'encuesta') await base.encuestas.delete(evento.ticket);
    if (evento.tipo === 'audio')
      await base.audios.delete(String((evento.payload as { id: string }).id));
    if (evento.tipo === 'no_respuesta') {
      const id = evento.id.split(':').slice(2).join(':');
      if (id) await base.noRespuestas.delete(id);
    }
    await base.outbox.delete(evento.id);
  }

  return confirmados.length;
}

export type ResultadoEnvio = {
  confirmados: string[];
  errores: { id: string; error: string }[];
};

export type Transporte = (eventos: EventoSync[]) => Promise<ResultadoEnvio>;

export type ResumenSync = {
  intentados: number;
  confirmados: number;
  fallados: number;
  purgados: number;
};

/**
 * Intenta enviar lo pendiente. El transporte se inyecta para poder probar la cola
 * sin red y para que la app decida cómo hablar con el servidor.
 */
export async function sincronizar(
  base: BaseCampo,
  transporte: Transporte,
  opciones?: { limite?: number; ahora?: Date },
): Promise<ResumenSync> {
  const lote = await pendientes(base, opciones?.limite ?? 25);
  if (lote.length === 0) return { intentados: 0, confirmados: 0, fallados: 0, purgados: 0 };

  let resultado: ResultadoEnvio;
  try {
    resultado = await transporte(lote);
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : String(error);
    for (const evento of lote) await registrarFallo(base, evento.id, mensaje);
    return { intentados: lote.length, confirmados: 0, fallados: lote.length, purgados: 0 };
  }

  for (const id of resultado.confirmados) await marcarConfirmado(base, id, opciones?.ahora);
  for (const { id, error } of resultado.errores) await registrarFallo(base, id, error);

  const purgados = await purgarConfirmados(base);

  return {
    intentados: lote.length,
    confirmados: resultado.confirmados.length,
    fallados: resultado.errores.length,
    purgados,
  };
}
