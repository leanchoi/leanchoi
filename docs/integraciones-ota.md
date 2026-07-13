# Integraciones con OTAs (investigación 2026)

Dos direcciones posibles, no confundirlas:

- **Inbound** (nutrir TU catálogo con inventario de ellos): ganás comisión de afiliado/reseller.
- **Outbound** (distribuir el inventario de TUS operadores en sus marketplaces): ellos venden lo tuyo.

Los conectores viven en `src/server/integrations/` y su estado se ve en `/master/integraciones`.

## Resumen ejecutivo

| Plataforma | Inbound (vender lo de ellos) | Outbound (que vendan lo tuyo) | Esfuerzo |
|---|---|---|---|
| **Viator (Tripadvisor)** | ✅ Affiliate API, acceso básico SIN aprobación | Vía extranet de Viator como supplier | Bajo — **empezar acá** |
| **Civitatis** | ✅ Programa afiliados con API/widgets, fuerte en LATAM | Alta como proveedor (civitatis.com/providers) | Bajo |
| **GetYourGuide** | Afiliados (links/widgets); Partner API con acuerdo | ⚠️ Exige que VOS expongas una Supplier API | Medio/Alto |
| **Klook** | Afiliados (2–5%), API solo partners grandes | Alta manual como merchant | Bajo (afiliado) |
| **TUI Musement** | Afiliados (7% fijo o rev-share) | Acuerdo comercial B2B | Bajo (afiliado) |
| **Booking.com** | Demand API V3 (incluye atracciones) solo partners con volumen | Programa de partners | Alto — más adelante |
| **Tripadvisor** | Content API (solo contenido: reviews/fotos, no ventas) | Los tours se venden vía Viator | Bajo (contenido) |
| **Despegar** | Programa afiliados con API key (validación ~48h) | Acuerdo comercial | Bajo/Medio |
| **Atrápalo** | Afiliación por contacto directo (afiliados@atrapalo.com), sin API pública | — | Bajo |

## Detalle por plataforma

### Viator / Tripadvisor — la puerta de entrada
- **Affiliate API** con tres niveles: *basic* (catálogo, precios, disponibilidad — sin
  pre-aprobación, gratis), *full*, y *full + booking* (reservar dentro de tu plataforma).
- **Merchant API**: vos sos merchant of record (facturás vos, soporte vos, depósito de garantía
  y certificación técnica). Para una segunda etapa.
- El conector `viator.ts` ya implementa búsqueda de productos contra
  `api.viator.com/partner/products/search` — solo falta `VIATOR_API_KEY` en el `.env`
  (se pide en https://partnerresources.viator.com/travel-commerce/affiliate/).
- Docs: https://docs.viator.com/partner-api/

### GetYourGuide
- Para **vender su inventario**: programa de afiliados (widgets/links con comisión). La Partner
  API transaccional requiere acuerdo comercial.
- Para **distribuir tu inventario**: GYG no consume APIs de terceros — exige que el supplier
  exponga una **Supplier API propia** (endpoints de disponibilidad/reserva/cancelación que ELLOS
  llaman). Está en el roadmap del proyecto: implementar el estándar **OCTO** (octo.travel) deja
  esa puerta abierta para GYG y otros a la vez.
- Docs: https://code.getyourguide.com/partner-api-spec/ · https://integrator.getyourguide.com/

### Civitatis
- Programa de afiliados muy fuerte en español/LATAM con API y widgets embebibles; ideal para tu
  público. Alta directa en https://www.civitatis.com/es/afiliados/.
- También podés dar de alta a tus operadores como **proveedores** de Civitatis (outbound).

### Klook / TUI Musement
- Ambos: afiliación con links/widgets (Klook 2–5%; Musement 7% fijo o revenue share 30–50% de su
  comisión). APIs transaccionales solo con acuerdos enterprise. Buenos para sumar catálogo urbano
  internacional sin esfuerzo técnico.

### Booking.com
- Su Demand API V3 unifica todos los productos (incluye atracciones) pero el programa de partners
  pide volumen/track record. No es viable de arranque; reevaluar con tracción.

### Tripadvisor Content API
- Solo contenido (ratings, reviews, fotos) para **enriquecer tus fichas** — no vende. La venta de
  actividades del grupo Tripadvisor se hace por Viator. Acceso para partners aprobados.

### Despegar
- Programa de afiliados con API key: registro, validación en ~48h y API de actividades/hoteles.
  Fuerte en Argentina; útil sobre todo como canal outbound de acuerdos comerciales.
- Docs: https://dev.despegar.com/

### Atrápalo
- Sin API pública; afiliación por contacto directo (afiliados@atrapalo.com). Baja prioridad.

## Estrategia recomendada

1. **Ya** — Viator basic + Civitatis afiliados: catálogo internacional con comisión, sin
   aprobaciones pesadas. Credenciales por `.env`, importación como listados `source: VIATOR`.
2. **Con tracción** — Viator full+booking (reserva sin salir de tu web) y Despegar.
3. **Outbound** — implementar una Supplier API estándar **OCTO** sobre nuestro modelo de
   `AvailabilitySlot` (ya es compatible conceptualmente: producto → opciones → slots con cupo).
   Con eso, GetYourGuide, Viator supplier-side y channel managers (Bókun, Rezdy, TourCMS) pueden
   consumir el inventario de tus operadores.
4. **Booking.com** — recién con volumen demostrable.

## Nota técnica

Todos los conectores implementan la interfaz `OtaConnector` (`types.ts`): `status()` +
`search()` opcional. Importar un producto externo lo crea como `Listing` del master con
`source` y `externalId`, así el inventario propio y el de OTAs conviven en el mismo catálogo y
en los mismos insights.
