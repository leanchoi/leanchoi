import { getEnv } from '@/lib/env';

export type ConfigAudio = {
  habilitado: boolean;
  proveedor: 'stub' | 'gemini' | 'openai_compatible';
  directorio: string;
  maxBytes: number;
  mimesPermitidos: string[];
  ttlHoras: number;
  reintentosMax: number;
  loteProceso: number;
  tokenWorker: string | undefined;
  idioma: string;
  ffmpegPath: string | undefined;
};

/** Configuración del módulo de audio, derivada del entorno. */
export function getConfigAudio(): ConfigAudio {
  const env = getEnv();
  return {
    habilitado: env.FEATURE_AUDIO,
    proveedor: env.TRANSCRIPTION_PROVIDER,
    directorio: env.AUDIO_DIR,
    maxBytes: env.AUDIO_MAX_MB * 1024 * 1024,
    mimesPermitidos: env.AUDIO_MIMES_PERMITIDOS.split(',')
      .map((m) => m.trim().toLowerCase())
      .filter(Boolean),
    ttlHoras: env.AUDIO_TTL_HORAS,
    reintentosMax: env.AUDIO_REINTENTOS_MAX,
    loteProceso: env.AUDIO_LOTE_PROCESO,
    tokenWorker: env.AUDIO_WORKER_TOKEN,
    idioma: env.AUDIO_IDIOMA,
    ffmpegPath: env.FFMPEG_PATH,
  };
}
