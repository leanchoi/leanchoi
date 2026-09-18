import { afterEach, describe, expect, it, vi } from 'vitest';
import { extraerTexto, ProveedorGemini } from '@/lib/audio/proveedores/gemini';
import { ProveedorOpenAICompatible } from '@/lib/audio/proveedores/openai-compatible';
import { ProveedorStub } from '@/lib/audio/proveedores/stub';
import { ErrorTranscripcion } from '@/lib/audio/tipos';

const BYTES = new Uint8Array([10, 20, 30, 40]);
const ENTRADA = { audioId: 'a1', bytes: BYTES, mime: 'audio/ogg', idiomaSugerido: 'es-AR' };

function respuesta(cuerpo: unknown, status = 200): Response {
  return new Response(typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo), { status });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('proveedor stub', () => {
  it('es determinístico y no necesita red', async () => {
    const proveedor = new ProveedorStub();
    expect(proveedor.requiereRed).toBe(false);

    const a = await proveedor.transcribir(ENTRADA);
    const b = await proveedor.transcribir(ENTRADA);
    const c = await proveedor.transcribir({ ...ENTRADA, bytes: new Uint8Array([99, 98, 97]) });

    expect(a.texto).toBe(b.texto);
    expect(a.texto).not.toBe(c.texto);
    expect(a.texto.length).toBeGreaterThan(10);
  });
});

function gemini(estilo: 'interactions' | 'generate_content', opciones?: { sinClave?: boolean }) {
  return new ProveedorGemini({
    apiKey: opciones?.sinClave ? undefined : 'clave',
    modelo: 'gemini-3.5-transcribe',
    base: 'https://generativelanguage.googleapis.com/v1beta',
    estilo,
    prompt: 'Transcribí el audio.',
    timeoutMs: 5000,
    idioma: 'es-AR',
  });
}

describe('proveedor gemini', () => {
  it('avisa qué falta cuando no está configurado', () => {
    const verificacion = gemini('interactions', { sinClave: true }).verificarConfiguracion();
    expect(verificacion.ok).toBe(false);
    if (verificacion.ok) return;
    expect(verificacion.problemas.join(' ')).toContain('GEMINI_API_KEY');
  });

  it('estilo interactions: pega en /interactions con la clave en la cabecera y el audio en base64', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(respuesta({ output: [{ content: [{ text: 'hola vecino' }] }] }));

    const resultado = await gemini('interactions').transcribir(ENTRADA);

    expect(resultado.texto).toBe('hola vecino');
    expect(resultado.proveedor).toBe('gemini');

    const [url, opciones] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/interactions');
    expect((opciones.headers as Record<string, string>)['x-goog-api-key']).toBe('clave');

    const cuerpo = JSON.parse(opciones.body as string);
    expect(cuerpo.model).toBe('gemini-3.5-transcribe');
    expect(cuerpo.input[0]).toMatchObject({ type: 'audio', mime_type: 'audio/ogg' });
    expect(cuerpo.input[0].data).toBe(Buffer.from(BYTES).toString('base64'));
  });

  it('estilo generate_content: arma la URL del modelo y manda inline_data', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        respuesta({ candidates: [{ content: { parts: [{ text: 'falta luz' }] } }] }),
      );

    const resultado = await gemini('generate_content').transcribir(ENTRADA);

    expect(resultado.texto).toBe('falta luz');
    const [url, opciones] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-transcribe:generateContent',
    );
    const cuerpo = JSON.parse(opciones.body as string);
    expect(cuerpo.contents[0].parts[1].inline_data).toMatchObject({ mime_type: 'audio/ogg' });
  });

  it('distingue los errores que conviene reintentar de los que no', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(respuesta({ error: 'cuota' }, 429));
    await expect(gemini('interactions').transcribir(ENTRADA)).rejects.toMatchObject({
      causa: 'red',
      reintentable: true,
    });

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(respuesta({ error: 'clave inválida' }, 401));
    await expect(gemini('interactions').transcribir(ENTRADA)).rejects.toMatchObject({
      causa: 'rechazado_por_proveedor',
      reintentable: false,
    });
  });

  it('falla explícitamente si la respuesta no trae texto', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(respuesta({ algo: 'raro' }));
    await expect(gemini('interactions').transcribir(ENTRADA)).rejects.toBeInstanceOf(
      ErrorTranscripcion,
    );
  });

  it('no manda el audio si la conexión está mal configurada', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      throw new Error('no debería salir a la red sin configuración');
    });
    await expect(
      gemini('interactions', { sinClave: true }).transcribir(ENTRADA),
    ).rejects.toMatchObject({
      causa: 'configuracion',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('declara los formatos que Google acepta (webm no está entre ellos)', () => {
    const soportados = gemini('interactions').mimesSoportados;
    expect(soportados).toContain('audio/ogg');
    expect(soportados).toContain('audio/wav');
    expect(soportados).not.toContain('audio/webm');
  });
});

describe('extractor de texto de la respuesta de Gemini', () => {
  it('entiende las formas conocidas y una desconocida', () => {
    expect(
      extraerTexto({ candidates: [{ content: { parts: [{ text: 'uno' }, { text: ' dos' }] } }] }),
    ).toBe('uno dos');
    expect(extraerTexto({ output: [{ content: [{ text: 'tres' }] }] })).toBe('tres');
    expect(extraerTexto({ output_text: 'cuatro' })).toBe('cuatro');
    expect(extraerTexto({ resultado: { anidado: { transcript: 'cinco' } } })).toBe('cinco');
    expect(extraerTexto({ nada: 1 })).toBe('');
  });
});

describe('proveedor compatible con OpenAI', () => {
  it('envía multipart al endpoint de transcripciones y lee {text}', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(respuesta({ text: 'el agua no llega' }));

    const proveedor = new ProveedorOpenAICompatible({
      baseUrl: 'https://whisper.interno.esquel/v1',
      apiKey: 'secreto',
      modelo: 'whisper-1',
      timeoutMs: 5000,
    });
    const resultado = await proveedor.transcribir(ENTRADA);

    expect(resultado.texto).toBe('el agua no llega');
    const [url, opciones] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://whisper.interno.esquel/v1/audio/transcriptions');
    expect((opciones.headers as Record<string, string>).authorization).toBe('Bearer secreto');
    expect(opciones.body).toBeInstanceOf(FormData);
    expect((opciones.body as FormData).get('model')).toBe('whisper-1');
  });

  it('reclama la URL base si falta', () => {
    const proveedor = new ProveedorOpenAICompatible({
      baseUrl: undefined,
      apiKey: undefined,
      modelo: 'whisper-1',
      timeoutMs: 1000,
    });
    expect(proveedor.verificarConfiguracion().ok).toBe(false);
  });
});
