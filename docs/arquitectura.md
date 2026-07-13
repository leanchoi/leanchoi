# Arquitectura

## Vista general

Un solo servicio Next.js 14 (App Router) que sirve **cuatro superficies** sobre la misma base de
datos PostgreSQL:

| Superficie | Ruta | Quién la usa |
|---|---|---|
| Marketplace master | `/` (dominio master) | Público |
| Sitios white-label | cualquier otro dominio/subdominio → `/sites/[domain]` | Público |
| Panel del operador | `/panel` | Dueños de páginas independientes |
| Panel master | `/master` | Vos |

### Multi-tenancy por dominio

`src/middleware.ts` mira el header `Host` de cada request:

- Si es `MASTER_DOMAIN` (o `localhost`) → sirve el marketplace y los paneles.
- Cualquier otro host → rewrite interno a `/sites/<host>/...`. Ahí `resolveTenant()`
  (`src/lib/tenants.ts`) resuelve el tenant por: dominio propio exacto → subdominio de
  `PLATFORM_DOMAIN` → slug (URLs de preview `/sites/pepito`).

Para dominios propios (ej. `pepitocabalgatas.com`) solo hay que apuntar el DNS al VPS y cargar el
dominio en el panel master; el reverse proxy emite SSL on-demand (ver `docs/deploy-vps.md`).

### Sitios white-label que no se sienten enlatados

Cada tenant guarda un `siteConfig` JSON (validado con Zod en `src/lib/site-config.ts`):

- **3 templates** con identidad propia: `campo` (terracota/pizarra, serif), `litoral`
  (cobalto/crema, redondeado), `cumbre` (dark, negro y tan, esquinas rectas).
- **Theme fino**: 6 colores + radio de esquinas + tipografía (moderna/clásica/fuerte), aplicados
  como CSS variables (`--site-*`) en el layout del sitio.
- **8 bloques** componibles: hero (split o full-bleed), grilla de publicaciones, historia,
  galería, testimonios, números, FAQ y CTA. El dueño los ordena y edita desde `/panel/sitio`.

### Modelo de datos (Prisma)

- `Tenant`: página independiente + credenciales OAuth de Mercado Pago + `commissionPct` opcional.
- `Listing`: servicio (`ACTIVITY`) o producto (`PRODUCT`). `tenantId = null` ⇒ inventario propio
  del master. `visibleOnMaster` permite al master ocultar cualquier publicación del marketplace
  sin tocar el sitio del operador.
- `AvailabilitySlot`: fechas/horarios/cupos de las actividades (`booked` se incrementa al pagar).
- `Order` + `OrderItem`: snapshot de precios, canal de venta (`MASTER` | `TENANT_SITE`) y el
  reparto `subtotal / commission / seller` calculado al crear la orden.
- `TrackEvent`: analytics propio (vistas de página/listado, checkouts, compras) que alimenta los
  insights sin depender de terceros.

### Insights

`src/server/insights.ts` agrega todo con SQL/Prisma: KPIs, serie temporal (ventas + comisión),
top publicaciones, split por canal, tabla comparativa por tenant y conversión (compras/vistas).
El master ve toda la red y puede hacer drill-down por operador (`/master/operadores/[id]`);
cada operador ve solo lo suyo en una versión simplificada. La paleta de los gráficos está
validada para daltonismo y contraste (`src/lib/chart-colors.ts`).

## ¿Por qué no Medusa.js?

Lo evalué (v2, 2026) y **no lo usaría como base para esta plataforma**:

**Lo que Medusa da gratis**: carrito/checkout retail maduro, admin, módulos de productos,
promociones, multi-región, y un plugin de Mercado Pago de comunidad.

**Dónde cruje para este caso**:
1. **Reservas con disponibilidad** (fechas/horarios/cupos) no existen en su modelo; hay que
   construir un módulo custom igual de grande que el nuestro.
2. **Split de pagos por vendedor con OAuth** no está soportado por su arquitectura de payment
   providers (un provider global, no uno por vendedor). El marketplace multi-vendor en Medusa es
   una recipe de referencia, no un módulo estable.
3. **Sitios white-label con builder** son 100% frontend custom de todos modos.
4. **Operación**: agrega un backend aparte (Medusa server + admin + storefront) — más contenedores
   y actualizaciones para mantener en un VPS chico.

Conclusión: para retail puro conviene; acá el 70% del valor (reservas, split, multi-marca,
insights) igual es código propio, así que el framework sumaría fricción, no velocidad. La
alternativa evaluada queda documentada por si a futuro se separa la parte de "productos" a un
Medusa dedicado.

## Estructura del código

```
src/
  middleware.ts            ← ruteo multi-tenant por dominio
  app/
    (master)/              ← marketplace consolidador + login + resultado de pago
    sites/[domain]/        ← sitios white-label (layout tematizado + bloques)
    panel/                 ← back-office del operador
    master/                ← back-office master
    api/                   ← checkout, webhook MP, OAuth MP, tracking
  components/              ← UI compartida, bloques, charts, widgets de panel
  lib/                     ← db, auth (JWT cookie), site-config (Zod), dinero, theming
  server/
    checkout.ts            ← creación de orden + split + fulfillment
    insights.ts            ← agregaciones de analytics
    payments/              ← Mercado Pago (split + OAuth) y stubs MODO/cripto
    integrations/          ← conectores OTA (Viator implementado, resto documentado)
    actions/               ← server actions de los paneles
prisma/                    ← schema + seed demo
```
