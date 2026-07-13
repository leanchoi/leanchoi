import { requireMaster } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { PageHeader } from "@/components/panel/shell";
import { Badge, Card } from "@/components/ui";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, { label: string; tone: "green" | "amber" | "red" | "neutral" }> = {
  PAID: { label: "Pagado", tone: "green" },
  PENDING: { label: "Pendiente", tone: "amber" },
  CANCELLED: { label: "Cancelado", tone: "red" },
  REFUNDED: { label: "Reembolsado", tone: "neutral" },
};

export default async function MasterPedidosPage() {
  await requireMaster();
  const orders = await db.order.findMany({
    include: { items: true, tenant: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 150,
  });

  return (
    <>
      <PageHeader
        title="Pedidos de toda la red"
        intro="Cada venta muestra el reparto: lo que recibe el operador y tu comisión."
      />
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr className="border-b border-ink/8 text-left text-xs uppercase tracking-wide text-ink/45">
              <th className="px-5 py-3.5 font-medium">Orden</th>
              <th className="px-3 py-3.5 font-medium">Vendedor</th>
              <th className="px-3 py-3.5 font-medium">Detalle</th>
              <th className="px-3 py-3.5 font-medium">Canal</th>
              <th className="px-3 py-3.5 font-medium text-right">Total</th>
              <th className="px-3 py-3.5 font-medium text-right">Tu comisión</th>
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
                      {order.createdAt.toLocaleDateString("es-AR", { day: "numeric", month: "short" })} · {order.customerName}
                    </p>
                  </td>
                  <td className="px-3 py-3.5 text-ink/70">{order.tenant?.name ?? "Propio (master)"}</td>
                  <td className="px-3 py-3.5 text-ink/70">
                    {order.items.map((i) => `${i.title} ×${i.quantity}`).join(", ")}
                  </td>
                  <td className="px-3 py-3.5 text-ink/60">
                    {order.channel === "MASTER" ? "Marketplace" : "Sitio propio"}
                  </td>
                  <td className="px-3 py-3.5 text-right font-medium">{formatMoney(order.subtotalCents)}</td>
                  <td className="px-3 py-3.5 text-right font-medium text-amber-burnt">
                    {order.tenantId === null ? formatMoney(order.subtotalCents) : formatMoney(order.commissionCents)}
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
    </>
  );
}
