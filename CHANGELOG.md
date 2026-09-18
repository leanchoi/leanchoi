# Changelog

Todas las novedades de este proyecto se registran acá.
Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y
versionado [SemVer](https://semver.org/lang/es/).

## [No publicado]

Fases 1 a 8: modelo de datos completo, motor de cuestionario, PWA de campo, sync,
devolución, tablero, codificación temática y hardening.

## [0.2.0] — 2026-09-18

Módulo de audio: envío desde campo, desgrabación con proveedor enchufable y borrado
del audio. Adelanta parte de la fase 7 porque el circuito de audio tiene que estar
montado desde el principio.

### Agregado

- Ciclo de vida completo del audio en `src/lib/audio/pipeline.ts`: recibir → guardar →
  desgrabar → **borrar los bytes** apenas la transcripción queda asegurada.
- Purga por TTL (`AUDIO_TTL_HORAS`, 72 por defecto): el audio se borra aunque no se
  haya podido desgrabar. La fila y el asiento en `audit_log` sobreviven; los bytes no.
- Interfaz `TranscriptionProvider` con tres implementaciones: `stub` (determinística,
  sin red, la de por defecto), `gemini` (API de Google, con los dos estilos de request
  y extractor de respuesta tolerante) y `openai_compatible` (Whisper autohospedado o
  cualquier servicio con la API de OpenAI).
- Conversión de formato con ffmpeg para los proveedores que no aceptan `audio/webm`.
- Tablas `analitica.audios`, `analitica.transcripciones` y `analitica.audit_log` con
  migración versionada (`drizzle/0000_audios_y_transcripciones.sql`).
- Rutas: `POST /api/audios` (subida), `GET /api/audios/{id}` (estado, nunca bytes) y
  `POST /api/audios/procesar` (worker, protegido por `AUDIO_WORKER_TOKEN`).
- Banco de pruebas `/campo/audio` para grabar y enviar desde un celular real.
- Scripts `audio:procesar`, `audio:purgar` y `audio:verificar` (probador de la conexión
  con el proveedor, sin tocar la base).
- `docs/audio-y-transcripcion.md`: guía para conectar Gemini u otro servicio, escrita
  para que la siga un agente de IA, con checklist y advertencia legal.
- Regla 11 en `docs/reglas-de-negocio.md` y sus tests en
  `tests/reglas/11-audio-efimero.test.ts`.
- ffmpeg y volumen `audios` en la imagen Docker y en el compose.

### Cambiado

- `TRANSCRIPTION_PROVIDER` ya no acepta `anthropic`: la API de Anthropic no recibe
  audio crudo. El agrupamiento temático sigue con `CLUSTERING_PROVIDER`.
- Los valores con espacios en `.env.example` van entre comillas, para que `.env` se
  pueda cargar con `source` desde los scripts y desde el HANDOFF.

## [0.1.0] — 2026-09-18

Fase 0: scaffolding, infraestructura y documentación.

### Agregado

- Aplicación Next.js 15 (App Router) con TypeScript estricto y salida `standalone`.
- Tailwind CSS 4 y componentes base de shadcn/ui (`button`, `card`, `badge`).
- Configuración por entorno validada con Zod (`src/lib/env.ts`), con el puerto
  totalmente configurable por la variable `PORT`.
- Cliente de Postgres con pool perezoso y `pingDatabase()`.
- Endpoint de salud `GET /api/health` (200 sano, 503 degradado, `?db=skip` para liveness).
- Portada con el mapa de los cuatro módulos del ciclo.
- Dockerfile multi-stage (`deps`, `builder`, `tools`, `runner`) con `HEALTHCHECK`.
- `docker-compose.yml` con app, Postgres 16 y volumen persistente; override
  `docker-compose.dev.yml` para desarrollo local.
- Scripts de operación: `migrate`, `seed`, `backup`, `restore`, `healthcheck`,
  `create-admin`.
- Documentación: `README.md`, `HANDOFF.md` (deploy), `docs/reglas-de-negocio.md`,
  `docs/modelo-datos.md`, `.env.example` con todas las variables comentadas.
- Tests: Vitest (configuración por entorno y puerto no hardcodeado) y Playwright
  (salud y portada).
- Cabeceras de seguridad y regla de ESLint que prohíbe `localStorage`/`sessionStorage`.
