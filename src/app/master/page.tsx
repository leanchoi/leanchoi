import Link from "next/link";
import { kpiSummary, salesSeries, topListings, channelSplit, tenantBreakdown } from "@/server/insights";
import { formatMoney } from "@/lib/money";
import { Kpi, BarRows, ChannelSplit, RangeTabs } from "@/components/panel/widgets";
import { SalesChart } from "@/components/charts";
import { PageHeader } from "@/components/panel/shell";
import { Badge, Card } from "@/components/ui";

export const dynamic = "force-dynamic";

// Insights master: toda la plataforma, con drill-down por pagina independiente.
export default async function MasterHome({ searchParams }: { searchParams: { dias?: string } }) {
  const days = [7, 30, 90].includes(Number(searchParams.dias)) ? Number(searchParams.dias) : 30;

  const [kpis, series, top, channels, breakdown] = await Promise.all([
    kpiSummary(days),
    salesSeries(days),
    topListings(days, 6),
    channelSplit(days),
    tenantBreakdown(days),
  ]);

  return (
    <>
      <PageHeader
        title="Insights de la plataforma"
        intro={`Todo lo que pasó en la red en los últimos ${days} días.`}
        action={<RangeTabs current={days} basePath="/master" />}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Ventas totales (GMV)" value={formatMoney(kpis.gmvCents)} hint={`${kpis.orders} pedidos pagados`} />
        <Kpi label="Tu comisión" value={formatMoney(kpis.commissionCents)} hint="Split automático de Mercado Pago" />
        <Kpi label="Ticket promedio" value={formatMoney(kpis.avgTicketCents)} hint={`${kpis.pendingOrders} pedidos pendientes`} />
        <Kpi label="Conversión" value={`${kpis.conversionPct}%`} hint={`${kpis.views.toLocaleString("es-AR")} visitas totales`} />
      </div>

      <Card className="mt-6 p-6">
        <h2 className="font-display text-lg font-semibold text-ink">Ventas y comisión por día</h2>
        <div className="mt-4">
          <SalesChart data={series} showCommission />
        </div>
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <h2 className="font-display text-lg font-semibold text-ink">Top publicaciones de la red</h2>
          <div className="mt-5">
            <BarRows
              rows={top.map((t) => ({
                label: t.listing?.title ?? "—",
                sublabel: t.listing?.tenant?.name ?? "Inventario propio",
                cents: t.totalCents,
              }))}
            />
          </div>
        </Card>
        <Card className="p-6">
          <h2 className="font-display text-lg font-semibold text-ink">Canal de venta</h2>
          <p className="mt-1 text-xs text-ink/50">Marketplace consolidador vs. sitios independientes.</p>
          <div className="mt-5">
            <ChannelSplit
              masterCents={channels.masterCents}
              sitioCents={channels.sitioCents}
              masterLabel="Marketplace Andar"
              sitioLabel="Sitios independientes"
            />
          </div>
          <p className="mt-4 text-xs text-ink/50">
            {channels.masterOrders + channels.sitioOrders} pedidos en total: {channels.masterOrders} por el
            marketplace, {channels.sitioOrders} por sitios propios.
          </p>
        </Card>
      </div>

      <Card className="mt-6 overflow-x-auto">
        <div className="flex items-center justify-between px-5 pt-5">
          <h2 className="font-display text-lg font-semibold text-ink">Por página independiente</h2>
          <p className="text-xs text-ink/45">Click en una fila para la inmersión completa</p>
        </div>
        <table className="mt-3 w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-ink/8 text-left text-xs uppercase tracking-wide text-ink/45">
              <th className="px-5 py-3 font-medium">Operador</th>
              <th className="px-3 py-3 font-medium text-right">Ventas</th>
              <th className="px-3 py-3 font-medium text-right">Tu comisión</th>
              <th className="px-3 py-3 font-medium text-right">Pedidos</th>
              <th className="px-3 py-3 font-medium text-right">Vistas</th>
              <th className="px-3 py-3 font-medium text-right">Conversión</th>
              <th className="px-5 py-3 font-medium">Mercado Pago</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/8">
            {breakdown.map((row) => (
              <tr key={row.name} className="transition-colors hover:bg-bone">
                <td className="px-5 py-3.5 font-medium text-ink">
                  {row.tenantId ? (
                    <Link
                      href={`/master/operadores/${row.tenantId}`}
                      className="text-pine underline-offset-4 hover:underline"
                    >
                      {row.name} →
                    </Link>
                  ) : (
                    row.name
                  )}
                </td>
                <td className="px-3 py-3.5 text-right">{formatMoney(row.gmvCents)}</td>
                <td className="px-3 py-3.5 text-right text-amber-burnt">{formatMoney(row.commissionCents)}</td>
                <td className="px-3 py-3.5 text-right">{row.orders}</td>
                <td className="px-3 py-3.5 text-right">{row.views.toLocaleString("es-AR")}</td>
                <td className="px-3 py-3.5 text-right">{row.conversionPct}%</td>
                <td className="px-5 py-3.5">
                  <Badge tone={row.mpConnected ? "green" : "amber"}>
                    {row.mpConnected ? "Conectado" : "Pendiente"}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
