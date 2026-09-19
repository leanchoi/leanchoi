# Relevamiento Barrial — Municipalidad de Esquel

Sistema de relevamiento barrial casa por casa de la **Dirección de Juntas Vecinales**
(Municipalidad de Esquel, Chubut). Un solo instrumento compartido por todas las áreas
del municipio —obras, salud, deportes, zoonosis, seguridad, niñez, desarrollo social—
para salir a relevar barrio por barrio con vecinalistas voluntarios y personal
municipal, cada uno con su propio celular Android y en barrios con señal mala o nula.

No es "una encuesta": es un **ciclo cerrado de cuatro módulos**.

| Módulo           | Qué hace                                                   | Ruta                   |
| ---------------- | ---------------------------------------------------------- | ---------------------- |
| 1. Instrumento   | Cuestionario versionado, público y auditable               | `/cuestionario`        |
| 2. Campo         | PWA instalable que funciona sin conexión                   | `/campo`               |
| 3. Procesamiento | Tablero por barrio y por área, cobertura, exports          | `/panel`               |
| 4. Devolución    | Acuse, derivaciones, consulta de ticket, informe de barrio | `/informes`, `/ticket` |

**La devolución es la mitad del proyecto, no un extra.** Un relevamiento que no
vuelve al barrio es un relevamiento que quema al barrio para la próxima vez.

---

## Estado de implementación

El sistema se construye por fases. Esta es la versión **0.7.0** (fases 0 a 5, más el módulo de audio).

| Fase | Contenido                                                                | Estado       |
| ---- | ------------------------------------------------------------------------ | ------------ |
| 0    | Scaffolding, Docker, README, HANDOFF, `.env.example`                     | ✅ hecho     |
| 0.5  | **Módulo de audio**: envío, proveedor enchufable (Gemini u otro) y purga | ✅ hecho     |
| 1    | Schemas `analitica` / `identificada`, migraciones, seed                  | ✅ hecho     |
| 2    | Motor de cuestionario + las validaciones + tests                         | ✅ hecho     |
| 3    | PWA de campo offline (encuesta, modo vecino, no-respuesta, ticket)       | ✅ hecho     |
| 4    | Backend de sync idempotente + auth + roles                               | ✅ hecho     |
| 5    | Devolución (acuse, derivaciones, ticket, informe de barrio)              | ✅ hecho     |
| 6    | Tablero y exports                                                        | ⏳ pendiente |
| 7    | Codificación: agrupamiento temático y citas textuales                    | ⏳ pendiente |
| 8    | Hardening, tests e2e, CHANGELOG                                          | ⏳ pendiente |

Hoy funcionan: el esqueleto de la aplicación, el healthcheck contra Postgres, la
imagen Docker, el compose con volumen persistente, los scripts de operación, la
batería de tests, el **modelo de datos completo** con sus migraciones y su seed
(15 barrios de Esquel y el cuestionario v1 de 22 preguntas), el **motor del cuestionario**
con sus reglas de publicación, la **ruta pública `/cuestionario`**, la **app de campo
instalable que funciona sin señal**, el **ingreso con usuario y contraseña con los cinco
roles**, la **sincronización idempotente**, la **devolución completa** —acuse por competencia,
derivaciones, consulta del vecino e informe de barrio imprimible—, y el **circuito
completo de audio** (grabar → enviar → desgrabar → borrar el audio), con proveedor configurable
y apagado por defecto.

---

## Reglas no negociables

Diez reglas de negocio que el código hace cumplir. Cada una tiene (o va a tener,
según la fase) un test que falla si se rompe. El detalle está en
[`docs/reglas-de-negocio.md`](docs/reglas-de-negocio.md).

1. **Dos bases separadas.** `analitica` (respuestas, sin dato identificatorio) e
   `identificada` (nombre, contacto, domicilio). Sin foreign key navegable entre
   ellas: el único puente es el **ticket** (UUID v7 generado en el cliente). El cruce
   requiere rol `admin` y queda registrado en `audit_log` con usuario, timestamp y motivo.
2. **Consentimiento explícito** con finalidad declarada (Ley 25.326), versionado junto
   al cuestionario.
3. **La no-respuesta es un dato obligatorio**: motivo tipificado y número de intento.
4. **El acuse no promete**: se clasifica la demanda por competencia y el código impide
   enviar una plantilla de tipo `compromiso` sin `orden_trabajo_nro`.
