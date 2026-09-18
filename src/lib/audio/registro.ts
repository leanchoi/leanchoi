import { getEnv } from '@/lib/env';
import { ProveedorGemini } from './proveedores/gemini';
import { ProveedorOpenAICompatible } from './proveedores/openai-compatible';
import { ProveedorStub } from './proveedores/stub';
import type { TranscriptionProvider } from './tipos';

/**
 * Fábrica del proveedor de desgrabación. Agregar uno nuevo son tres pasos:
 *   1. implementar `TranscriptionProvider` en `proveedores/`;
 *   2. sumar su nombre al enum `TRANSCRIPTION_PROVIDER` en `src/lib/env.ts`;
 *   3. agregar el `case` acá.
 * Nada más del sistema se entera.
 */
export function crearProveedorTranscripcion(): TranscriptionProvider {
  const env = getEnv();

  switch (env.TRANSCRIPTION_PROVIDER) {
    case 'gemini':
      return new ProveedorGemini({
        apiKey: env.GEMINI_API_KEY,
        modelo: env.GEMINI_MODEL,
        base: env.GEMINI_API_BASE,
        estilo: env.GEMINI_ESTILO,
        prompt: env.GEMINI_PROMPT,
        timeoutMs: env.GEMINI_TIMEOUT_MS,
        idioma: env.AUDIO_IDIOMA,
      });

    case 'openai_compatible':
      return new ProveedorOpenAICompatible({
        baseUrl: env.STT_OPENAI_BASE_URL,
        apiKey: env.STT_OPENAI_API_KEY,
        modelo: env.STT_OPENAI_MODEL,
        timeoutMs: env.STT_OPENAI_TIMEOUT_MS,
        idioma: env.AUDIO_IDIOMA,
      });

    case 'stub':
    default:
      return new ProveedorStub();
  }
}
