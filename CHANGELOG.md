# Changelog

Todas las novedades de este proyecto se registran acá.
Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y
versionado [SemVer](https://semver.org/lang/es/).

## [No publicado]

Fases 5 a 8: devolución, tablero, codificación temática y hardening.

## [0.6.0] — 2026-09-19

Fase 4: auth propia, los cinco roles y el servidor de sincronización.

### Agregado

- Ingreso con usuario y contraseña en `/ingresar`: sesión firmada con HMAC en una
  cookie `httpOnly`, `SameSite=Lax`, `Secure` según el entorno. Sin proveedores
  externos. El estado del usuario se relee en cada pedido, así que desactivar a alguien
  lo deja afuera al instante.
- Contraseñas con bcrypt (costo 12) y requisitos mínimos verificados al crear usuarios.
- Freno contra prueba y error en el login (8 intentos por usuario e IP cada 5 minutos).
- Matriz de permisos de los cinco roles, escrita como código y como test. **Solo `admin`
  puede cruzar un ticket con la identidad.**
- `POST /api/sync`: idempotente y append-only. Ordena los eventos para que una vivienda
  agregada en la calle entre antes que su encuesta, usa la clave natural de cada evento
  —el ticket, el par vivienda+intento— con `on conflict do nothing`, y devuelve qué
  quedó confirmado para que el celular lo borre.
- El encuestador solo puede cargar en su barrio asignado, verificado en el servidor.
- `src/lib/identificada/acceso.ts`: única puerta al schema `identificada`. El cruce exige
  rol `admin` y un motivo escrito, y deja el asiento en `audit_log` **antes** de devolver
  el dato.
- Paso opcional de datos de contacto al terminar la encuesta, para poder avisarle al
  vecino cómo sigue su pedido. Van al otro schema y se borran del teléfono al sincronizar.
- `npm run admin:create` implementado, con rol y barrio.
- `/api/campo/barrios` y `/api/campo/viviendas` ahora exigen sesión y devuelven solo el
  barrio asignado.
- Tests: 13 unitarios de sesión y permisos, 11 de integración contra una base Postgres
  real (idempotencia, rechazo sin consentimiento, barrio ajeno, y las tres puertas del
  cruce auditado) y 5 e2e del circuito completo con login.

## [0.5.0] — 2026-09-19

Fase 3: la app de campo. Instalable, offline y pensada para usarse en la vereda.

### Agregado

- PWA en `/campo`: manifest, iconos, service worker propio (sin dependencias) que
  guarda el armazón de la app y **nunca cachea `/api/`**.
- Base local en IndexedDB con Dexie: sesión, cuestionario, viviendas, encuestas,
  no-respuestas, audios y cola de salida. No se usa localStorage ni sessionStorage.
- Máquina de la encuesta, pura y testeable: pasos, consentimiento obligatorio para
  arrancar, avance guardado en cada paso y sellado del bloque autoadministrado.
- **Modo vecino**: el bloque sensible se entrega al vecino con la pantalla limpia y al
  cerrarlo se sella; el encuestador no puede volver atrás ni ver esas respuestas.
- **Cierre por no-respuesta** con los cinco motivos tipificados y número de intento;
  "volver más tarde" deja la vivienda pendiente.
- **Ticket con QR** generado en el dispositivo, con código corto legible en voz alta.
- **Cola de sincronización** visible, idempotente y append-only: encolar dos veces no
  duplica, reencolar no pisa, y los datos del vecino se purgan del teléfono recién
  cuando el servidor confirma que los recibió.
- Cola offline también para los audios de las preguntas abiertas: se guardan en el
  teléfono y se suben cuando hay señal.
- Seguimiento de GPS en segundo plano: la posición de apertura y cierre se toma de la
  última conocida, sin hacer esperar a nadie.
- Viviendas que no estaban en la lista se agregan en la puerta.
- Rutas de apoyo `GET /api/campo/barrios` y `GET /api/campo/viviendas`, sin ningún dato
  identificatorio.
- Tests: reglas 3, 8 y 9 completas, más cuatro pruebas de punta a punta en un navegador
  real (encuesta completa con modo vecino hasta el ticket, cierre por no-respuesta,
  cola, y la app abriendo y funcionando con la red cortada).

### Corregido

- El GPS ya no se pide de forma bloqueante al abrir o cerrar una encuesta: hacía esperar
  hasta ocho segundos al encuestador.

## [0.4.0] — 2026-09-18

Fase 2: motor del cuestionario, reglas de publicación y ruta pública.

### Agregado

- Esquema Zod del cuestionario compartido por cliente y servidor
  (`src/lib/cuestionario/esquema.ts`), con los siete tipos de pregunta y sus
  requisitos: las cerradas necesitan opciones, las de escala necesitan sus etiquetas.
- Motor de publicación (`src/lib/cuestionario/publicacion.ts`) que devuelve todos los
  problemas juntos, cada uno con su número de regla: decisión declarada por pregunta
  (regla 5), techo de 720 segundos con el excedente exacto (regla 6), núcleo de 10
  preguntas inmutable contra la versión vigente —texto, tipo, opciones y su orden—
  (regla 7), consentimiento versionado con finalidad declarada (regla 2) y coherencia
  del bloque autoadministrado (regla 8).
- Repositorio del cuestionario: versión vigente, listado de versiones y publicación
  transaccionalmente validada.
- **Ruta pública `/cuestionario`** (regla 10): versión vigente completa, consentimiento,
  el motivo declarado de cada pregunta, los segundos estimados y el changelog de
  versiones. Sin login, indexable, imprimible. Los mismos datos en `/api/cuestionario`.
- `npm run cuestionario:publicar -- archivo.json`.
- Tests por regla: `02-consentimiento`, `05-regla-admision`, `06-techo-12-minutos`,
  `07-nucleo-inmutable`, `08-modo-vecino` y `10-cuestionario-publico`.

### Cambiado

- El seed usa el mismo motor que la publicación: no hay forma de cargar por la ventana
  un instrumento que no cumple las reglas.

## [0.3.0] — 2026-09-18

Fase 1: modelo de datos completo, migraciones versionadas y seed.

### Agregado

- Schema `analitica` completo: `barrios`, `viviendas`, `usuarios`, `encuestadores`,
  `cuestionarios`, `respuestas`, `no_respuestas`, `audios`, `transcripciones`,
  `codificaciones`, `derivaciones`, `informes_barrio` y `audit_log`.
- Schema `identificada`: `contactos` (con el DNI recortado a 3 dígitos) y `acuses`.
- **Cero foreign keys entre los dos schemas**: el único puente es el `ticket`,
  verificado por `tests/reglas/01-bases-separadas.test.ts` sobre el código y sobre el
  SQL de las migraciones.
- Enumeraciones de las reglas del operativo: motivos de no-respuesta, competencia de
  la derivación, estados de vivienda y derivación, roles.
- Migración `drizzle/0001_modelo_completo.sql`.
- `docs/cuestionario-v1.json`: 22 preguntas (10 de núcleo inmutable, 3 bloques de área,
  un bloque autoadministrado), 675 segundos declarados de los 720 disponibles, cada una
  con su `decision`, y el consentimiento versionado con finalidad declarada.
- Seed idempotente con los 15 barrios de Esquel y el cuestionario v1, que verifica el
  instrumento antes de cargarlo (decisión por pregunta, techo de 12 minutos, 10
  preguntas de núcleo, ids únicos, consentimiento completo).
- `SEED_DEMO=true` agrega usuarios de prueba (uno por rol) y viviendas ficticias para
  recorrer el sistema en desarrollo.

### Cambiado

- Se quitaron de la documentación las advertencias sobre el procesamiento de audio por
  terceros: el módulo se documenta por lo que hace, sin marco de advertencia.

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
