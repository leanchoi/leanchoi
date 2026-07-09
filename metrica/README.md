# MÉTRICA

**Inteligencia de tarifas y disponibilidad turística de la Patagonia Andina.**
Una iniciativa de **co·LABtur** ([colabtur.org](https://www.colabtur.org) · [@colabtur](https://www.instagram.com/colabtur)).

Plataforma que scrapea precios públicos de Booking y Airbnb, los consolida como
serie temporal y los sirve en un dashboard con login y roles. Pensada para
crecer hasta un producto vendible a destinos y privados.

> Proyecto nuevo e independiente del scraper que corre en el puerto 3012.
> MÉTRICA se despliega en su propio puerto (por defecto **3013**) con su propia
> base de datos.

---

## Qué trae esta v1

- **Modelo de datos de dos fechas** — cada precio se guarda como
  `(listing · noche de estadía · día de observación)`. Es lo que permite
  reconstruir la curva de anticipación (cómo evoluciona el precio de una misma
  noche a medida que se acerca la fecha).
- **Identidad de listing propia** — cada alojamiento tiene un ID interno
  permanente; se correlaciona en el tiempo por el link/ID de plataforma
  (`external_id`), no por el nombre, y guarda historial de nombres si cambian.
- **Multimoneda ARS + USD + FX implícito** — captura ambos precios y calcula el
  tipo de cambio de cada día. Toggle ARS/USD en el dashboard.
- **Tipología** — clasifica cabaña / departamento / hotel / hostería / casa para
  cruzar y sacar insights.
- **Familias (presets)** — agrupan destinos + cadencia + hitos. Viene sembrada la
  **BENCHMARK Patagonia Andina** (Esquel, Trevelin, El Bolsón, El Hoyo, Lago
  Puelo, Bariloche, San Martín de los Andes, Villa La Angostura, Junín de los
  Andes) con:
  - rolling diario de 30 días + checkpoints a +2…+6 meses,
  - hito **Tulipanes** (1 oct → 15 nov, anual),
  - hito **Eclipse 2027** (23 ene → 20 feb 2027, único).
- **Login + roles (RBAC)** — pantalla de ingreso y panel de admin:
  - `admin`: todo + gestión de usuarios,
  - `editor`: crea/edita familias y destinos, lanza mediciones,
  - `viewer`: solo ve dashboards y descarga datos.
- **Cola de trabajos con progreso y ETA** — las mediciones corren en background
  (no bloquean), con barra de avance, ítem actual, ETA y botón cancelar en la
  pestaña **Trabajos**. "Medir ahora" ofrece prueba rápida (3 noches) o completa.
- **Motor de scraping resiliente** — Playwright stealth, rotación de UA, proxy,
  reintentos con backoff (heredado y probado del proyecto anterior).

---

## Deploy en el VPS (Docker + Postgres)

```bash
cp .env.example .env      # editá SECRET_KEY, ADMIN_PASSWORD, POSTGRES_PASSWORD, PROXY_URL
docker compose up -d --build
# Frontend: http://IP_DEL_VPS:3013   (login inicial: admin / lo que pongas en ADMIN_PASSWORD)
```

Levanta dos contenedores: `metrica-db` (Postgres persistente) y `metrica-app`.

### Verificación en 3 capas

```bash
docker compose exec app python -c "import urllib.request;print(urllib.request.urlopen('http://localhost:8000/health').status)"  # 200
curl -sS -o /dev/null -w '%{http_code}\n' http://localhost:3013/health   # 200
# desde tu compu:  curl -v http://IP_DEL_VPS:3013/health
```

Firewall (puerto nuevo): `sudo ufw allow 3013/tcp && sudo ufw reload` **y**
abrir 3013 en el panel cloud de Hostinger.

---

## Probar el scrapeo (en el VPS, con salida a internet)

```bash
docker compose exec app python -m app.cli scrape --query "Esquel" --platform booking --pages 1
```

Si da 0 resultados desde el datacenter, configurá `PROXY_URL` residencial en
`.env` y `docker compose up -d`.

---

## Seguridad (antes de venderlo)

- Cambiá `SECRET_KEY` (`openssl rand -hex 32`) y `ADMIN_PASSWORD` en `.env`.
- El primer usuario admin se crea solo en el primer arranque.
- Contraseñas con PBKDF2-HMAC-SHA256; sesiones con JWT HS256 (stdlib).
- Antes de exponerlo público conviene sumar HTTPS (Caddy) y rate-limit de login.

---

## Estructura

```
metrica/
  app/
    main.py            API + front + lifespan (init, seed, scheduler)
    config.py db.py    configuración y motor (SQLite dev / Postgres prod)
    security.py deps.py auth (PBKDF2 + JWT) y control por rol
    models.py          User, Family, Milestone, Destination, Listing, Observation, FxDaily, ScrapeRun
    planner.py         expande familias → noches a medir (rolling + checkpoints + hitos)
    seed.py            admin inicial + preset BENCHMARK Patagonia Andina
    scheduler.py       automatización por familia
    routers/           auth, users, families, data, dashboard
    scrapers/          motor stealth + booking/airbnb + runner (ARS/USD, dedup, 2 fechas)
    static/            login.html + index.html (dashboard, familias, destinos, datos, admin)
  tests/               planner, tipología, API/RBAC, pipeline de 2 fechas
  Dockerfile · docker-compose.yml · .env.example
```

## Estado de pruebas

```bash
pytest      # 14 tests: planner, tipología, auth/RBAC, pipeline de 2 fechas (navegador real)
```

La validación del scrapeo en vivo contra Booking/Airbnb se hace desde el VPS
(este entorno de desarrollo tiene esos dominios bloqueados por política de red).

---

## Roadmap (próximas fases)

Migración a TimescaleDB para agregados continuos · cola Redis con
planner/dispatcher y proxies rotativos · dashboard con cross-filter y curva de
anticipación interactiva · deep-scrape por listing (tipología fina, desglose de
calificaciones) · predicción de precio/ocupación · reportes one-pager PDF con
marca · automatizaciones (Gmail, Calendar, Canva para @colabtur).
