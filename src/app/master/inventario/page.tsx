import Link from "next/link";
import { requireMaster } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { PageHeader } from "@/components/panel/shell";
import { Badge, Button, Card } from "@/components/ui";
import {
  toggleMasterVisibilityAction,
  toggleFeaturedAction,
  toggleListingStatusAction,
} from "@/server/actions/listings";

export const dynamic = "force-dynamic";

// Inventario global: TODO el catalogo de la red (propio y de terceros).
// El master decide que se ve en el marketplace consolidador, lo haya cargado o no.
export default async function InventarioPage({
  searchParams,
}: {
  searchParams: { filtro?: string };
}) {
  await requireMaster();
  const filter = searchParams.filtro;
  const listings = await db.listing.findMany({
    where:
      filter === "propio"
        ? { tenantId: null }
        : filter === "ocultos"
          ? { visibleOnMaster: false }
          : {},
    include: { tenant: { select: { name: true } }, _count: { select: { orderItems: true } } },
    orderBy: [{ createdAt: "desc" }],
  });

  const tabs = [
    { id: undefined, label: "Todo" },
    { id: "propio", label: "Inventario propio" },
    { id: "ocultos", label: "Ocultos del marketplace" },
  ];

  return (
    <>
      <PageHeader
        title="Inventario global"
        intro="Todo lo publicado en la red. Podés ocultar cualquier publicación del marketplace consolidador sin tocar el sitio del operador."
        action={<Button href="/master/inventario/nuevo">Cargar inventario propio</Button>}
      />

      <div className="mb-5 flex gap-2">
        {tabs.map((tab) => (
          <a
            key={tab.label}
            href={tab.id ? `/master/inventario?filtro=${tab.id}` : "/master/inventario"}
            className={`rounded-full border px-4 py-1.5 text-sm transition-colors ${
              filter === tab.id ? "border-pine bg-pine text-bone" : "border-ink/15 text-ink/70 hover:border-ink/40"
            }`}
          >
            {tab.label}
          </a>
        ))}
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="border-b border-ink/8 text-left text-xs uppercase tracking-wide text-ink/45">
              <th className="px-5 py-3.5 font-medium">Publicación</th>
              <th className="px-3 py-3.5 font-medium">Operador</th>
              <th className="px-3 py-3.5 font-medium">Precio</th>
              <th className="px-3 py-3.5 font-medium">Ventas</th>
              <th className="px-3 py-3.5 font-medium">Estado</th>
              <th className="px-3 py-3.5 font-medium">En marketplace</th>
              <th className="px-5 py-3.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/8">
            {listings.map((listing) => (
              <tr key={listing.id} className={listing.visibleOnMaster ? "" : "opacity-60"}>
                <td className="px-5 py-3.5">
                  <p className="font-medium text-ink">{listing.title}</p>
                  <p className="text-xs text-ink/45">
                    {listing.type === "ACTIVITY" ? "Experiencia" : "Producto"} · {listing.category}
                    {listing.featured && <span className="ml-2 text-amber-burnt">★ destacada</span>}
                  </p>
                </td>
                <td className="px-3 py-3.5 text-ink/70">{listing.tenant?.name ?? "Propio (master)"}</td>
                <td className="px-3 py-3.5">{formatMoney(listing.priceCents)}</td>
                <td className="px-3 py-3.5">{listing._count.orderItems}</td>
                <td className="px-3 py-3.5">
                  <Badge tone={listing.status === "PUBLISHED" ? "green" : listing.status === "PAUSED" ? "amber" : "neutral"}>
                    {listing.status === "PUBLISHED" ? "Publicado" : listing.status === "PAUSED" ? "Pausado" : "Borrador"}
                  </Badge>
                </td>
                <td className="px-3 py-3.5">
                  <form action={toggleMasterVisibilityAction}>
                    <input type="hidden" name="id" value={listing.id} />
                    <button
                      type="submit"
                      className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                        listing.visibleOnMaster
                          ? "bg-pine-mist text-pine-deep hover:bg-pine-mist/70"
                          : "bg-ink/10 text-ink/60 hover:bg-ink/15"
                      }`}
                    >
                      {listing.visibleOnMaster ? "Visible · ocultar" : "Oculto · mostrar"}
                    </button>
                  </form>
                </td>
                <td className="px-5 py-3.5">
                  <div className="flex items-center justify-end gap-3 text-xs">
                    <form action={toggleFeaturedAction}>
                      <input type="hidden" name="id" value={listing.id} />
                      <button className="text-ink/60 hover:text-amber-burnt" type="submit">
                        {listing.featured ? "Quitar ★" : "Destacar"}
                      </button>
                    </form>
                    {listing.tenantId === null && (
                      <>
                        <Link href={`/master/inventario/${listing.id}`} className="font-medium text-pine hover:underline">
                          Editar
                        </Link>
                        <form action={toggleListingStatusAction}>
                          <input type="hidden" name="id" value={listing.id} />
                          <button className="text-ink/60 hover:text-ink" type="submit">
                            {listing.status === "PUBLISHED" ? "Pausar" : "Publicar"}
                          </button>
                        </form>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
