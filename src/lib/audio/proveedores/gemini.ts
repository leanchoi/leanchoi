import { ErrorTranscripcion } from '../tipos';
import type {
  EntradaTranscripcion,
  ResultadoTranscripcion,
  TranscriptionProvider,
  VerificacionProveedor,
} from '../tipos';

/**
 * Desgrabación contra la API de Gemini (Google Generative Language API).
 *
 * ESTE ES EL ÚNICO ARCHIVO QUE HAY QUE TOCAR PARA AJUSTAR LA CONEXIÓN.
 * La guía completa —incluido qué verificar contra la documentación vigente de
 * Google— está en `docs/audio-y-transcripcion.md`.
 *
 * Soporta dos formas de request, seleccionables con `GEMINI_ESTILO`:
 *
 *  - `interactions`     POST {base}/interactions
 *                       Cuerpo: { model, input: [{ type: 'audio', data|mime_type }] }
 *                       Es la forma de los modelos dedicados de transcripción.
 *
 *  - `generate_content` POST {base}/models/{modelo}:generateContent
 *                       Cuerpo: { contents: [{ parts: [{ text }, { inline_data }] }] }
 *                       Es la forma clásica, multimodal.
 *
 * En ambos casos la autenticación es la cabecera `x-goog-api-key`, el audio va en
 * base64 dentro del JSON, y el request completo no puede superar los 20 MB (por
 * encima de eso hay que usar la Files API: ver la documentación).
 */

export type EstiloGemini = 'interactions' | 'generate_content';

export type ConfigGemini = {
  apiKey: string | undefined;
  modelo: string;
  base: string;
  estilo: EstiloGemini;
  prompt: string;
  timeoutMs: number;
  idioma?: string | undefined;
};

/** Formatos que Google documenta como soportados para entrada de audio. */
export const MIMES_GEMINI = [
  'audio/wav',
  'audio/mp3',
  'audio/mpeg',
  'audio/aiff',
  'audio/aac',
  'audio/ogg',
  'audio/flac',
] as const;

export class ProveedorGemini implements TranscriptionProvider {
  readonly nombre = 'gemini';
  readonly mimesSoportados = MIMES_GEMINI;
  readonly requiereRed = true;

  constructor(private readonly config: ConfigGemini) {}

  verificarConfiguracion(): VerificacionProveedor {
    const problemas: string[] = [];
    if (!this.config.apiKey) problemas.push('Falta GEMINI_API_KEY.');
    if (!this.config.modelo) problemas.push('Falta GEMINI_MODEL.');
    if (!/^https:\/\//.test(this.config.base)) {
      problemas.push('GEMINI_API_BASE tiene que ser una URL https.');
    }
    return problemas.length ? { ok: false, problemas } : { ok: true };
  }

  private url(): string {
    const base = this.config.base.replace(/\/+$/, '');
    return this.config.estilo === 'interactions'
      ? `${base}/interactions`
      : `${base}/models/${encodeURIComponent(this.config.modelo)}:generateContent`;
  }

  private cuerpo(entrada: EntradaTranscripcion): unknown {
    const base64 = Buffer.from(entrada.bytes).toString('base64');
    const mime = entrada.mime.split(';')[0]?.trim() ?? entrada.mime;

    if (this.config.estilo === 'interactions') {
      return {
        model: this.config.modelo,
        input: [
          { type: 'audio', data: base64, mime_type: mime },
          { type: 'text', text: this.config.prompt },
        ],
        ...(entrada.vocabulario?.length
          ? {
              generation_config: {
                transcription_config: { custom_vocabulary: [...entrada.vocabulario] },
              },
            }
          : {}),
      };
    }

    return {
      contents: [
        {
          role: 'user',
          parts: [{ text: this.config.prompt }, { inline_data: { mime_type: mime, data: base64 } }],
        },
      ],
      generationConfig: { temperature: 0 },
    };
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

    const controlador = new AbortController();
    const temporizador = setTimeout(() => controlador.abort(), this.config.timeoutMs);
    señal?.addEventListener('abort', () => controlador.abort(), { once: true });

    let respuesta: Response;
    try {
      respuesta = await fetch(this.url(), {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-goog-api-key': this.config.apiKey as string,
        },
        body: JSON.stringify(this.cuerpo(entrada)),
        signal: controlador.signal,
      });
    } catch (error) {
      throw new ErrorTranscripcion('red', `No se pudo contactar a Gemini: ${mensaje(error)}`, {
        reintentable: true,
      });
    } finally {
      clearTimeout(temporizador);
    }

