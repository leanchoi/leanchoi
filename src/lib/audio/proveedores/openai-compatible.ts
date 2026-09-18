import { ErrorTranscripcion } from '../tipos';
import type {
  EntradaTranscripcion,
  ResultadoTranscripcion,
  TranscriptionProvider,
  VerificacionProveedor,
} from '../tipos';

/**
 * Desgrabación contra cualquier servicio que hable la API de OpenAI
 * (`POST {base}/audio/transcriptions`, multipart). Sirve para OpenAI, para
 * servicios compatibles y —lo más interesante para un municipio— para un Whisper
 * autohospedado: en ese caso el audio nunca sale del servidor propio.
 *
 * Es la alternativa "u otra cosa" al proveedor de Gemini: misma interfaz, se cambia
 * con una variable de entorno.
 */
export type ConfigOpenAICompatible = {
  baseUrl: string | undefined;
  apiKey: string | undefined;
  modelo: string;
  timeoutMs: number;
  idioma?: string | undefined;
};

export class ProveedorOpenAICompatible implements TranscriptionProvider {
  readonly nombre = 'openai_compatible';
  readonly mimesSoportados = ['*'] as const;
  readonly requiereRed = true;

  constructor(private readonly config: ConfigOpenAICompatible) {}

  verificarConfiguracion(): VerificacionProveedor {
    const problemas: string[] = [];
    if (!this.config.baseUrl) problemas.push('Falta STT_OPENAI_BASE_URL.');
    if (!this.config.modelo) problemas.push('Falta STT_OPENAI_MODEL.');
    return problemas.length ? { ok: false, problemas } : { ok: true };
  }

  async transcribir(
    entrada: EntradaTranscripcion,
    señal?: AbortSignal,
  ): Promise<ResultadoTranscripcion> {
    const verificacion = this.verificarConfiguracion();
    if (!verificacion.ok) {
      throw new ErrorTranscripcion('configuracion', verificacion.problemas.join(' '), {
        reintentable: false,
      });
    }

    const formulario = new FormData();
    const mime = entrada.mime.split(';')[0]?.trim() ?? entrada.mime;
    formulario.append(
      'file',
      new Blob([new Uint8Array(entrada.bytes)], { type: mime }),
      `${entrada.audioId}`,
    );
    formulario.append('model', this.config.modelo);
    formulario.append('response_format', 'json');
    if (entrada.idiomaSugerido)
      formulario.append('language', entrada.idiomaSugerido.split('-')[0] ?? 'es');
    if (entrada.vocabulario?.length) formulario.append('prompt', entrada.vocabulario.join(', '));

    const controlador = new AbortController();
    const temporizador = setTimeout(() => controlador.abort(), this.config.timeoutMs);
    señal?.addEventListener('abort', () => controlador.abort(), { once: true });

    const url = `${(this.config.baseUrl as string).replace(/\/+$/, '')}/audio/transcriptions`;

    let respuesta: Response;
    try {
      respuesta = await fetch(url, {
        method: 'POST',
        headers: this.config.apiKey ? { authorization: `Bearer ${this.config.apiKey}` } : {},
        body: formulario,
        signal: controlador.signal,
      });
    } catch (error) {
      throw new ErrorTranscripcion(
        'red',
        `No se pudo contactar al servicio de desgrabación: ${error instanceof Error ? error.message : String(error)}`,
        { reintentable: true },
      );
    } finally {
      clearTimeout(temporizador);
    }

    const crudo = await respuesta.text();
    if (!respuesta.ok) {
      throw new ErrorTranscripcion(
        respuesta.status >= 500 || respuesta.status === 429 ? 'red' : 'rechazado_por_proveedor',
        `El servicio respondió ${respuesta.status}: ${crudo.slice(0, 300)}`,
        { reintentable: respuesta.status >= 500 || respuesta.status === 429 },
      );
    }

    let texto = '';
    try {
      const json = JSON.parse(crudo) as { text?: unknown };
      texto = typeof json.text === 'string' ? json.text.trim() : '';
    } catch {
      texto = crudo.trim();
    }

    if (!texto) {
      throw new ErrorTranscripcion('vacio', 'El servicio devolvió una transcripción vacía.');
    }

    return {
      texto,
      idioma: entrada.idiomaSugerido ?? this.config.idioma ?? 'es-AR',
      proveedor: this.nombre,
      modelo: this.config.modelo,
      metadata: { endpoint: url },
    };
  }
}
