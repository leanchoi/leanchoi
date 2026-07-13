import { MercadoPagoConfig, Preference, Payment } from "mercadopago";
import type { CheckoutOrder, CheckoutResult, PaymentProvider } from "./provider";

// ── Mercado Pago con Split de pagos (modelo marketplace) ─────────────────────
// Regla de oro del negocio: el dinero de cada venta va DIRECTO a la cuenta de
// Mercado Pago del dueño del producto/servicio. La comision del master (10%)
// se descuenta automaticamente via `marketplace_fee`, sin pasos manuales.
//
//  - Venta de un tenant  → preference creada con el access_token DEL TENANT
//                          (obtenido por OAuth) + marketplace_fee = comision.
//  - Venta del master    → preference creada con MP_ACCESS_TOKEN del master,
//                          sin fee (el 100% queda en la cuenta master).
//
// Docs: https://www.mercadopago.com.ar/developers/es/docs/split-payments/landing

export const mercadoPagoProvider: PaymentProvider = {
  id: "mercadopago",

  async createCheckout(order: CheckoutOrder, baseUrl: string): Promise<CheckoutResult> {
    const sellerToken = order.seller?.mpAccessToken ?? null;
    const masterToken = process.env.MP_ACCESS_TOKEN || null;
    const accessToken = sellerToken ?? masterToken;

    // Sin credenciales (entorno demo/local): simulamos el pago para que todo
    // el flujo sea navegable sin cuentas reales.
    if (!accessToken) return { kind: "simulated" };

    const client = new MercadoPagoConfig({ accessToken });
    const preference = new Preference(client);

    const isTenantSale = Boolean(sellerToken);
    const created = await preference.create({
      body: {
        items: order.items.map((item, i) => ({
          id: `${order.code}-${i}`,
          title: item.title,
          quantity: item.quantity,
          unit_price: item.unitPriceCents / 100,
          currency_id: order.currency,
        })),
        payer: { email: order.customerEmail, name: order.customerName },
        external_reference: order.code,
        // La comision del master solo aplica en ventas de tenants.
        ...(isTenantSale && order.commissionCents > 0
          ? { marketplace_fee: order.commissionCents / 100 }
          : {}),
        back_urls: {
          success: `${baseUrl}/pago/exito?order=${order.code}`,
          pending: `${baseUrl}/pago/pendiente?order=${order.code}`,
          failure: `${baseUrl}/pago/error?order=${order.code}`,
        },
        auto_return: "approved",
        notification_url: `${baseUrl}/api/webhooks/mercadopago`,
        statement_descriptor: "ANDAR",
      },
    });

    if (!created.init_point || !created.id) {
      throw new Error("Mercado Pago no devolvió init_point");
    }
    return { kind: "redirect", url: created.init_point, externalId: String(created.id) };
  },
};

// Consulta un pago usando el token correcto segun el vendedor de la orden.
export async function fetchPayment(paymentId: string, sellerAccessToken: string | null) {
  const accessToken = sellerAccessToken ?? process.env.MP_ACCESS_TOKEN;
  if (!accessToken) return null;
  const client = new MercadoPagoConfig({ accessToken });
  return new Payment(client).get({ id: paymentId });
}