    const textoCrudo = await respuesta.text();
    if (!respuesta.ok) {
      throw new ErrorTranscripcion(
        respuesta.status >= 500 || respuesta.status === 429 ? 'red' : 'rechazado_por_proveedor',
        `Gemini respondió ${respuesta.status}: ${recortar(textoCrudo)}`,
        { reintentable: respuesta.status >= 500 || respuesta.status === 429 },
      );
    }

    let json: unknown;
    try {
      json = JSON.parse(textoCrudo);
    } catch {
      throw new ErrorTranscripcion('respuesta_invalida', 'Gemini devolvió algo que no es JSON.', {
        detalle: { muestra: recortar(textoCrudo) },
      });
    }

    const texto = extraerTexto(json);
    if (!texto) {
      throw new ErrorTranscripcion(
        'vacio',
        'Gemini respondió sin texto de transcripción. Revisá la forma de la respuesta en docs/audio-y-transcripcion.md.',
        { detalle: { claves: Object.keys(json as object) } },
      );
    }

    return {
      texto,
      idioma: this.config.idioma ?? 'es-AR',
      proveedor: this.nombre,
      modelo: this.config.modelo,
      metadata: resumirRespuesta(json),
    };
  }
}

/**
 * Extractor tolerante. Las dos formas conocidas son:
 *   generateContent -> candidates[0].content.parts[].text
 *   interactions    -> output[].content[].text  /  output_text  /  text
 * Si Google vuelve a cambiar la forma, se busca en profundidad la cadena de texto
 * más larga bajo una clave plausible. Este es el punto a ajustar, no el resto.
 */
export function extraerTexto(json: unknown): string {
  const raiz = json as Record<string, unknown>;

  const candidatos = raiz?.['candidates'];
  if (Array.isArray(candidatos)) {
    const partes = (candidatos[0] as Record<string, unknown> | undefined)?.['content'] as
      Record<string, unknown> | undefined;
    const lista = partes?.['parts'];
    if (Array.isArray(lista)) {
      const texto = lista
        .map((p) => (p as Record<string, unknown>)['text'])
        .filter((t): t is string => typeof t === 'string')
        .join('')
        .trim();
      if (texto) return texto;
    }
  }

  for (const clave of ['output_text', 'text', 'transcript', 'transcription']) {
    const valor = raiz?.[clave];
    if (typeof valor === 'string' && valor.trim()) return valor.trim();
  }

  const salida = raiz?.['output'] ?? raiz?.['outputs'] ?? raiz?.['results'];
  if (Array.isArray(salida)) {
    const texto = salida
      .flatMap((item) => {
        const registro = item as Record<string, unknown>;
        const contenido = registro['content'];
        if (Array.isArray(contenido)) {
          return contenido
            .map((c) => (c as Record<string, unknown>)['text'])
            .filter((t): t is string => typeof t === 'string');
        }
        return ['text', 'transcript']
          .map((k) => registro[k])
          .filter((t): t is string => typeof t === 'string');
      })
      .join(' ')
      .trim();
    if (texto) return texto;
  }

  return buscarTextoProfundo(json) ?? '';
}

const CLAVES_TEXTO = new Set(['text', 'transcript', 'transcription', 'content', 'output_text']);

function buscarTextoProfundo(valor: unknown, profundidad = 0): string | null {
  if (profundidad > 6) return null;
  if (Array.isArray(valor)) {
    const encontrados = valor
      .map((v) => buscarTextoProfundo(v, profundidad + 1))
      .filter((t): t is string => Boolean(t));
    return encontrados.length ? encontrados.join(' ') : null;
  }
  if (valor && typeof valor === 'object') {
    let mejor: string | null = null;
    for (const [clave, v] of Object.entries(valor as Record<string, unknown>)) {
      if (CLAVES_TEXTO.has(clave) && typeof v === 'string' && v.trim()) {
        if (!mejor || v.length > mejor.length) mejor = v.trim();
      } else {
        const anidado = buscarTextoProfundo(v, profundidad + 1);
        if (anidado && (!mejor || anidado.length > mejor.length)) mejor = anidado;
      }
    }
    return mejor;
  }
  return null;
}

/** Metadatos útiles para depurar, sin texto completo ni audio. */
function resumirRespuesta(json: unknown): Record<string, unknown> {
  const raiz = json as Record<string, unknown>;
  const resumen: Record<string, unknown> = { claves: Object.keys(raiz ?? {}) };
  for (const clave of ['usageMetadata', 'usage', 'modelVersion', 'model', 'responseId']) {
    if (raiz?.[clave] !== undefined) resumen[clave] = raiz[clave];
  }
  return resumen;
}

function recortar(texto: string, largo = 300): string {
  return texto.length > largo ? `${texto.slice(0, largo)}…` : texto;
}

function mensaje(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
