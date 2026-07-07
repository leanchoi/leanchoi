# Scraper de precios · Booking + Airbnb

Sistema para **scrapear precios de alojamientos** de Booking y Airbnb, guardarlos
en una base de datos y consultarlos desde un **frontend web**. El proceso de
scrapeo es **modificable** (destinos y periodicidad) y **automatizado** (scheduler).

Esta es la **versión light**: prioriza la parte difícil — que el scrapeo funcione
y aguante las barreras anti-bot de estas plataformas — sobre la que luego iremos
construyendo mejoras.

---

## Qué hace

- **Scrapea** Booking y Airbnb (precio, nombre, nota, nº de opiniones, URL, fechas).
- **Guarda** cada precio observado como una serie temporal en una BD (SQLite por
  defecto; Postgres cambiando una variable).
- **Frontend** en `/` para:
  - ver y filtrar los datos (por destino, plataforma, rango de precio, texto),
  - **descargarlos en CSV**,
  - **crear/editar/pausar/borrar destinos** y fijar **qué se scrapea y cada cuánto**.
- **Automatización**: cada destino tiene su periodicidad (cada N minutos o una
  expresión *cron*); un scheduler lanza los scrapeos solo.
- **CLI** para probar el scrapeo desde la terminal (clave en el VPS).

---

## La parte difícil: cómo vence las barreras

Toda la lógica anti-bloqueo está en `app/scrapers/` y es lo que hay que seguir
mejorando. Lo que ya hace la versión light:

| Técnica | Dónde | Qué resuelve |
|---|---|---|
| **Navegador real (Playwright + Chromium)** | `base.py` | Ejecuta el JS de la página; muchas defensas exigen un navegador de verdad. |
| **Stealth / anti-fingerprint** | `stealth.py` | Oculta `navigator.webdriver`, rellena `plugins`/`languages`, inyecta `window.chrome`, parchea WebGL y `Permissions`. Quita la huella de headless que detectan DataDome/PerimeterX/Akamai. |
| **UA + cabeceras realistas** | `base.py` | Rota user-agents de Chrome real, `Accept-Language`, `Sec-Ch-Ua`, locale `es-ES`, timezone y viewport coherentes. |
| **Comportamiento humano** | `base.py` | Pausas aleatorias y scroll gradual (dispara carga perezosa y parece humano). |
| **Detección de bloqueo + reintentos** | `base.py`, `stealth.py` | Detecta captchas/pantallas anti-bot y reintenta con *backoff* exponencial rotando contexto. |
| **Soporte de proxy** | `base.py`, `.env` | Enruta por proxy (idealmente **residencial/rotativo**) — el factor decisivo desde un datacenter. |
| **Extracción robusta** | `booking.py`, `airbnb.py` | Booking por `data-testid` (estables); **Airbnb por el JSON embebido** de la página (resiste el ofuscado de clases CSS) con *fallback* a DOM. |
| **Bloqueo de recursos** | `base.py` | Aborta imágenes/fuentes/media: más rápido y menos huella. |

> **El único factor que no se puede simular en código es la IP.** Booking y
> Airbnb bloquean rangos de datacenter con agresividad. En tu VPS, configura un
> **proxy residencial rotativo** en `PROXY_URL` (`.env`) — es lo que marca la
> diferencia entre 0 resultados y un scrapeo estable.

---

## Estado y qué está probado ✅

La suite (`pytest`) cubre, **sin salir a internet**:

- **Parsers** de Booking (DOM) y Airbnb (JSON embebido + *fallback* DOM) contra fixtures.
- **Parseo de precios** en formato europeo (`1.234,56`) y anglosajón (`1,234.56`),
  incluida la ambigüedad miles/decimales (`€ 1.210` → 1210, no 1.21).
- **Anti-bloqueo real**: lanza Chromium y verifica que `navigator.webdriver` queda
  oculto, `window.chrome` presente, plugins no vacíos y el UA no delata *HeadlessChrome*.
- **Pipeline end-to-end del navegador**: sirve las fixtures por HTTP local y ejecuta
  el scraper completo (launch → navegar → render → extraer → parsear) para ambas plataformas.
- **API + BD**: CRUD de destinos, filtros de consulta y descarga CSV.

```bash
pytest -q        # 15 tests, todos en verde
```

