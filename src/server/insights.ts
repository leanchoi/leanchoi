import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

// Agregaciones para los paneles de insights. tenantId === undefined significa
// "toda la plataforma" (vista master); un string filtra a ese tenant; null
// filtra al inventario propio del master.

const sinceDays = (days: number) => new Date(Date.now() - days * 86400000);

function tenantWhere(tenantId?: string | null) {
  if (tenantId === undefined) return {};
  return { tenantId };
}

export async function kpiSummary(days: number, tenantId?: string | null) {
  const since = sinceDays(days);
  const wherePaid = { status: "PAID" as const, createdAt: { gte: since }, ...tenantWhere(tenantId) };

  const [paidAgg, pendingCount, views, listingViews, purchases] = await Promise.all([
    db.order.aggregate({
      where: wherePaid,
      _sum: { subtotalCents: true, commissionCents: true, sellerCents: true },
      _count: true,
    }),
    db.order.count({ where: { status: "PENDING", createdAt: { gte: since }, ...tenantWhere(tenantId) } }),
    db.trackEvent.count({ where: { createdAt: { gte: since }, ...tenantWhere(tenantId) } }),
    db.trackEvent.count({
      where: { type: "LISTING_VIEW", createdAt: { gte: since }, ...tenantWhere(tenantId) },
    }),
    db.trackEvent.count({
      where: { type: "PURCHASE", createdAt: { gte: since }, ...tenantWhere(tenantId) },
    }),
  ]);

  const gmv = paidAgg._sum.subtotalCents ?? 0;
  const orders = paidAgg._count;
  return {
    gmvCents: gmv,
    commissionCents: paidAgg._sum.commissionCents ?? 0,
    sellerCents: paidAgg._sum.sellerCents ?? 0,
    orders,
    pendingOrders: pendingCount,
    avgTicketCents: orders > 0 ? Math.round(gmv / orders) : 0,
    views,
    conversionPct: listingViews > 0 ? Math.round((purchases / listingViews) * 1000) / 10 : 0,
  };
}

export type SeriesPoint = { day: string; gmv: number; comision: number; pedidos: number };

export async function salesSeries(days: number, tenantId?: string | null): Promise<SeriesPoint[]> {
  const since = sinceDays(days);
  const tenantFilter =
    tenantId === undefined
      ? Prisma.empty
      : tenantId === null
        ? Prisma.sql`AND "tenantId" IS NULL`
        : Prisma.sql`AND "tenantId" = ${tenantId}`;

  const rows = await db.$queryRaw<{ day: Date; gmv: bigint; comision: bigint; pedidos: bigint }[]>(
    Prisma.sql`
      SELECT date_trunc('day', "createdAt") AS day,
             COALESCE(SUM("subtotalCents"), 0)   AS gmv,
             COALESCE(SUM("commissionCents"), 0) AS comision,
             COUNT(*)                             AS pedidos
      FROM "Order"
      WHERE status = 'PAID' AND "createdAt" >= ${since} ${tenantFilter}
      GROUP BY 1 ORDER BY 1
    `,
  );

  // completar dias sin ventas con cero para que la serie sea continua
  const byDay = new Map(
    rows.map((r) => [
      r.day.toISOString().slice(0, 10),
      { gmv: Number(r.gmv) / 100, comision: Number(r.comision) / 100, pedidos: Number(r.pedidos) },
    ]),
  );
  const series: SeriesPoint[] = [];
  for (let d = days - 1; d >= 0; d--) {
    const date = new Date(Date.now() - d * 86400000);
    const key = date.toISOString().slice(0, 10);
    const point = byDay.get(key);
    series.push({
      day: date.toLocaleDateString("es-AR", { day: "numeric", month: "short" }),
      gmv: point?.gmv ?? 0,
      comision: point?.comision ?? 0,
      pedidos: point?.pedidos ?? 0,
    });
  }
  return series;
}

