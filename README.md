# YATEN — Sistema de Montaña de Esquel

**YATEN** es la plataforma del **Sistema de Montaña de Esquel**: la herramienta
donde el inventario de circuitos se carga, se administra y se consulta.
Self-hosted y dockerizada, con **traza GPX + puntos de interés** (descripción,
foto y audioguía) + **perfil de altimetría** sincronizado con el mapa.

Implementa la **ficha mínima** del documento de trabajo de la Subsecretaría de
Turismo, incluidos los cinco estados del circuito dentro del Sistema. La regla
*"inventariar no es publicar"* está aplicada en la API: **sólo un circuito en
estado `publicable` puede publicarse** (cualquier otro intento devuelve 409).

Tres frentes:

1. **Visor público** (`/r/:slug`) — mapa + track + POIs + altimetría + audio.
2. **Catálogo público** (`/`) — grilla filtrable de tarjetas.
3. **Admin** (`/admin`) — protegido por token: crear rutas, subir GPX, gestionar POIs desde el mapa.

---

## Arquitectura

```
┌────────────┐   :WEB_PORT   ┌──────────────────────────────────────┐
│  Navegador │◄─────────────►│  web  (nginx)                        │
└────────────┘               │   · sirve el build estático de Vite  │
                             │   · proxy /api/  → api:8080          │
                             │   · proxy /files/ → api:8080         │
                             └───────────────┬──────────────────────┘
                       red interna de compose │ (no expuesta al host)
                          ┌───────────────────┴───────────┐
                          │  api (Fastify + Drizzle)       │
                          │   · migraciones al boot        │
                          │   · /storage (volumen local)   │
                          └───────────────┬────────────────┘
                                          │
                                   ┌──────┴──────┐
                                   │ db (PG 16)  │  volumen pgdata
                                   └─────────────┘
```

- **Un solo puerto** publicado en el VPS (`WEB_PORT`). `db` y `api` viven en la
  red interna de Docker Compose y **no** se exponen al host. Al ser single-origin
  (todo pasa por nginx) **no hay CORS** ni orígenes cruzados.
- **Stack:** TypeScript `strict` en todo. API con Fastify 4 + Drizzle ORM +
  PostgreSQL 16 (lat/lng como `double precision`, sin PostGIS). Front con Vite 5 +
  TypeScript vanilla + Leaflet 1.9 + `@tmcw/togeojson` (parseo GPX en el
  navegador) + `marked`/`dompurify` (markdown saneado). El track y el perfil de
  altimetría interactivo son propios: **sin dependencias de CDN**, para que la
  app funcione servida por HTTP plano y sin salida a internet más que los tiles.
- **Tiles gratuitos con atribución:** OpenTopoMap (default, montaña),
  OpenStreetMap y Esri World Imagery (satélite). **Sin Google.**
- **Storage:** disco local montado (`./storage`) con `gpx/ audio/ photos/ covers/`
  detrás de una interfaz `StorageDriver` (swapeable a S3/R2 en el futuro).

### Estructura del repo

```
/                    docker-compose.yml · .env.example · .dockerignore
/api                 Fastify + Drizzle (Dockerfile, src/…)
/web                 Vite + Leaflet + nginx (Dockerfile, nginx.conf, src/…)
/db/seed             seed.ts + circuitos.ts (5 circuitos de ejemplo)
/storage             volumen de archivos (gitignored salvo .gitkeep)
```

---

## Modelo de datos

- **`routes`** — metadata + stats calculadas del GPX (`distance_m`, `ascent_m`,
  `descent_m`, bbox, center) + `status` (`draft`/`published`) + `slug` + la
  **ficha mínima del Sistema** (ver abajo).
- **`pois`** — puntos de interés (12 tipos), `lat`/`lng`, markdown, audio, foto,
  video, `order_index`, `hidden`, FK a la ruta (cascade).
