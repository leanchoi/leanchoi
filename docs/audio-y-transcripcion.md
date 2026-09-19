# Audio y desgrabación

> **Este documento está escrito para un agente de IA que tiene que dejar andando la
> conexión con un servicio de desgrabación** (Gemini u otro). Los comandos son
> literales. Donde dice _verificar contra la documentación vigente_, hacelo: la API
> de Google cambia seguido y este repositorio no puede garantizar que la forma del
> request siga siendo la misma.

---

## 1. La regla que ordena todo: el audio es temporal

Las preguntas abiertas se contestan por voz, pero lo que el operativo usa es el texto.
El sistema trata el audio como **combustible, no como archivo**: se procesa y se
descarta. Así el volumen no crece con el relevamiento y no hay que administrar miles de
archivos de voz que ya no le sirven a nadie.

```
  celular ──► POST /api/audios ──► bytes en disco ──► desgrabación ──► texto en la base
                                         │                                   │
                                         └──────── se BORRAN acá ◄───────────┘
                                                 (transcripción asegurada)

  Si no se pudo desgrabar: el audio sobrevive hasta AUDIO_TTL_HORAS y después
  se borra igual, con o sin texto.
```

Invariantes que el código garantiza (y que los tests verifican):

1. Los bytes del audio se borran **apenas** la transcripción está escrita y releída
   de la base. No hay ventana de "lo borramos después".
2. Si la desgrabación falla, el audio **no** se borra: queda para reintento.
3. Si la transcripción no se puede confirmar en la base, el audio **no** se borra.
4. Vencido `AUDIO_TTL_HORAS`, el audio se borra **siempre**, haya o no texto.
5. **Ninguna ruta HTTP devuelve los bytes del audio.** No existe ni para el admin.
6. La purga no borra filas: queda el registro de que ese audio existió (hash,
   tamaño, duración, motivo y momento de la purga) más un asiento en `audit_log`.

Los tests están en `tests/reglas/11-audio-efimero.test.ts`. Si alguien rompe alguna
de estas seis cosas, fallan.

---

## 2. Mapa de archivos

| Archivo                                          | Qué hace                                                      |
| ------------------------------------------------ | ------------------------------------------------------------- |
| `src/lib/audio/tipos.ts`                         | La interfaz `TranscriptionProvider` y los errores tipificados |
| `src/lib/audio/proveedores/stub.ts`              | Proveedor por defecto: determinístico, sin red                |
| `src/lib/audio/proveedores/gemini.ts`            | **Conexión con Gemini. Acá se toca.**                         |
| `src/lib/audio/proveedores/openai-compatible.ts` | Whisper autohospedado u otro servicio compatible              |
| `src/lib/audio/registro.ts`                      | Elige el proveedor según `TRANSCRIPTION_PROVIDER`             |
| `src/lib/audio/pipeline.ts`                      | El ciclo de vida completo, incluida la purga                  |
| `src/lib/audio/almacenamiento.ts`                | Archivos en disco bajo `AUDIO_DIR`                            |
| `src/lib/audio/repositorio.ts`                   | Acceso a `analitica.audios` y `analitica.transcripciones`     |
| `src/lib/audio/conversion.ts`                    | Conversión de formato con ffmpeg                              |
| `src/app/api/audios/route.ts`                    | `POST` de subida desde el celular                             |
| `src/app/api/audios/[id]/route.ts`               | `GET` de estado (nunca devuelve audio)                        |
| `src/app/api/audios/procesar/route.ts`           | `POST` que dispara desgrabación y purga                       |
| `src/app/campo/audio/`                           | Banco de pruebas para grabar y enviar desde un celular real   |
| `scripts/procesar-audios.ts`                     | Worker para cron                                              |
| `scripts/purgar-audios.ts`                       | Barrido de purga                                              |
| `scripts/verificar-transcripcion.ts`             | **Probador de la conexión, sin tocar la base**                |

---

## 3. Encender el módulo

```bash
cd /opt/relevamiento-esquel

# 1. Prender el audio con el proveedor de prueba (no sale a internet)
sed -i 's/^FEATURE_AUDIO=.*/FEATURE_AUDIO=true/' .env
sed -i 's/^TRANSCRIPTION_PROVIDER=.*/TRANSCRIPTION_PROVIDER=stub/' .env

# 2. Token del worker
sed -i "s|^AUDIO_WORKER_TOKEN=.*|AUDIO_WORKER_TOKEN=$(openssl rand -hex 24)|" .env

# 3. Migrar y levantar
docker compose run --rm tools npm run db:migrate
docker compose up -d --build

# 4. Probar el circuito completo con el stub
docker compose run --rm tools npm run audio:procesar
```

