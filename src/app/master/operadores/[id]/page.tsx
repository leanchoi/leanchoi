import { notFound } from "next/navigation";
import { requireMaster } from "@/lib/auth";
import { db } from "@/lib/db";
import { kpiSummary, salesSeries, topListings, channelSplit } from "@/server/insights";
import { formatMoney, DEFAULT_COMMISSION_PCT } from "@/lib/money";
import { tenantSiteUrl } from "@/lib/tenants";
import { Kpi, BarRows, ChannelSplit, RangeTabs } from "@/components/panel/widgets";
import { SalesChart } from "@/components/charts";
import { PageHeader } from "@/components/panel/shell";
import { Badge, Card, Field, inputCls } from "@/components/ui";
import { updateTenantAction } from "@/server/actions/tenants";

export const dynamic = "force-dynamic";

// Inmersion profunda sobre UNA pagina independiente: sus numeros + su configuracion.
export default async function OperadorDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { dias?: string };
}) {
  await requireMaster();
  const tenant = await db.tenant.findUnique({
    where: { id: params.id },
    include: { users: { select: { email: true, name: true } } },
  });
  if (!tenant) notFound();

  const days = [7, 30, 90].includes(Number(searchParams.dias)) ? Number(searchParams.dias) : 30;
  const [kpis, series, top, channels] = await Promise.all([
    kpiSummary(days, tenant.id),
    salesSeries(days, tenant.id),
    topListings(days, 5, tenant.id),
    channelSplit(days, tenant.id),
  ]);

  return (
    <>
      <PageHeader
        title={tenant.name}
        intro={`Inmersión de los últimos ${days} días · acceso: ${tenant.users.map((u) => u.email).join(", ")}`}
        action={
          <div className="flex items-center gap-3">
            <RangeTabs current={days} basePath={`/master/operadores/${tenant.id}`} />
            <a
              href={tenantSiteUrl(tenant)}
              target="_blank"
              className="inline-flex h-9 items-center rounded-full border border-ink/20 px-4 text-xs font-medium text-ink hover:border-ink/50"
            >
              Ver sitio →
            </a>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Ventas" value={formatMoney(kpis.gmvCents)} hint={`${kpis.orders} pedidos pagados`} />
        <Kpi label="Tu comisión de este operador" value={formatMoney(kpis.commissionCents)} />
        <Kpi label="Ticket promedio" value={formatMoney(kpis.avgTicketCents)} />
        <Kpi label="Conversión" value={`${kpis.conversionPct}%`} hint={`${kpis.views.toLocaleString("es-AR")} visitas`} />
      </div>

      <Card className="mt-6 p-6">
        <h2 className="font-display text-lg font-semibold text-ink">Ventas y comisión por día</h2>
        <div className="mt-4">
          <SalesChart data={series} showCommission />
        </div>
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <h2 className="font-display text-lg font-semibold text-ink">Sus publicaciones más vendidas</h2>
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
          <h2 className="font-display text-lg font-semibold text-ink">Canal de venta</h2>
          <div className="mt-5">
            <ChannelSplit masterCents={channels.masterCents} sitioCents={channels.sitioCents} sitioLabel="Su sitio propio" />
          </div>
          <div className="mt-5 border-t border-ink/8 pt-4">
            <p className="flex items-center gap-2 text-sm text-ink/70">
              Mercado Pago:
              <Badge tone={tenant.mpAccessToken ? "green" : "amber"}>
                {tenant.mpAccessToken ? `Conectado${tenant.mpUserId ? ` (ID ${tenant.mpUserId})` : ""}` : "Sin conectar"}
              </Badge>
            </p>
            {!tenant.mpAccessToken && (
              <p className="mt-2 text-xs leading-relaxed text-ink/50">
                Pedile al operador que entre a su panel → Pagos → Conectar Mercado Pago para que el
                split automático quede activo.
              </p>
            )}
          </div>
        </Card>
      </div>

      <Card className="mt-6 p-6">
        <h2 className="font-display text-lg font-semibold text-ink">Configuración</h2>
        <form action={updateTenantAction} className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <input type="hidden" name="id" value={tenant.id} />
          <Field label="Nombre">
            <input name="name" defaultValue={tenant.name} className={inputCls} />
          </Field>
          <Field label="Lema">
            <input name="tagline" defaultValue={tenant.tagline ?? ""} className={inputCls} />
          </Field>
          <Field label={`Comisión % (vacío = ${DEFAULT_COMMISSION_PCT}% global)`}>
            <input
              name="commissionPct"
              type="number"
              min={0}
              max={50}
              step="0.5"
              defaultValue={tenant.commissionPct ?? ""}
              className={inputCls}
            />
          </Field>
          <Field label="Dominio propio" hint="Ej: pepitocabalgatas.com — apuntar el DNS al VPS">
            <input name="customDomain" defaultValue={tenant.customDomain ?? ""} className={inputCls} placeholder="midominio.com" />
          </Field>
          <Field label="Estado del sitio">
            <select name="status" defaultValue={tenant.status} className={inputCls}>
              <option value="ACTIVE">Activo</option>
              <option value="PAUSED">Pausado (sitio y ventas off)</option>
            </select>
          </Field>
          <div className="flex items-end">
            <button type="submit" className="h-11 rounded-full bg-pine px-8 font-medium text-bone hover:bg-pine-deep">
              Guardar cambios
            </button>
          </div>
        </form>
      </Card>
    </>
  );
}