> ⚠️ **Importante sobre el scrapeo en vivo.** El entorno donde se generó este
> código tiene una **política de red que bloquea `booking.com` y `airbnb.com`**
> (por eso no hay una prueba en vivo aquí). Toda la cadena está probada contra
> páginas equivalentes servidas en local. **La validación contra los sitios reales
> tienes que lanzarla tú desde el VPS**, que sí tiene salida libre — está a un
> comando (ver abajo). Es lo esperado: el diseño asume ejecución en tu infraestructura.

---

## Puesta en marcha

### Opción A — Docker (recomendada para el VPS)

```bash
cp .env.example .env         # y edita PROXY_URL, etc.
docker compose up --build -d
# Frontend:  http://localhost:8000
```

### Opción B — Directo en el VPS (sin Docker)

```bash
./run.sh                     # crea venv, instala deps + Chromium, inicializa BD
source .venv/bin/activate
python -m app.cli serve      # arranca front + API + scheduler en :8000
```

---

## Probar el scrapeo (hazlo primero en el VPS)

El comando más importante: dispara un scrapeo real y te imprime lo que saca,
**sin tocar la BD**. Úsalo para afinar la lógica contra los sitios reales.

```bash
python -m app.cli scrape --query "Madrid"    --platform booking --pages 1
python -m app.cli scrape --query "Barcelona" --platform airbnb  --json

# Con proxy (define PROXY_URL en .env). Ejemplo de salida esperada:
#  1. Hotel Gran Via Capital          240.0 EUR | ⭐ 8.6
#  2. Plaza Mayor Suites             1180.0 EUR | ⭐ 9.1
```

Si sale `0 resultados`, casi siempre es la IP: configura un proxy residencial.

---

## Despliegue en VPS (Docker, acceso por IP:puerto)

Pensado para acceder directo por `http://IP_DEL_VPS:PUERTO` (sin reverse proxy).

**Puerto:** por defecto `HOST_PORT=3012` (elegido para no chocar con otros
servicios). El lado izquierdo del mapeo es el puerto del VPS; el derecho (`8000`)
es interno y no se toca. La app escucha en `0.0.0.0` dentro del contenedor.

### 0. Ver qué puertos están libres (antes de elegir HOST_PORT)

```bash
docker ps --format 'table {{.Names}}\t{{.Ports}}'   # puertos ya usados por contenedores
sudo ss -tlnp | grep LISTEN                          # puertos ocupados en el host
```

Si 3012 estuviera ocupado, pon otro en `.env`: `HOST_PORT=3013`.

### 1. Arrancar

```bash
cp .env.example .env          # ajusta PROXY_URL y, si hace falta, HOST_PORT
docker compose up -d --build
```

### 2. Verificación en 3 capas

> Esta imagen es `python:3.11-slim`: **no trae `curl` ni `wget`**, así que la
> comprobación de dentro del contenedor usa `python`.

```bash
# Capa 1 — dentro del contenedor (¿arrancó y escucha?)
docker compose logs --tail=50
docker compose exec app python -c "import urllib.request; print(urllib.request.urlopen('http://localhost:8000/health').status)"   # -> 200

# Capa 2 — desde el host del VPS (¿el mapeo de puertos funciona?)
curl -sS -o /dev/null -w '%{http_code}\n' http://localhost:3012/health        # -> 200

# Capa 3 — desde TU ordenador (¿el firewall deja pasar?)
#   curl -v http://IP_DEL_VPS:3012/health
```

El despliegue no está listo hasta que la **Capa 3 (desde fuera) devuelve 200**.

### 3. Firewall — recuerda las DOS capas

```bash
sudo ufw allow 3012/tcp && sudo ufw reload     # solo si ufw está activo
```

Y además abre el puerto en el **panel cloud de tu proveedor** (en Hostinger:
firewall de red) — eso no se ve desde el VPS y es la causa nº1 de "desde dentro
funciona pero desde fuera no".

### Diagnóstico rápido

