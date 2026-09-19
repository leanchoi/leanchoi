import { z } from 'zod';

/**
 * Configuración del sistema. TODO sale de variables de entorno: no hay valores
 * de infraestructura hardcodeados en el código (especialmente el puerto).
 *
 * La validación es perezosa (`getEnv()`), para que `next build` no exija una
 * base de datos ni secretos de producción.
 */

const boolish = z
  .union([z.boolean(), z.string()])
  .transform((v) =>
    typeof v === 'boolean'
      ? v
      : ['1', 'true', 'yes', 'si', 'sí', 'on'].includes(v.trim().toLowerCase()),
  );

const EnvSchema = z
  .object({
    // --- Aplicación ---
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    APP_NAME: z.string().min(1).default('Relevamiento Barrial Esquel'),
    // Si no se define, se deriva de PORT (ver `.transform` al final del schema).
    APP_BASE_URL: z.string().min(1).optional(),
    TZ: z.string().min(1).default('America/Argentina/Buenos_Aires'),
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

    // --- Base de datos ---
    DATABASE_URL: z.string().min(1, 'DATABASE_URL es obligatoria'),
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
    DATABASE_SSL: boolish.default(false),

    // --- Sesiones / auth propia ---
    SESSION_SECRET: z.string().min(32, 'SESSION_SECRET debe tener al menos 32 caracteres'),
    SESSION_COOKIE_NAME: z.string().min(1).default('rbe_sesion'),
    SESSION_TTL_HORAS: z.coerce.number().int().min(1).max(720).default(12),
    SESSION_COOKIE_SECURE: boolish.default(true),

    // --- Correo (acuses al vecino) ---
    MAIL_TRANSPORT: z.enum(['console', 'smtp']).default('console'),
    MAIL_FROM: z.string().min(1).default('no-responder@esquel.local'),
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().int().min(1).max(65535).optional(),
    SMTP_USER: z.string().optional(),
    SMTP_PASSWORD: z.string().optional(),

    // --- Feature flags ---
    FEATURE_AUDIO: boolish.default(false),
    FEATURE_TRANSCRIPCION: boolish.default(false),
    FEATURE_CLUSTERING: boolish.default(false),
    // --- Audio (grabación de preguntas abiertas) ---
    // El audio es temporal por diseño: se borra apenas la desgrabación queda asegurada.
    AUDIO_DIR: z.string().default('./datos/audios'),
    AUDIO_MAX_MB: z.coerce.number().min(1).max(200).default(20),
    AUDIO_MIMES_PERMITIDOS: z
      .string()
      .default(
        'audio/webm,audio/ogg,audio/mp4,audio/mpeg,audio/wav,audio/flac,audio/aac,audio/aiff',
      ),
    // Tope duro: pasado este plazo el audio se borra aunque no se haya transcripto.
    AUDIO_TTL_HORAS: z.coerce.number().int().min(1).max(720).default(72),
    AUDIO_REINTENTOS_MAX: z.coerce.number().int().min(1).max(20).default(3),
    AUDIO_LOTE_PROCESO: z.coerce.number().int().min(1).max(200).default(10),
    // Secreto que autoriza a disparar el procesamiento por HTTP (hasta la fase 4).
    AUDIO_WORKER_TOKEN: z.string().min(16).optional(),
    AUDIO_IDIOMA: z.string().default('es-AR'),
    // Ruta a ffmpeg, para convertir formatos que el proveedor no acepta.
    FFMPEG_PATH: z.string().optional(),

    // --- Proveedor de desgrabación ---
    TRANSCRIPTION_PROVIDER: z.enum(['stub', 'gemini', 'openai_compatible']).default('stub'),

    // Gemini (Google AI Studio / Generative Language API)
    GEMINI_API_KEY: z.string().optional(),
    GEMINI_MODEL: z.string().default('gemini-3.5-transcribe'),
    GEMINI_API_BASE: z.string().default('https://generativelanguage.googleapis.com/v1beta'),
    // `interactions` = API nueva de transcripción; `generate_content` = API clásica.
    GEMINI_ESTILO: z.enum(['interactions', 'generate_content']).default('interactions'),
    GEMINI_PROMPT: z
      .string()
      .default(
        'Transcribí literalmente el audio en español rioplatense. Devolvé solo el texto, sin comentarios ni encabezados.',
      ),
    GEMINI_TIMEOUT_MS: z.coerce.number().int().min(1000).max(600000).default(120000),

    // Servicio compatible con la API de OpenAI (Whisper autohospedado, etc.)
    STT_OPENAI_BASE_URL: z.string().optional(),
    STT_OPENAI_API_KEY: z.string().optional(),
    STT_OPENAI_MODEL: z.string().default('whisper-1'),
    STT_OPENAI_TIMEOUT_MS: z.coerce.number().int().min(1000).max(600000).default(120000),

    // --- Agrupamiento temático de respuestas abiertas (fase 7) ---
    CLUSTERING_PROVIDER: z.enum(['stub', 'anthropic']).default('stub'),
    ANTHROPIC_API_KEY: z.string().optional(),
    ANTHROPIC_MODEL: z.string().default('claude-opus-5'),
    CLUSTERING_TIMEOUT_MS: z.coerce.number().int().min(1000).max(1800000).default(600000),
    /** Tope de temas por pregunta: más de una docena no entra en una carilla A4. */
    CLUSTERING_MAX_TEMAS: z.coerce.number().int().min(2).max(30).default(10),
    CLUSTERING_LOTE: z.coerce.number().int().min(1).max(500).default(120),
    /** Debajo de esto no se agrupa: con tres textos no hay temas, hay tres textos. */
    CLUSTERING_MINIMO_FRAGMENTOS: z.coerce.number().int().min(1).default(5),

    // --- Seed ---
    // Datos de demostración (usuarios de prueba y viviendas ficticias).
    // NUNCA activar en producción.
    SEED_DEMO: boolish.default(false),
    SEED_DEMO_PASSWORD: z.string().min(8).optional(),

    // --- Operación ---
    BACKUP_DIR: z.string().default('./backups'),
    BACKUP_RETENCION_DIAS: z.coerce.number().int().min(0).default(30),
  })
  .transform((env) => ({
    ...env,
    // La URL pública se deriva del puerto configurado: nunca hay un puerto literal.
    APP_BASE_URL: env.APP_BASE_URL ?? `http://localhost:${env.PORT}`,
  }));

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;

function formatIssues(error: z.ZodError): string {
  return error.issues.map((i) => `  - ${i.path.join('.') || '(raíz)'}: ${i.message}`).join('\n');
}

/**
 * Devuelve la configuración validada. Lanza con un mensaje accionable si falta
 * algo. Solo puede llamarse del lado del servidor.
 */
export function getEnv(): Env {
  if (typeof window !== 'undefined') {
    throw new Error(
      'getEnv() es solo del servidor: nunca importes @/lib/env en un componente cliente.',
    );
  }
  if (cached) return cached;

  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(
      `Configuración inválida (revisá tu .env contra .env.example):\n${formatIssues(parsed.error)}`,
    );
  }
  cached = parsed.data;
  return cached;
}

/** Solo para tests: valida un objeto arbitrario sin tocar process.env. */
export function parseEnv(source: Record<string, unknown>) {
  return EnvSchema.safeParse(source);
}

/** Solo para tests: limpia el cache del singleton. */
export function resetEnvCache(): void {
  cached = null;
}