5. **Regla de admisión de preguntas**: sin campo `decision` la pregunta no valida.
6. **Techo de 12 minutos**: si la suma de `segundos_estimados` supera 720, la
   publicación falla.
7. **Núcleo inmutable**: 10 preguntas `core: true` que no cambian entre versiones.
8. **Bloque sensible autoadministrado**: modo vecino, sin vuelta atrás del encuestador.
9. **Offline-first real**: ticket generado en el cliente, sync idempotente y append-only.
10. **Cuestionario público** en `/cuestionario`, sin login, con changelog de versiones.

---

## Stack

Next.js 15 (App Router) · TypeScript estricto · Postgres 16 + Drizzle ORM ·
PWA (service worker + Dexie/IndexedDB + outbox) · Tailwind + shadcn/ui ·
auth propia con cookie `httpOnly` · Zod compartido cliente/servidor ·
Vitest + Playwright · Docker + docker compose.

Sin dependencias de pago ni servicios externos obligatorios para correr.

---

## Cómo correrlo local

### Requisitos

- Node.js 22 o superior y npm 10+
- Docker 24+ con `docker compose` v2 (o un Postgres 16 propio)

### Opción A — todo con Docker (lo más parecido a producción)

```bash
cp .env.example .env
# Editar .env: PORT, POSTGRES_PASSWORD, DATABASE_URL y SESSION_SECRET
docker compose up -d --build
docker compose run --rm tools npm run db:migrate
docker compose run --rm tools npm run db:seed
curl "http://localhost:${PORT}/api/health"
```

### Opción B — app en el host, base en Docker

```bash
cp .env.example .env
# En .env: DATABASE_URL apuntando a 127.0.0.1 y SESSION_COOKIE_SECURE=false
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d db
npm install
npm run db:migrate
npm run db:seed
npm run dev          # escucha en el PORT de .env
```

El puerto sale **siempre** de `PORT` en `.env`: no hay un número escrito en el código,
en el Dockerfile ni en el compose. Hay un test que lo verifica
(`tests/unit/puerto-configurable.test.ts`).

---

## Cómo correr los tests

```bash
npm run typecheck     # TypeScript estricto, sin emitir
npm run lint          # ESLint (incluye la prohibición de localStorage/sessionStorage)
npm test              # Vitest: unitarios + reglas de negocio
npm run test:e2e      # Playwright: levanta la app y corre el circuito
```

Los tests de integración y los e2e necesitan una base con el seed de demostración:

```bash
SEED_DEMO=true SEED_DEMO_PASSWORD=demo-esquel-2026 npm run db:seed
```

Sin `DATABASE_URL` los de integración se saltean solos. Para los e2e, la primera vez:
`npx playwright install chromium`. Si el navegador ya
viene provisto por la imagen o el entorno, se puede apuntar directo:

```bash
PLAYWRIGHT_CHROMIUM_PATH=/ruta/al/chrome npm run test:e2e
```

Los tests de las reglas no negociables viven en `tests/reglas/` y se completan en las
fases 2 a 8.

---

## Scripts de operación

| Comando                | Qué hace                                                            |
| ---------------------- | ------------------------------------------------------------------- |
| `npm run db:migrate`   | Crea los schemas y aplica las migraciones versionadas. Idempotente. |
| `npm run db:seed`      | Carga barrios, cuestionario v1 y datos iniciales. Idempotente.      |
| `npm run db:backup`    | Dump completo en `BACKUP_DIR` (formato custom, con retención).      |
| `npm run db:restore`   | Restaura un dump. Destructivo: exige `CONFIRMAR=si`.                |
| `npm run healthcheck`  | Consulta `/api/health` y devuelve 0 o 1 según el estado.            |
| `npm run admin:create` | Crea el primer usuario `admin` (disponible desde la fase 4).        |

---

## La devolución

La mitad del proyecto. Lo que vuelve al barrio después de la encuesta.

**El acuse no promete.** Toda comunicación al vecino acusa recibo y dice de quién es la
competencia: municipal, provincial, nacional o de una empresa prestadora. La plantilla
de tipo `compromiso` —la única que dice "esto se va a hacer"— **no se puede construir ni
enviar** sin un número de orden de trabajo:

