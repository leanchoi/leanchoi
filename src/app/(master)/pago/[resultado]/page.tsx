import Link from "next/link";
import { notFound } from "next/navigation";
import { Button, Card } from "@/components/ui";
import { orderByCode } from "@/server/queries";
import { formatMoney } from "@/lib/money";

export const dynamic = "force-dynamic";

const COPY: Record<string, { title: string; body: string; tone: string }> = {
  exito: {
    title: "¡Reserva confirmada!",
    body: "Te enviamos el detalle por email. El operador ya recibió tu reserva.",
    tone: "text-pine",
  },
  pendiente: {
    title: "Pago en proceso",
    body: "Mercado Pago está procesando tu pago. Te avisamos por email apenas se acredite.",
    tone: "text-amber-burnt",
  },
  error: {
    title: "El pago no se completó",
    body: "No se realizó ningún cargo. Podés intentarlo de nuevo cuando quieras.",
    tone: "text-red-700",
  },
};

export default async function PagoResultadoPage({
  params,
  searchParams,
}: {
  params: { resultado: string };
  searchParams: { order?: string; demo?: string };
}) {
  const copy = COPY[params.resultado];
  if (!copy) notFound();
  const order = searchParams.order ? await orderByCode(searchParams.order) : null;

  return (
    <div className="mx-auto max-w-xl px-5 py-20">
      <Card className="p-8 text-center">
        <h1 className={`font-display text-3xl font-bold ${copy.tone}`}>{copy.title}</h1>
        <p className="mt-3 leading-relaxed text-ink/60">{copy.body}</p>
        {searchParams.demo && (
          <p className="mx-auto mt-4 max-w-sm rounded-lg bg-amber-soft px-4 py-2.5 text-sm text-amber-burnt">
            Modo demo: no hay credenciales de Mercado Pago configuradas, la orden se marcó como pagada
            para que pruebes el flujo completo.
          </p>
        )}

        {order && (
          <div className="mt-7 rounded-lg border border-ink/10 bg-bone p-5 text-left text-sm">
            <div className="flex justify-between">
              <span className="text-ink/50">Orden</span>
              <span className="font-mono font-semibold">{order.code}</span>
            </div>
            {order.items.map((item) => (
              <div key={item.id} className="mt-2 flex justify-between">
                <span className="text-ink/80">
                  {item.title} × {item.quantity}
                  {item.slot &&
                    ` · ${new Date(item.slot.startsAt).toLocaleDateString("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`}
                </span>
                <span className="font-medium">{formatMoney(item.totalCents, order.currency)}</span>
              </div>
            ))}
            <div className="mt-3 flex justify-between border-t border-ink/10 pt-3 font-semibold">
              <span>Total</span>
              <span>{formatMoney(order.subtotalCents, order.currency)}</span>
            </div>
            {order.tenant && (
              <p className="mt-3 text-xs text-ink/50">
                Vendido por {order.tenant.name}. El pago va directo a su cuenta.
              </p>
            )}
          </div>
        )}

        <div className="mt-8 flex justify-center gap-3">
          <Button href="/experiencias" variant="primary">
            Seguir explorando
          </Button>
          {params.resultado === "error" && order?.items[0] && (
            <Button href={`/l/${order.items[0].listing.slug}`} variant="outline">
              Reintentar
            </Button>
          )}
        </div>
      </Card>
      <p className="mt-6 text-center text-xs text-ink/40">
        ¿Problemas con tu pago? Escribinos a <Link href="mailto:hola@andar.tur.ar" className="underline">hola@andar.tur.ar</Link>
      </p>
    </div>
  );
}
