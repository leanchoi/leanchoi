# Andar — Plataforma de turismo multi-marca

Marketplace de **actividades turísticas y productos regionales** con:

- **Marketplace consolidador** (tu ecommerce master): todo el catálogo de la red en un solo lugar.
- **Sitios white-label por operador**: cada emprendimiento (ej. "Pepito Cabalgatas") tiene su web
  propia con dominio, identidad, templates y bloques editables — no se siente enlatada.
- **Split de pagos con Mercado Pago**: el dinero de cada venta va **directo a la cuenta del dueño**
  del producto/servicio, y tu comisión (10% configurable) se separa **automáticamente**
  (`marketplace_fee`). El inventario propio del master liquida 100% a tu cuenta.
- **Panel master**: insights completos de toda la red con inmersión por operador, inventario global
  (mostrar/ocultar cualquier publicación del marketplace), gestión de páginas independientes,
  pedidos, comisiones e integraciones OTA.
- **Panel del operador**: insights simples, carga de experiencias/productos, disponibilidad por
  fechas y cupos, pedidos, editor de su sitio (template + colores + bloques) y conexión de
  Mercado Pago en un click.
- **Servicios y productos**: las experiencias se reservan por fecha/horario/cupo; los productos
  se venden con stock.

## Stack

Next.js 14 (App Router, un solo servicio) · PostgreSQL + Prisma · Tailwind · Mercado Pago SDK ·
Docker Compose. Decisiones y alternativas en [`docs/arquitectura.md`](docs/arquitectura.md)
(incluye la evaluación de Medusa.js).

## Arranque local

```bash
cp .env.example .env          # completar AUTH_SECRET como minimo
docker compose up -d db       # o usar un Postgres propio
npm install
npm run setup                 # prisma db push + seed demo
npm run dev                   # http://localhost:3000
```

**Accesos demo** (contraseña `andar2026`):

| Rol | Email | Panel |
|---|---|---|
| Master | `admin@andar.local` | `/master` |
| Operador (Pepito Cabalgatas) | `pepito@andar.local` | `/panel` |
| Operador (Delta Kayak) | `delta@andar.local` | `/panel` |
| Operador (Cumbres Andinas) | `cumbres@andar.local` | `/panel` |

Sitios white-label en dev: `http://localhost:3000/sites/pepito` (o `pepito.localhost:3000`).
Sin credenciales de Mercado Pago el checkout corre en **modo demo** (marca la orden como pagada)
para poder probar el flujo completo.

## Deploy en VPS (Docker, puerto 3015)

```bash
git clone -b claude/tourism-marketplace-platform-q20zm9 https://github.com/leanchoi/leanchoi.git andar
cd andar && cp .env.example .env
# editar .env: AUTH_SECRET, dominios y credenciales de Mercado Pago
docker compose up -d --build   # app en :3015, Postgres interno
```

Guía completa (dominios de tenants con Caddy/Nginx, SSL automático, webhooks de MP):
[`docs/deploy-vps.md`](docs/deploy-vps.md)

## Documentación

| Doc | Contenido |
|---|---|
| [`docs/arquitectura.md`](docs/arquitectura.md) | Cómo está armado: multi-tenancy, modelo de datos, decisiones (Medusa vs. custom) |
| [`docs/pagos.md`](docs/pagos.md) | Split de pagos MP paso a paso, MODO, cripto (Sprintcheckout/Binance Pay/Bitso) |
| [`docs/integraciones-ota.md`](docs/integraciones-ota.md) | Investigación completa: Viator, GetYourGuide, Klook, Civitatis, Musement, Booking, Tripadvisor, Despegar, Atrápalo |
| [`docs/deploy-vps.md`](docs/deploy-vps.md) | Deploy con Docker, dominios propios por operador, SSL |

## Licencia

Código propietario — todos los derechos reservados. Ver [`LICENSE`](LICENSE).