```
HTTP 409
{"error":"promesa_sin_respaldo",
 "detalle":"No se puede enviar una plantilla de tipo \"compromiso\"…
            la derivación no tiene número de orden de trabajo."}
```

Y no queda ningún acuse registrado. En desarrollo el correo **nunca** sale: el
transporte de consola imprime el mensaje en el log, y eso no se puede desactivar por
más que se ponga `MAIL_TRANSPORT=smtp`.

**El vecino consulta sin cuenta** en `/ticket`, con el código de su comprobante o con su
apellido y los últimos 3 números del DNI. Ve en qué quedó su pedido —a qué área fue, en
qué estado está, si hay orden de trabajo— y **ningún dato personal**, ni suyo ni de
nadie.

**El informe de barrio** (`/informes/<barrio>`) es una carilla A4 imprimible para colgar
en la sede vecinal: cuántas casas se visitaron, por qué no se pudo relevar el resto, qué
priorizó el barrio, y qué se comprometió el municipio con número de orden.

---

## Quién entra y qué ve

Auth propia: usuario y contraseña, sesión firmada en una cookie `httpOnly`. Sin
proveedores externos. El estado del usuario se relee en cada pedido, así que
desactivar a alguien lo deja afuera al instante.

```bash
ADMIN_USUARIO=perez.ana ADMIN_PASSWORD="$(openssl rand -base64 18)" npm run admin:create
ADMIN_USUARIO=lopez.juan ADMIN_PASSWORD='...' ADMIN_ROL=encuestador ADMIN_BARRIO=28-de-junio npm run admin:create
```

| Rol                  | Puede                                                                         |
| -------------------- | ----------------------------------------------------------------------------- |
| `encuestador`        | Cargar en **su** barrio asignado, nada más                                    |
| `coordinador_barrio` | Agregados de **su** barrio y cobertura                                        |
| `area`               | Agregados de todos los barrios                                                |
| `conduccion`         | Todo agregado, derivaciones, cobertura y export                               |
| `admin`              | Todo, **único** que puede cruzar un ticket con la identidad, siempre auditado |

El vecino no necesita cuenta: consulta su pedido con el ticket, o con su apellido y los
últimos 3 números del DNI.

---

## La app de campo

`/campo` es una PWA instalable pensada para usarse parado en la vereda, con sol y con
una sola mano. Después de la primera visita **funciona sin conexión**: el cuestionario y
la lista de viviendas quedan guardados en el teléfono (IndexedDB, nunca localStorage) y
lo cargado espera en una cola visible hasta que haya señal.

- **Encuesta paso a paso**, una pregunta por pantalla, guardando en cada paso: si el
  teléfono se queda sin batería, al volver se retoma exactamente donde estaba.
- **Modo vecino** para el bloque de seguridad, convivencia y evaluación de la junta: el
  encuestador entrega el celular, la pantalla queda limpia, y al cerrar el bloque se
  sella — no puede volver atrás ni ver lo que contestaron.
- **Cierre por no-respuesta** con los cinco motivos tipificados y número de intento. Una
  vivienda no se saltea.
- **Ticket con QR** para que el vecino le saque una foto y pueda consultar su pedido.
- **Cola de sincronización** con contador de pendientes: nada se borra del teléfono hasta
  que el servidor confirma que lo recibió.
- **GPS de apertura y cierre** capturado en segundo plano: es dato, nunca bloquea ni
  demora una carga.

Para instalarla en el celular hace falta **HTTPS** (el service worker no se registra por
HTTP salvo en `localhost`).

---

## El cuestionario

El instrumento vive en `docs/cuestionario-v1.json` y se publica con una validación que
no se puede saltear: cada pregunta declara qué decisión toma el área con esa respuesta,
el total no puede pasar de 720 segundos, las diez preguntas del núcleo no cambian entre
versiones, el consentimiento va versionado adentro, y el bloque autoadministrado tiene
que estar marcado de forma coherente.

```bash
npm run cuestionario:publicar -- docs/cuestionario-v2.json
```

Si algo no cumple, no escribe nada y lista todos los problemas con su número de regla:

