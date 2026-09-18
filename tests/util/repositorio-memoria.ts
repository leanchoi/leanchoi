import type {
  AudioFila,
  EstadoAudio,
  EventoAuditoria,
  NuevoAudio,
  RepositorioAudios,
} from '@/lib/audio/repositorio';
import type { ResultadoTranscripcion } from '@/lib/audio/tipos';

/** Repositorio en memoria para tests: mismo contrato, sin base de datos. */
export class RepositorioEnMemoria implements RepositorioAudios {
  readonly audios = new Map<string, AudioFila>();
  readonly transcripciones = new Map<string, { id: string; texto: string }>();
  readonly auditoria: EventoAuditoria[] = [];
  /** Permite simular que la escritura de la transcripción no se confirmó. */
  fallarConfirmacion = false;

  async crear(nuevo: NuevoAudio): Promise<AudioFila> {
    const fila: AudioFila = {
      id: nuevo.id,
      ticket: nuevo.ticket,
      preguntaId: nuevo.preguntaId,
      barrioId: nuevo.barrioId ?? null,
      mime: nuevo.mime,
      bytes: nuevo.bytes,
      duracionSegundos: nuevo.duracionSegundos ?? null,
      sha256: nuevo.sha256,
      rutaRelativa: nuevo.rutaRelativa,
      estado: 'pendiente',
      intentos: 0,
      errorDetalle: null,
      creadoEn: new Date(),
      transcriptoEn: null,
      purgadoEn: null,
      purgaMotivo: null,
    };
    this.audios.set(fila.id, fila);
    return fila;
  }

  async obtener(id: string): Promise<AudioFila | null> {
    return this.audios.get(id) ?? null;
  }

  async listarPendientes(limite: number, reintentosMax: number): Promise<AudioFila[]> {
    return [...this.audios.values()]
      .filter(
        (a) =>
          a.rutaRelativa !== null &&
          (a.estado === 'pendiente' || a.estado === 'error') &&
          a.intentos < reintentosMax,
      )
      .slice(0, limite);
  }

  async listarParaPurgar(vencidosAntesDe: Date): Promise<AudioFila[]> {
    return [...this.audios.values()].filter(
      (a) =>
        a.rutaRelativa !== null &&
        (a.creadoEn.getTime() < vencidosAntesDe.getTime() || a.estado === 'transcripto'),
    );
  }

  async marcarProcesando(id: string): Promise<void> {
    const fila = this.audios.get(id);
    if (fila) this.audios.set(id, { ...fila, estado: 'procesando', intentos: fila.intentos + 1 });
  }

  async guardarTranscripcion(audio: AudioFila, resultado: ResultadoTranscripcion): Promise<string> {
    const id = crypto.randomUUID();
    this.transcripciones.set(audio.id, { id, texto: resultado.texto });
    return id;
  }

  async transcripcionAsegurada(audioId: string): Promise<boolean> {
    if (this.fallarConfirmacion) return false;
    const t = this.transcripciones.get(audioId);
    return Boolean(t && t.texto.trim().length > 0);
  }

  async marcarPurgado(id: string, estado: EstadoAudio, motivo: string): Promise<void> {
    const fila = this.audios.get(id);
    if (!fila) return;
    this.audios.set(id, {
      ...fila,
      estado,
      rutaRelativa: null,
      purgadoEn: new Date(),
      purgaMotivo: motivo,
      transcriptoEn: estado === 'transcripto' ? new Date() : fila.transcriptoEn,
    });
  }

  async marcarError(id: string, detalle: string): Promise<void> {
    const fila = this.audios.get(id);
    if (fila) this.audios.set(id, { ...fila, estado: 'error', errorDetalle: detalle });
  }

  async registrarAuditoria(evento: EventoAuditoria): Promise<void> {
    this.auditoria.push(evento);
  }

  async textoDeTranscripcion(audioId: string): Promise<string | null> {
    return this.transcripciones.get(audioId)?.texto ?? null;
  }
}