- **`poi_translations`** — i18n por POI (`es`/`en`/`cy`). En v1 se siembra solo `es`;
  el visor ya resuelve `?locale=` con fallback a `default_locale`.

Las migraciones corren **automáticamente al boot** de la API (DDL idempotente,
con `ADD COLUMN IF NOT EXISTS`: una base ya desplegada se actualiza sin perder
datos).

### Ficha mínima del Sistema

Cada circuito lleva los campos de la ficha del documento de trabajo: nombres
alternativos, acceso y punto de inicio, situación del suelo, usos compatibles e
incompatibles, estacionalidad, riesgos, estado de conservación, mantenimiento,
antecedentes, quién lo aporta y quién lo revisó, más una nota interna de gestión
que **no se publica**.

**Estado dentro del Sistema** (`system_state`):

| Estado | ¿Se publica? |
| --- | --- |
| `relevado` | No |
| `en_gestion_de_acuerdo` | No |
| `publicable` | **Sí** |
| `uso_local_no_difundible` | No |
| `suspendido` | No |

Es independiente de `status` (`draft`/`published`): **inventariar no es
publicar**. La regla se aplica en la API, no queda librada al criterio de quien
administra:

- `POST /api/admin/routes/:id/publish` devuelve **409** si el circuito no está
  `publicable`.
- Si un circuito publicado cambia a un estado no publicable, **baja de
  publicación automáticamente**.
- El botón *Publicar* del admin aparece deshabilitado, con el motivo a la vista.

**Situación del suelo** (`soil_situation`): `publico`, `privado_con_acuerdo`,
`privado_sin_acuerdo`, `titularidad_en_definicion`, `provincial_o_nacional`.

---

## API (prefijo `/api`)

**Públicos (lectura):**

| Método | Ruta | Descripción |
| --- | --- | --- |
| `GET` | `/api/health` | `{ ok: true }` |
| `GET` | `/api/routes` | Lista `published`. Query: `q, difficulty, activity, region, page, limit` |
| `GET` | `/api/routes/:slug?locale=es` | Ruta completa: metadata + `gpxUrl` + `pois[]` localizados |

Archivos estáticos en `/files/*` (gpx, audio, photos, covers).

**Admin (`Authorization: Bearer <ADMIN_TOKEN>`):**

```
GET|POST                 /api/admin/routes
GET|PATCH|DELETE         /api/admin/routes/:id
POST                     /api/admin/routes/:id/gpx        (multipart, parsea stats)
POST                     /api/admin/routes/:id/publish | /unpublish
POST|PATCH|DELETE        /api/admin/pois[/:id]
POST                     /api/admin/pois/reorder
POST                     /api/admin/uploads/audio | /photo | /cover  (multipart → { path })
```

El parsing de GPX es server-side (`@xmldom/xmldom` → `@tmcw/togeojson` → turf):
distancia (`@turf/length`), bbox/center (`@turf/bbox`/`@turf/center`) y ±desnivel
sumando deltas de elevación con umbral de 3 m para filtrar ruido de GPS.

---

## Deploy en el VPS (puerto configurable)

Requisitos: Docker + Docker Compose plugin.

```bash
git clone <repo> yaten && cd yaten
cp .env.example .env

# Generar un puerto random alto y usarlo en WEB_PORT y PUBLIC_BASE_URL:
PORT=$(shuf -i 20000-60000 -n 1); echo "usando puerto $PORT"

nano .env
#  · WEB_PORT=$PORT
#  · PUBLIC_BASE_URL=http://TU_VPS_IP:$PORT   (mismo host:puerto que abre el navegador)
#  · ADMIN_TOKEN=<token largo aleatorio>       (ej: openssl rand -hex 24)
#  · POSTGRES_PASSWORD=<password fuerte>
#  · DATABASE_URL debe usar ese mismo POSTGRES_PASSWORD

docker compose up -d --build          # levanta db + api + web; migraciones automáticas
docker compose exec api npm run seed  # (opcional) carga los 5 circuitos de ejemplo

# Abrir:
#   http://TU_VPS_IP:<WEB_PORT>/        → catálogo
#   http://TU_VPS_IP:<WEB_PORT>/admin   → pegar ADMIN_TOKEN
```

