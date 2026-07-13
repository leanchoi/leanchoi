import { requireTenant } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { PageHeader } from "@/components/panel/shell";
import { Badge, Card, EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, { label: string; tone: "green" | "amber" | "red" | "neutral" }> = {
  PAID: { label: "Pagado", tone: "green" },
  PENDING: { label: "Pendiente", tone: "amber" },
  CANCELLED: { label: "Cancelado", tone: "red" },
  REFUNDED: { label: "Reembolsado", tone: "neutral" },
};

export default async function PedidosPage() {
  const session = await requireTenant();
  const orders = await db.order.findMany({
    where: { tenantId: session.tenantId },
    include: { items: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <>
      <PageHeader
        title="Pedidos"
        intro="El dinero de cada pedido pagado entra directo a tu cuenta de Mercado Pago."
      />
      {orders.length === 0 ? (
        <EmptyState title="Sin pedidos todavía" body="Cuando alguien reserve o compre, lo vas a ver acá." />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-ink/8 text-left text-xs uppercase tracking-wide text-ink/45">
                <th className="px-5 py-3.5 font-medium">Orden</th>
                <th className="px-3 py-3.5 font-medium">Cliente</th>
                <th className="px-3 py-3.5 font-medium">Detalle</th>
                <th className="px-3 py-3.5 font-medium">Canal</th>
                <th className="px-3 py-3.5 font-medium text-right">Recibís</th>
                <th className="px-5 py-3.5 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/8">
              {orders.map((order) => {
                const status = STATUS_LABEL[order.status];
                return (
                  <tr key={order.id}>
                    <td className="px-5 py-3.5">
                      <p className="font-mono text-xs font-semibold text-ink">{order.code}</p>
                      <p className="text-xs text-ink/45">
                        {order.createdAt.toLocaleDateString("es-AR", { day: "numeric", month: "short" })}
                      </p>
                    </td>
                    <td className="px-3 py-3.5">
                      <p className="text-ink">{order.customerName}</p>
                      <p className="text-xs text-ink/45">{order.customerEmail}</p>
                    </td>
                    <td className="px-3 py-3.5 text-ink/70">
                      {order.items.map((i) => `${i.title} ×${i.quantity}`).join(", ")}
                    </td>
                    <td className="px-3 py-3.5 text-ink/60">
                      {order.channel === "MASTER" ? "Marketplace" : "Tu sitio"}
                    </td>
                    <td className="px-3 py-3.5 text-right font-medium text-ink">
                      {formatMoney(order.sellerCents)}
                      <p className="text-xs font-normal text-ink/40">de {formatMoney(order.subtotalCents)}</p>
                    </td>
                    <td className="px-5 py-3.5">
                      <Badge tone={status.tone}>{status.label}</Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