```
✖ No se puede publicar el cuestionario:
  - [regla 7 · nucleo_modificado] La pregunta de núcleo "nucleo-01" cambió la redacción
    ("¿Hace cuánto tiempo vive en este barrio?" → "¿Desde qué año vive en el barrio?").
```

La versión vigente se lee sin login en **`/cuestionario`** (y en datos, en
`/api/cuestionario`): es el mecanismo de transparencia del operativo.

---

## Audio de las preguntas abiertas

Las preguntas abiertas se contestan por voz. **El audio es temporal por diseño**: se
guarda solo hasta que la desgrabación queda asegurada y ahí se borra; si no se pudo
desgrabar, sobrevive como mucho `AUDIO_TTL_HORAS` y se borra igual. Ninguna ruta HTTP
devuelve los bytes de un audio.

La desgrabación está detrás de una interfaz (`TranscriptionProvider`) con tres
implementaciones: `stub` (determinística, sin red, la de por defecto), `gemini` (API de
Google) y `openai_compatible` (cualquier servicio con la API de OpenAI, incluido un
**Whisper autohospedado**, donde la voz nunca sale del servidor del municipio).

```bash
# probar el circuito sin salir a internet
FEATURE_AUDIO=true npm run dev        # y entrar a /campo/audio desde el celular
npm run audio:procesar
```

Todo el detalle —cómo conectar Gemini paso a paso, qué verificar contra la
documentación vigente de Google, cómo agregar otro proveedor, y cómo comprobar a mano
que los audios efectivamente desaparecen— está en
[`docs/audio-y-transcripcion.md`](docs/audio-y-transcripcion.md).

---

## Estructura

```
src/app/            rutas (App Router): público, campo, panel, API
src/components/ui/  componentes shadcn/ui
src/db/             cliente Postgres y schemas Drizzle
src/lib/            configuración, utilidades y lógica compartida
src/lib/audio/      ciclo de vida del audio y proveedores de desgrabación
docs/               modelo de datos, reglas de negocio, audio, cuestionario v1
scripts/            migrate, seed, backup, restore, healthcheck
tests/unit/         unitarios
tests/reglas/       un test por regla no negociable
tests/e2e/          Playwright
drizzle/            migraciones SQL versionadas (generadas)
```

---

## Datos personales

El sistema maneja datos personales alcanzados por la **Ley 25.326**. Dos consecuencias
operativas que no son opcionales:

- **Nunca se expone en producción sin TLS.** Ver `HANDOFF.md`.
- Los datos de vecinos **nunca** se guardan en `localStorage` ni `sessionStorage`: solo
  en IndexedDB del dispositivo de campo, y se purgan una vez confirmada la sincronización.

---

## TODO — datos que faltan y hay que confirmar con el municipio

Nada de esto se inventó: son huecos reales que hay que cerrar con la Dirección de
Juntas Vecinales antes de salir a campo.

- [ ] **Listado oficial de barrios / sedes vecinales.** El seed usa: 28 de Junio,
      Ceferino, Estación, Sargento Cabral, Bella Vista, Malvinas, Los Sauces, Matadero,
      Buenos Aires, Badén, Don Bosco, Villa Ayelén, Lennart Englund, Parque, INTA.
      **Puede estar incompleto**: validar contra el listado oficial.
- [ ] **Límites geográficos de cada barrio** (polígonos o calles perimetrales) para el
      mapa de viviendas asignadas.
- [ ] **Universo de viviendas por barrio** (cuántas hay, y con qué fuente se arma el
      denominador de la cobertura: catastro, padrón, conteo propio).
- [ ] **Nomenclatura de viviendas**: cómo se identifica una vivienda cuando no hay
      numeración (manzana/lote, referencia, coordenada).
- [ ] **Texto del consentimiento** validado por la asesoría letrada del municipio.
- [ ] **Datos institucionales**: dominio, casilla remitente de los acuses y teléfono de
      la Dirección de Juntas Vecinales.
- [ ] **Áreas participantes y sus bloques de preguntas** (quién firma cada bloque y qué
      decisión toma con cada respuesta).
- [ ] **Formato de `orden_trabajo_nro`** en el sistema de expedientes municipal, para
      poder habilitar las plantillas de tipo `compromiso`.
- [ ] **Identidad visual** del municipio (logo e isologo para el informe de barrio).

---

## Licencia

MIT — ver [LICENSE](LICENSE).
