// Abstraccion de pasarelas de pago. Mercado Pago es el provider principal
// (split de pagos marketplace). MODO y cripto se enchufan implementando esta
// misma interfaz — ver docs/pagos.md para el estado de cada uno.

export type CheckoutOrder = {
  id: string;
  code: string;
  currency: string;
  subtotalCents: number;
  commissionCents: number;
  customerEmail: string;
  customerName: string;
  items: { title: string; quantity: number; unitPriceCents: number }[];
  // vendedor: credenciales MP del tenant, o null si el inventario es del master
  seller: { mpAccessToken: string | null } | null;
};

export type CheckoutResult =
  | { kind: "redirect"; url: string; externalId: string }
  // sin credenciales configuradas: modo demo, marca la orden como pagada
  | { kind: "simulated" };

export interface PaymentProvider {
  id: string;
  createCheckout(order: CheckoutOrder, baseUrl: string): Promise<CheckoutResult>;
}