Variables de entorno (`.env.example`):

| Var | Descripción |
| --- | --- |
| `WEB_PORT` | **Único puerto publicado** en el VPS |
| `PUBLIC_BASE_URL` | `http://TU_VPS_IP:<WEB_PORT>` — base para URLs de archivos e íconos |
| `ADMIN_TOKEN` | Token bearer del panel admin |
| `POSTGRES_USER/PASSWORD/DB` | Credenciales de Postgres |
| `DATABASE_URL` | `postgres://<user>:<pass>@db:5432/<db>` |
| `STORAGE_DIR` | Ruta de storage dentro del contenedor (`/storage`) |
| `API_PORT` | Puerto interno de la API (no expuesto) |

> **Producción real:** para TLS/HTTPS conviene poner Caddy o nginx delante con un
> certificado (Let's Encrypt). Queda fuera del alcance de esta v1.

Para debug local podés descomentar el mapeo de puertos de `db`/`api` en
`docker-compose.yml`.

---

## Desarrollo local (sin Docker)

```bash
# 1) Postgres corriendo en localhost:5432 con la DB creada.
# 2) API
cd api && npm install
DATABASE_URL=postgres://rutas:rutas@localhost:5432/rutas \
STORAGE_DIR=$PWD/../storage ADMIN_TOKEN=dev PUBLIC_BASE_URL=http://localhost:5173 \
  npm run dev            # Fastify en :8080

# 3) Seed (opcional)
DATABASE_URL=… STORAGE_DIR=… npm run seed

# 4) Web (Vite proxya /api y /files a :8080)
cd ../web && npm install && npm run dev   # http://localhost:5173
```

### Calidad

```bash
cd api && npm run build    # tsc strict, limpio
cd api && npm test         # Vitest: parser de GPX (distancia/desnivel/bbox)
cd web && npm run build    # tsc --noEmit + vite build, limpio
```

---

## Guardrails aplicados

- **Data-driven:** rutas y POIs 100% desde la DB; nada hardcodeado.
- **POIs on-demand:** el visor hace `fetch` por ruta; no se inyecta JSON inline en el HTML.
- **Tiles legales:** OSM + OpenTopoMap + Esri, con atribución visible. Sin Google.
- **Secretos y puertos por env.** `storage/` y `.env` en `.gitignore`.
- **Markdown saneado** (`marked` + `dompurify`), TS `strict`, Zod en toda entrada,
  CORS resuelto por single-origin (proxy nginx).
- **Sin CDN:** todo el JS/CSS se sirve desde el propio contenedor. Nada se
  descarga de terceros en tiempo de ejecución (sólo los tiles del mapa).

## Datos de ejemplo

`npm run seed` carga 5 circuitos del área de Esquel — Cerro La Torta, Cerro
Veintiuno, Laguna La Zeta, Cerro Nahuel Pan y Cerro La Zeta — con 47 puntos de
interés y portadas generadas a partir del perfil de altimetría de cada traza.

Cuatro quedan publicados y **uno queda como `uso_local_no_difundible`**, para
mostrar en funcionamiento la regla de que un circuito puede estar en el
inventario sin difundirse.

> Las trazas son **sintéticas** y las coordenadas aproximadas: es material de
> demostración. Cada circuito lleva una nota interna de gestión recordando que
> debe reemplazarse por el relevamiento real antes de dar la ficha por cerrada.

## i18n

El schema y el endpoint de lectura localizada (`?locale=`) ya funcionan. El visor
tiene selector es/en/cy que re-fetchea POIs sin recargar el mapa. La carga de
traducciones por POI desde el admin queda como fase 2 (ver `// TODO` en el código).