Con esto el sistema graba, envía, "desgraba" (texto de prueba determinístico) y
**borra el audio**. Recién cuando eso anda de punta a punta conviene enchufar un
servicio real.

---

## 4. Conectar Gemini

### 4.1 Variables

```bash
sed -i 's/^TRANSCRIPTION_PROVIDER=.*/TRANSCRIPTION_PROVIDER=gemini/' .env
sed -i "s|^# GEMINI_API_KEY=.*|GEMINI_API_KEY=LA_CLAVE|" .env
grep -E '^(TRANSCRIPTION_PROVIDER|GEMINI_)' .env
```

| Variable            | Para qué                     | Valor de referencia                                        |
| ------------------- | ---------------------------- | ---------------------------------------------------------- |
| `GEMINI_API_KEY`    | Clave de Google AI Studio    | —                                                          |
| `GEMINI_MODEL`      | Modelo                       | `gemini-3.5-transcribe` (modelo dedicado de transcripción) |
| `GEMINI_API_BASE`   | Base de la API               | `https://generativelanguage.googleapis.com/v1beta`         |
| `GEMINI_ESTILO`     | Forma del request            | `interactions` o `generate_content`                        |
| `GEMINI_PROMPT`     | Instrucción de transcripción | Usar el valor por defecto                                  |
| `GEMINI_TIMEOUT_MS` | Tiempo máximo por audio      | `120000`                                                   |

### 4.2 Las dos formas de request implementadas

**`GEMINI_ESTILO=interactions`** — API de transcripción, para los modelos dedicados:

```http
POST {GEMINI_API_BASE}/interactions
x-goog-api-key: {GEMINI_API_KEY}
content-type: application/json

{
  "model": "gemini-3.5-transcribe",
  "input": [
    { "type": "audio", "data": "<base64>", "mime_type": "audio/ogg" },
    { "type": "text", "text": "<GEMINI_PROMPT>" }
  ]
}
```

**`GEMINI_ESTILO=generate_content`** — API clásica multimodal:

```http
POST {GEMINI_API_BASE}/models/{GEMINI_MODEL}:generateContent
x-goog-api-key: {GEMINI_API_KEY}
content-type: application/json

{
  "contents": [{ "role": "user", "parts": [
      { "text": "<GEMINI_PROMPT>" },
      { "inline_data": { "mime_type": "audio/ogg", "data": "<base64>" } }
  ]}],
  "generationConfig": { "temperature": 0 }
}
```

### 4.3 Qué verificar contra la documentación vigente de Google

Esta es la parte que hay que chequear, no asumir:

- [ ] **Nombre del modelo.** ¿`gemini-3.5-transcribe` sigue existiendo y disponible
      para la clave que se está usando? Listar los modelos:
      `curl -s -H "x-goog-api-key: $GEMINI_API_KEY" "$GEMINI_API_BASE/models" | head -50`
- [ ] **Endpoint y estilo.** ¿El modelo elegido se invoca por `/interactions` o por
      `:generateContent`? Ajustar `GEMINI_ESTILO` en consecuencia.
- [ ] **Nombre del campo del audio inline.** El código manda `data` + `mime_type`
      dentro de `input[]` para el estilo `interactions`. Si la documentación usa otro
      nombre (por ejemplo `inline_data`, `bytes` o `source`), **corregir el método
      `cuerpo()` en `src/lib/audio/proveedores/gemini.ts`**. Es un solo lugar.
- [ ] **Forma de la respuesta.** El extractor `extraerTexto()` entiende
      `candidates[].content.parts[].text`, `output[].content[].text`, `output_text`,
      `text`, `transcript`, y como último recurso busca en profundidad. Si aparece
      una forma nueva, agregarla ahí y sumar un caso al test
      `tests/unit/audio-proveedores.test.ts`.
- [ ] **Límite de tamaño.** El request completo no puede superar los 20 MB con audio
      inline. `AUDIO_MAX_MB=20` ya lo respeta. Para audios más largos hay que usar la
      **Files API** (subir el archivo, mandar la `uri`): **no está implementado**, ver
      sección 9.