| Síntoma | Causa probable | Arreglo |
|---|---|---|
| `port is already allocated` al levantar | Puerto del host ocupado | Cambia `HOST_PORT` en `.env` |
| Capa 2 da `000`/refused | App escuchando en `127.0.0.1` | Ya forzado a `0.0.0.0` (revisa `environment` del compose) |
| Capa 1/2 OK pero Capa 3 no | Firewall (ufw **o** panel Hostinger) | Abre el puerto en ambos |
| `200` dentro pero `000` en el host | Mapeo de puertos mal | Revisa `HOST_PORT:8000` en el compose |
| Contenedor `unhealthy` / reinicia | La app no arranca | `docker compose logs` (mira el error real) |

> **Memoria:** este servicio lanza Chromium, que consume RAM. En un VPS pequeño
> (≤1 GB) reduce `MAX_PAGES` y evita scrapeos concurrentes; `shm_size: 1gb` ya
> está configurado en el compose para que Chromium no se quede sin memoria compartida.

---

## Uso del frontend

Abre `http://TU_VPS:8000` y verás tres pestañas:

- **Datos** — tabla filtrable de precios + botón *Descargar CSV*.
- **Destinos** — alta/edición: qué destino, plataformas, nº de adultos/noches,
  días hasta el check-in, moneda, **periodicidad** (cada N min o *cron*) y páginas.
  Botón *Scrapear ahora* para lanzarlo al momento.
- **Ejecuciones** — historial de cada scrapeo con estado (`ok`/`blocked`/`error`) y
  nº de items, para diagnosticar bloqueos.

---

## API (resumen)

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/destinations` | Lista destinos |
| POST | `/api/destinations` | Crea destino (programa su job) |
| PUT | `/api/destinations/{id}` | Edita destino (re-programa) |
| DELETE | `/api/destinations/{id}` | Borra destino |
| POST | `/api/destinations/{id}/run` | Scrapea ese destino ahora |
| GET | `/api/prices` | Consulta precios (filtros: `destination_id`, `platform`, `min_price`, `max_price`, `search`) |
| GET | `/api/prices.csv` | Descarga en CSV (mismos filtros) |
| GET | `/api/runs` | Historial de ejecuciones |
| GET | `/api/stats` | Contadores |

---

## Configuración (`.env`)

Lo esencial (ver `.env.example` para todo):

```ini
DATABASE_URL=sqlite:///data/prices.db   # o postgresql+psycopg://...
PROXY_URL=                              # http://user:pass@host:puerto  (residencial!)
HEADLESS=true
MIN_DELAY=1.5
MAX_DELAY=4.0
MAX_RETRIES=3
BLOCK_RESOURCES=true
DEFAULT_CURRENCY=EUR
```

---

## Estructura

```
app/
  main.py            API FastAPI + sirve el frontend
  config.py          Configuración (.env)
  db.py / models.py  BD (SQLAlchemy): Destination, PricePoint, ScrapeRun
  schemas.py         Esquemas Pydantic
  scheduler.py       Automatización por destino (APScheduler)
  cli.py             CLI (scrape / serve / initdb / add-destination / run)
  scrapers/
    base.py          Motor stealth: navegador, UA, proxy, reintentos, humano
    stealth.py       Anti-fingerprint (JS inyectado + señales de bloqueo)
    booking.py       Scraper Booking (DOM data-testid)
    airbnb.py        Scraper Airbnb (JSON embebido + fallback DOM)
    util.py          Parseo de precio/rating/enteros
    runner.py        Orquesta un scrapeo y persiste
  static/index.html  Frontend (una sola página)
tests/               15 tests (parsers, precios, anti-bot real, e2e navegador, API)
Dockerfile / docker-compose.yml / run.sh
```

---

## Roadmap (siguientes mejoras)

Esta es la base. Lo siguiente a construir encima:

1. **Proxies residenciales rotativos** por petición (pool) y reintento con IP nueva ante bloqueo.
2. **Persistencia de cookies/sesión** para reducir *challenges* repetidos.
3. **Deduplicado y evolución de precios** (gráficas de tendencia por alojamiento).
4. **Más plataformas** (Expedia, Vrbo) reutilizando `BaseScraper`.
5. **Alertas** (bajada de precio, umbral) y export programado.
6. **Autenticación** del frontend antes de exponerlo públicamente.

---

## Aviso legal

Scrapea de forma responsable: respeta los Términos de cada plataforma y la
normativa aplicable (incluida la protección de datos), limita la frecuencia y
usa estos datos solo para fines legítimos (análisis de mercado, uso propio).
