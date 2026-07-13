import "server-only";
import { db } from "@/lib/db";
import { splitOrder } from "@/lib/money";
import { orderCode } from "@/lib/utils";
import { mercadoPagoProvider } from "./payments/mercadopago";
import { refreshTenantTokenIfNeeded } from "./payments/mp-oauth";
import type { CheckoutResult } from "./payments/provider";

export type CheckoutInput = {
  listingId: string;
  slotId?: string;
  quantity: number;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  channel: "MASTER" | "TENANT_SITE";
};

export async function createCheckout(input: CheckoutInput, baseUrl: string) {
  const listing = await db.listing.findUnique({
    where: { id: input.listingId },
    include: { tenant: true },
  });
  if (!listing || listing.status !== "PUBLISHED") throw new Error("Listado no disponible");

  const quantity = Math.max(1, Math.min(20, input.quantity));
  let slot = null;

  if (listing.type === "ACTIVITY") {
    if (!input.slotId) throw new Error("Elegí fecha y horario");
    slot = await db.availabilitySlot.findUnique({ where: { id: input.slotId } });
    if (!slot || slot.listingId !== listing.id) throw new Error("Horario inválido");
    if (slot.capacity - slot.booked < quantity) throw new Error("No hay cupo suficiente para ese horario");
  } else {
    if (listing.stock !== null && listing.stock < quantity) throw new Error("Sin stock suficiente");
  }

  const unitPrice = slot?.priceCentsOverride ?? listing.priceCents;
  const subtotal = unitPrice * quantity;
  const masterOwned = listing.tenantId === null;
  const { commissionCents, sellerCents } = splitOrder(
    subtotal,
    listing.tenant?.commissionPct,
    masterOwned,
  );

  const order = await db.order.create({
    data: {
      code: orderCode(),
      tenantId: listing.tenantId,
      channel: input.channel,
      customerName: input.customerName,
      customerEmail: input.customerEmail,
      customerPhone: input.customerPhone ?? null,
      currency: listing.currency,
      subtotalCents: subtotal,
      commissionCents,
      sellerCents,
      items: {
        create: {
          listingId: listing.id,
          slotId: slot?.id ?? null,
          title: listing.title,
          unitPriceCents: unitPrice,
          quantity,
          totalCents: subtotal,
        },
      },
    },
  });

  await db.trackEvent.create({
    data: {
      type: "CHECKOUT_START",
      tenantId: listing.tenantId,
      channel: input.channel,
      listingId: listing.id,
    },
  });

  // token fresco del vendedor si la venta es de un tenant conectado
  const sellerToken = listing.tenantId ? await refreshTenantTokenIfNeeded(listing.tenantId) : null;

  const result: CheckoutResult = await mercadoPagoProvider.createCheckout(
    {
      id: order.id,
      code: order.code,
      currency: order.currency,
      subtotalCents: subtotal,
      commissionCents,
      customerEmail: input.customerEmail,
      customerName: input.customerName,
      items: [{ title: listing.title, quantity, unitPriceCents: unitPrice }],
      seller: listing.tenantId ? { mpAccessToken: sellerToken } : null,
    },
    baseUrl,
  );

  if (result.kind === "simulated") {
    await markOrderPaid(order.code, "demo");
    return { redirectUrl: `${baseUrl}/pago/exito?order=${order.code}&demo=1`, orderCode: order.code };
  }

  await db.order.update({ where: { id: order.id }, data: { mpPreferenceId: result.externalId } });
  return { redirectUrl: result.url, orderCode: order.code };
}

// Marca la orden como pagada y ajusta inventario (stock o cupos) una sola vez.
export async function markOrderPaid(code: string, paymentId: string) {
  const order = await db.order.findUnique({ where: { code }, include: { items: true } });
  if (!order || order.status === "PAID") return order;

  await db.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: order.id },
      data: { status: "PAID", paidAt: new Date(), mpPaymentId: paymentId },
    });
    for (const item of order.items) {
      if (item.slotId) {
        await tx.availabilitySlot.update({
          where: { id: item.slotId },
          data: { booked: { increment: item.quantity } },
        });
      } else {
        await tx.listing.updateMany({
          where: { id: item.listingId, stock: { not: null } },
          data: { stock: { decrement: item.quantity } },
        });
      }
      await tx.trackEvent.create({
        data: {
          type: "PURCHASE",
          tenantId: order.tenantId,
          channel: order.channel,
          listingId: item.listingId,
        },
      });
    }
  });
  return db.order.findUnique({ where: { code } });
}
