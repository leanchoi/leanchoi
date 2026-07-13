import { requireTenant } from "@/lib/auth";
import { db } from "@/lib/db";
import { kpiSummary, salesSeries, topListings, channelSplit, upcomingBookings } from "@/server/insights";
import { formatMoney } from "@/lib/money";
import { Kpi, BarRows, ChannelSplit, RangeTabs } from "@/components/panel/widgets";
import { SalesChart } from "@/components/charts";
import { PageHeader } from "@/components/panel/shell";
import { Card } from "@/components/ui";

export const dynamic = "force-dynamic";

// Insights del operador: version simple, solo sus numeros.
export default async function PanelHome({ searchParams }: { searchParams: { dias?: string } }) {
  const session = await requireTenant();
  const days = [7, 30, 90].includes(Number(searchParams.dias)) ? Number(searchParams.dias) : 30;

  const [tenant, kpis, series, top, channels, upcoming] = await Promise.all([
    db.tenant.findUniqueOrThrow({ where: { id: session.tenantId } }),
    kpiSummary(days, session.tenantId),
    salesSeries(days, session.tenantId),
    topListings(days, 5, session.tenantId),
    channelSplit(days, session.tenantId),
    upcomingBookings(session.tenantId),
  ]);

  return (
    <>
      <PageHeader
        title={`Hola, ${session.name}`}
        intro={`Así viene ${tenant.name} en los últimos ${days} días.`}
        action={<RangeTabs current={days} basePath="/panel" />}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Ventas" value={formatMoney(kpis.gmvCents)} hint={`${kpis.orders} pedidos pagados`} />
        <Kpi
          label="Recibís en tu cuenta"
          value={formatMoney(kpis.sellerCents)}
          hint="Después de la comisión de la red"
        />
        <Kpi label="Ticket promedio" value={formatMoney(kpis.avgTicketCents)} />
        <Kpi label="Conversión" value={`${kpis.conversionPct}%`} hint={`${kpis.views} visitas`} />
      </div>

      <Card className="mt-6 p-6">
        <h2 className="font-display text-lg font-semibold text-ink">Ventas por día</h2>
        <div className="mt-4">
          <SalesChart data={series} />
        </div>
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <h2 className="font-display text-lg font-semibold text-ink">Lo más vendido</h2>
          <div className="mt-5">
            <BarRows
              rows={top.map((t) => ({
                label: t.listing?.title ?? "—",
                sublabel: `${t.quantity} unidades`,
                cents: t.totalCents,
              }))}
            />
          </div>
        </Card>
        <Card className="p-6">
          <h2 className="font-display text-lg font-semibold text-ink">¿Dónde te compran?</h2>
          <p className="mt-1 text-xs text-ink/50">Tu sitio propio vs. el marketplace de la red.</p>
          <div className="mt-5">
            <ChannelSplit masterCents={channels.masterCents} sitioCents={channels.sitioCents} />
          </div>
        </Card>
      </div>

      <Card className="mt-6 p-6">
        <h2 className="font-display text-lg font-semibold text-ink">Próximas reservas</h2>
        {upcoming.length === 0 ? (
          <p className="mt-4 text-sm text-ink/50">No hay reservas futuras confirmadas.</p>
        ) : (
          <div className="mt-4 divide-y divide-ink/8">
            {upcoming.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-4 py-3 text-sm">
                <div>
                  <p className="font-medium text-ink">{item.listing.title}</p>
                  <p className="text-xs text-ink/50">
                    {item.order.customerName} · {item.quantity} {item.quantity === 1 ? "persona" : "personas"} ·{" "}
                    {item.order.code}
                  </p>
                </div>
                <p className="shrink-0 text-ink/70">
                  {item.slot &&
                    new Date(item.slot.startsAt).toLocaleDateString("es-AR", {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                </p>
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