- [ ] **Formatos aceptados.** Google documenta WAV, MP3, AIFF, AAC, OGG y FLAC.
      `audio/webm` —lo que graba Android por defecto— **no** está en esa lista: por eso
      existe la conversión con ffmpeg (sección 6).
- [ ] **Opciones del modelo de transcripción.** Diarización, marcas de tiempo por
      palabra y `custom_vocabulary` (hasta 1000 términos, útil para los nombres de los
      barrios) existen en la API pero acá solo se manda `custom_vocabulary` cuando el
      pipeline provee vocabulario. Ampliar en `cuerpo()` si se necesitan.

### 4.4 Probar la conexión sin tocar la base

```bash
# Un audio de prueba en un formato que Gemini acepta
docker compose run --rm tools sh -c \
  "ffmpeg -f lavfi -i 'sine=frequency=440:duration=3' -c:a libopus /tmp/prueba.ogg -y >/dev/null 2>&1 && \
   npm run audio:verificar -- /tmp/prueba.ogg"
```

Salida esperada: el proveedor, el modelo, el tiempo que tardó y el texto devuelto.
Un tono puro va a devolver texto vacío o casi vacío — eso confirma que **la conexión
funciona**. Para una prueba real, grabar tres segundos de voz desde
`/campo/audio` en un celular y correr `npm run audio:procesar`.

Errores y qué significan:

| Mensaje                                       | Causa                           | Qué hacer                                    |
| --------------------------------------------- | ------------------------------- | -------------------------------------------- |
| `Falta GEMINI_API_KEY`                        | No cargó la clave               | Revisar `.env` y reiniciar                   |
| `Gemini respondió 401/403`                    | Clave inválida o sin permisos   | Regenerar la clave                           |
| `Gemini respondió 404`                        | Modelo o endpoint inexistente   | Verificar 4.3, primer y segundo punto        |
| `Gemini respondió 429`                        | Cuota                           | Es reintentable: el worker lo reintenta solo |
| `Gemini respondió sin texto de transcripción` | Cambió la forma de la respuesta | Ajustar `extraerTexto()`                     |
| `El proveedor no acepta audio/webm…`          | Falta ffmpeg                    | Sección 6                                    |

---

## 5. Conectar otro proveedor

La interfaz es chica a propósito (`src/lib/audio/tipos.ts`):

```ts
export interface TranscriptionProvider {
  readonly nombre: string;
  readonly mimesSoportados: readonly string[];
  readonly requiereRed: boolean;
  verificarConfiguracion(): { ok: true } | { ok: false; problemas: string[] };
  transcribir(entrada: EntradaTranscripcion, señal?: AbortSignal): Promise<ResultadoTranscripcion>;
}
```

Tres pasos:

1. Crear la clase en `src/lib/audio/proveedores/`.
2. Agregar el nombre al enum `TRANSCRIPTION_PROVIDER` en `src/lib/env.ts`.
3. Sumar el `case` en `src/lib/audio/registro.ts`.

Nada más del sistema se entera: la purga, los reintentos y la auditoría siguen igual.

Ya viene implementado **`openai_compatible`**, que sirve para cualquier servicio con
la API de OpenAI (`POST {base}/audio/transcriptions`, multipart). Es el camino para
un **Whisper autohospedado**, donde la voz nunca sale del servidor del municipio:

```bash
sed -i 's/^TRANSCRIPTION_PROVIDER=.*/TRANSCRIPTION_PROVIDER=openai_compatible/' .env
echo 'STT_OPENAI_BASE_URL=http://whisper:8000/v1' >> .env
echo 'STT_OPENAI_MODEL=whisper-1' >> .env
```

---

## 6. Formatos y ffmpeg

El navegador de Android graba, casi siempre, `audio/webm;codecs=opus`. Google no lo
lista entre los formatos soportados. El pipeline resuelve esto solo:

1. Si el proveedor declara que no soporta el MIME del audio,
2. convierte con ffmpeg al primer formato que el proveedor sí acepta (por defecto
   `audio/ogg` con códec opus),
3. y recién ahí lo manda.

ffmpeg viene instalado en la imagen Docker (etapas `runner` y `tools`). Fuera de
Docker, instalarlo o apuntar `FFMPEG_PATH` al binario. Si falta, el audio **no se
pierde**: queda en error, con mensaje explícito, hasta que se arregle o venza el TTL.

