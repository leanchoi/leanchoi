# Changelog

Todas las novedades de este proyecto se registran acá.
Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y
versionado [SemVer](https://semver.org/lang/es/).

## [No publicado]

Fases 1 a 8: modelo de datos, motor de cuestionario, PWA de campo, sync, devolución,
tablero, audio y hardening.

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
