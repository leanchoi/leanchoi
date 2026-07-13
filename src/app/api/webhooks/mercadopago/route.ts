import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fetchPayment } from "@/server/payments/mercadopago";
import { markOrderPaid } from "@/server/checkout";

// Webhook de Mercado Pago: confirma pagos de forma asincronica.
// MP reintenta si no respondemos 200, asi que siempre devolvemos 200 salvo
// error real de procesamiento.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}) as any);
    const topic = body?.type ?? req.nextUrl.searchParams.get("type") ?? req.nextUrl.searchParams.get("topic");
    const paymentId = body?.data?.id ?? req.nextUrl.searchParams.get("data.id") ?? req.nextUrl.searchParams.get("id");

    if (topic !== "payment" || !paymentId) {
      return NextResponse.json({ ok: true, ignored: true });
    }

    // Buscamos primero con el token master; si el pago pertenece a un
    // vendedor OAuth, reintentamos con cada token de tenant involucrado via
    // external_reference (el code de la orden viaja en el pago).
    let payment = await fetchPayment(String(paymentId), null).catch(() => null);

    if (!payment) {
      const tenants = await db.tenant.findMany({
        where: { mpAccessToken: { not: null } },
        select: { mpAccessToken: true },
      });
      for (const t of tenants) {
        payment = await fetchPayment(String(paymentId), t.mpAccessToken).catch(() => null);
        if (payment) break;
      }
    }

    if (!payment?.external_reference) {
      return NextResponse.json({ ok: true, ignored: true });
    }

    if (payment.status === "approved") {
      await markOrderPaid(payment.external_reference, String(payment.id));
    } else if (payment.status === "cancelled" || payment.status === "rejected") {
      await db.order.updateMany({
        where: { code: payment.external_reference, status: "PENDING" },
        data: { status: "CANCELLED" },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[webhook mp]", err);
    return NextResponse.json({ error: "webhook error" }, { status: 500 });
  }
}