El cliente además prefiere grabar directo en un formato aceptado cuando el
dispositivo lo permite (`src/app/campo/audio/grabador.tsx`).

---

## 7. La garantía de borrado, verificada a mano

```bash
cd /opt/relevamiento-esquel
set -a; . ./.env; set +a

# 1. Cuántos audios tienen todavía bytes en disco
docker compose exec db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c \
  "select estado, count(*), count(ruta_relativa) as con_bytes from analitica.audios group by 1 order by 1;"

# 2. Qué hay realmente en el volumen
docker compose exec app sh -c 'find /app/datos/audios -type f | wc -l'

# 3. Los dos números de 'con_bytes' y del find tienen que coincidir.
#    Todo lo que esté en estado 'transcripto' o 'purgado%' debe tener con_bytes = 0.

# 4. Forzar la purga
docker compose run --rm tools npm run audio:purgar

# 5. Rastro de las purgas
docker compose exec db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c \
  "select ocurrido_en, motivo, metadata->>'audioId' from analitica.audit_log where accion='audio_purgado' order by ocurrido_en desc limit 10;"
```

---

## 8. Operación

**Cron del worker** (desgraba lo pendiente y purga lo que corresponde):

```bash
( crontab -l 2>/dev/null; \
  echo "*/10 * * * * cd /opt/relevamiento-esquel && docker compose run --rm tools npm run audio:procesar >> /var/log/relevamiento-audio.log 2>&1" \
) | crontab -
```

**Por HTTP**, si se prefiere dispararlo desde afuera:

```bash
curl -fsS -X POST "http://127.0.0.1:${PORT}/api/audios/procesar" \
  -H "x-audio-worker-token: ${AUDIO_WORKER_TOKEN}"
```

Responde con el resumen: cuántos se procesaron, cuántos se transcribieron, cuántos
fallaron y cuántos audios se borraron.

**Consultas útiles:**

```sql
-- Cuánto audio hay esperando desgrabación
select count(*), sum(bytes) from analitica.audios where ruta_relativa is not null;

-- Audios que vencieron sin poder desgrabarse (revisar por qué)
select id, mime, intentos, error_detalle from analitica.audios
where estado = 'purgado_sin_transcribir' order by creado_en desc limit 20;

-- Tiempo promedio de desgrabación por proveedor
select proveedor, count(*), avg(duracion_proceso_ms)::int
from analitica.transcripciones group by 1;
```

---

## 9. Lo que NO está hecho

Explícito para que nadie lo dé por implementado:

- **Files API de Gemini** para audios de más de 20 MB. Hoy el tope es `AUDIO_MAX_MB=20`
  y el audio va inline en el JSON. Para audios largos hay que subir el archivo primero
  y mandar la `uri` — se implementa en `ProveedorGemini` agregando un paso previo.
- **Diarización y marcas de tiempo.** La API las ofrece; el pipeline guarda solo texto
  plano. Si se necesitan, agregar campos a `analitica.transcripciones`.
- **Cola offline del audio en el celular.** Hoy el envío es directo. La cola en
  IndexedDB con reintentos (para los barrios sin señal) es parte de la **fase 3**.
- **Autorización por rol.** La subida hoy valida el flag y los datos, no la sesión:
  la auth llega en la **fase 4**. El procesamiento sí está protegido por
  `AUDIO_WORKER_TOKEN`.
- **Agrupamiento temático** de las transcripciones en temas con citas textuales: está
  hecho, es otro módulo y tiene su propia guía en `docs/codificacion.md`.
- **Revisión humana de la transcripción.** El campo `revisada_por_persona` existe en
  la tabla, la pantalla para revisarlas no.

---

## 10. Checklist para dar la conexión por terminada

- [ ] `npm run audio:verificar -- prueba.ogg` devuelve texto sin errores.
- [ ] Un audio real grabado desde `/campo/audio` termina en estado `transcripto`.
- [ ] `select count(*) from analitica.audios where estado='transcripto' and ruta_relativa is not null;`
      devuelve **0**.
- [ ] El `find` sobre `/app/datos/audios` no muestra archivos de audios ya transcriptos.
- [ ] Hay asientos `audio_purgado` en `analitica.audit_log`.
- [ ] El cron del worker está en `crontab -l`.
- [ ] `npm test` pasa, incluido `tests/reglas/11-audio-efimero.test.ts`.