export async function topListings(days: number, take: number, tenantId?: string | null) {
  const since = sinceDays(days);
  const grouped = await db.orderItem.groupBy({
    by: ["listingId"],
    where: {
      order: { status: "PAID", createdAt: { gte: since }, ...tenantWhere(tenantId) },
    },
    _sum: { totalCents: true, quantity: true },
    orderBy: { _sum: { totalCents: "desc" } },
    take,
  });
  const listings = await db.listing.findMany({
    where: { id: { in: grouped.map((g) => g.listingId) } },
    select: { id: true, title: true, type: true, tenant: { select: { name: true } } },
  });
  const byId = new Map(listings.map((l) => [l.id, l]));
  return grouped.map((g) => ({
    listing: byId.get(g.listingId),
    totalCents: g._sum.totalCents ?? 0,
    quantity: g._sum.quantity ?? 0,
  }));
}

export async function channelSplit(days: number, tenantId?: string | null) {
  const since = sinceDays(days);
  const grouped = await db.order.groupBy({
    by: ["channel"],
    where: { status: "PAID", createdAt: { gte: since }, ...tenantWhere(tenantId) },
    _sum: { subtotalCents: true },
    _count: true,
  });
  const master = grouped.find((g) => g.channel === "MASTER");
  const sitio = grouped.find((g) => g.channel === "TENANT_SITE");
  return {
    masterCents: master?._sum.subtotalCents ?? 0,
    masterOrders: master?._count ?? 0,
    sitioCents: sitio?._sum.subtotalCents ?? 0,
    sitioOrders: sitio?._count ?? 0,
  };
}

// Tabla comparativa por tenant para el panel master (incluye inventario propio).
export async function tenantBreakdown(days: number) {
  const since = sinceDays(days);
  const [tenants, orderGroups, viewGroups, purchaseGroups] = await Promise.all([
    db.tenant.findMany({ orderBy: { createdAt: "asc" } }),
    db.order.groupBy({
      by: ["tenantId"],
      where: { status: "PAID", createdAt: { gte: since } },
      _sum: { subtotalCents: true, commissionCents: true },
      _count: true,
    }),
    db.trackEvent.groupBy({
      by: ["tenantId"],
      where: { type: "LISTING_VIEW", createdAt: { gte: since } },
      _count: true,
    }),
    db.trackEvent.groupBy({
      by: ["tenantId"],
      where: { type: "PURCHASE", createdAt: { gte: since } },
      _count: true,
    }),
  ]);

  const orderBy = new Map(orderGroups.map((g) => [g.tenantId, g]));
  const viewsBy = new Map(viewGroups.map((g) => [g.tenantId, g._count]));
  const purchasesBy = new Map(purchaseGroups.map((g) => [g.tenantId, g._count]));

  const row = (tenantId: string | null, name: string, slug: string | null, connected: boolean) => {
    const orders = orderBy.get(tenantId);
    const views = viewsBy.get(tenantId) ?? 0;
    const purchases = purchasesBy.get(tenantId) ?? 0;
    return {
      tenantId,
      name,
      slug,
      mpConnected: connected,
      gmvCents: orders?._sum.subtotalCents ?? 0,
      commissionCents: orders?._sum.commissionCents ?? 0,
      orders: orders?._count ?? 0,
      views,
      conversionPct: views > 0 ? Math.round((purchases / views) * 1000) / 10 : 0,
    };
  };

  return [
    ...tenants.map((t) => row(t.id, t.name, t.slug, Boolean(t.mpAccessToken))),
    row(null, "Inventario propio (master)", null, true),
  ].sort((a, b) => b.gmvCents - a.gmvCents);
}

// Proximas reservas confirmadas (para el panel del tenant).
export function upcomingBookings(tenantId: string | null, take = 8) {
  return db.orderItem.findMany({
    where: {
      order: { status: "PAID", ...tenantWhere(tenantId) },
      slot: { startsAt: { gte: new Date() } },
    },
    include: { order: { select: { customerName: true, code: true } }, slot: true, listing: { select: { title: true } } },
    orderBy: { slot: { startsAt: "asc" } },
    take,
  });
}
