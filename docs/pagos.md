# Pagos

## Modelo elegido: Mercado Pago — Split de pagos (marketplace)

Es exactamente el esquema que pediste y está soportado oficialmente por Mercado Pago Argentina:

> El comprador paga → el dinero entra **directo a la cuenta de Mercado Pago del vendedor**
> (dueño de la experiencia/producto) → tu comisión (`marketplace_fee`) se transfiere
> **automáticamente** a tu cuenta master en la misma operación.

Referencia oficial: https://www.mercadopago.com.ar/developers/es/docs/split-payments/landing

### Cómo está implementado acá

| Pieza | Archivo |
|---|---|
| Preference de Checkout Pro con `marketplace_fee` | `src/server/payments/mercadopago.ts` |
| OAuth de vendedores (vinculación 1-click desde su panel) | `src/server/payments/mp-oauth.ts` + `/api/mp/oauth/*` |
| Webhook de confirmación de pagos | `/api/webhooks/mercadopago` |
| Cálculo del reparto (10% default, override por tenant) | `src/lib/money.ts` (`splitOrder`) |

Reglas de negocio:

- **Venta de un operador** → preference creada con el `access_token` del operador (OAuth) +
  `marketplace_fee` = comisión → el split lo ejecuta MP, sin liquidaciones manuales.
- **Venta de inventario propio del master** → preference con tu `MP_ACCESS_TOKEN`, sin fee:
  100% a tu cuenta.
- La comisión es 10% global (`PlatformSetting`) con override por operador (campo
  `commissionPct`, editable en `/master/operadores/[id]`).
- Sin credenciales configuradas, el checkout corre en **modo demo** (marca pagado y sigue el
  flujo) para desarrollo.

### Setup productivo (una sola vez, ~15 minutos)

1. Crear la aplicación en https://www.mercadopago.com.ar/developers/panel/app
   - Tipo de solución: **Pagos online** → modelo **Marketplace**.
   - Redirect URL: `https://TU-DOMINIO/api/mp/oauth/callback`
   - Webhook: `https://TU-DOMINIO/api/webhooks/mercadopago` (evento: Pagos)
2. Copiar a `.env`: `MP_CLIENT_ID`, `MP_CLIENT_SECRET`, `MP_ACCESS_TOKEN` (credenciales de
   producción de TU cuenta) y `NEXT_PUBLIC_MP_PUBLIC_KEY`.
3. Cada operador entra a su panel → **Pagos → Conectar Mercado Pago** → autoriza → listo.
   Los tokens se renuevan solos (`refreshTenantTokenIfNeeded`).

Notas importantes del modelo split:

- El split funciona con dinero en cuenta MP y medios soportados por Checkout Pro; MP descuenta
  primero su comisión de procesamiento al vendedor y después separa tu `marketplace_fee`.
- El vendedor tiene que tener cuenta de Mercado Pago Argentina (gratis, la mayoría ya tiene).
- Vos ves todo el detalle por orden en `/master/pedidos` (total, comisión, estado).

## MODO

MODO no expone una API pública directa para comercios chicos: se integra vía adquirentes
(**Payway**, Getnet) o plugins de plataformas (Tiendanube, VTEX, WooCommerce). Si más adelante
querés sumar MODO, el camino es contratar Payway y implementar su checkout detrás de la interfaz
`PaymentProvider` (`src/server/payments/provider.ts` — ya hay un stub en `stubs.ts`).
Veredicto: **no para el MVP**; Mercado Pago cubre >90% del mercado AR y es el único con split
automático nativo.

## Cripto (cobros confiables en Argentina, 2026)

Opciones evaluadas, de más simple a más enterprise:

1. **Sprintcheckout** — gateway cripto argentino: checkout por QR/link/API, cobra USDT/USDC y
   liquida stablecoins (fee 0–1%). El más directo para e-commerce chico.
2. **Mobbex + Binance Pay** — agregador argentino (Córdoba) que unifica tarjetas, QR y cripto
   vía Binance Pay en una sola integración. Bueno si querés tarjeta+cripto en un solo proveedor.
3. **Bitso Business** — API enterprise (pay-ins cripto, liquidación en ARS, muy buen soporte
   LATAM). Para cuando haya volumen.

Todas encajan en la interfaz `PaymentProvider` con `createCheckout → redirect`. Sugerencia:
activar cripto **solo en el checkout del master** al principio (una sola cuenta receptora) y
liquidar manualmente a los operadores, porque ninguna de estas soluciones tiene split automático
por vendedor como MP.

## Extensión futura

`provider.ts` define la interfaz común. Para sumar un provider: implementar `createCheckout`,
agregar el webhook correspondiente en `/api/webhooks/<provider>` y registrar la opción en el
widget de compra. El resto del sistema (órdenes, split contable, insights) no cambia.
