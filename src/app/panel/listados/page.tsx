import Link from "next/link";
import { requireTenant } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { PageHeader } from "@/components/panel/shell";
import { Badge, Button, Card, EmptyState } from "@/components/ui";
import { toggleListingStatusAction, deleteListingAction } from "@/server/actions/listings";

export const dynamic = "force-dynamic";

export default async function ListadosPage() {
  const session = await requireTenant();
  const listings = await db.listing.findMany({
    where: { tenantId: session.tenantId },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { orderItems: true } } },
  });

  return (
    <>
      <PageHeader
        title="Experiencias y productos"
        intro="Todo lo que publicás acá aparece en tu sitio y en el marketplace de la red."
        action={<Button href="/panel/listados/nuevo">Agregar publicación</Button>}
      />

      {listings.length === 0 ? (
        <EmptyState
          title="Todavía no publicaste nada"
          body="Cargá tu primera experiencia o producto: en cinco minutos está a la venta en tu sitio."
          action={<Button href="/panel/listados/nuevo">Crear la primera</Button>}
        />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-ink/8 text-left text-xs uppercase tracking-wide text-ink/45">
                <th className="px-5 py-3.5 font-medium">Publicación</th>
                <th className="px-3 py-3.5 font-medium">Tipo</th>
                <th className="px-3 py-3.5 font-medium">Precio</th>
                <th className="px-3 py-3.5 font-medium">Ventas</th>
                <th className="px-3 py-3.5 font-medium">Estado</th>
                <th className="px-5 py-3.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/8">
              {listings.map((listing) => (
                <tr key={listing.id}>
                  <td className="px-5 py-3.5 font-medium text-ink">{listing.title}</td>
                  <td className="px-3 py-3.5 text-ink/60">
                    {listing.type === "ACTIVITY" ? "Experiencia" : "Producto"}
                    {listing.type === "PRODUCT" && listing.stock !== null && (
                      <span className="ml-2 text-xs text-ink/40">stock {listing.stock}</span>
                    )}
                  </td>
                  <td className="px-3 py-3.5">{formatMoney(listing.priceCents)}</td>
                  <td className="px-3 py-3.5">{listing._count.orderItems}</td>
                  <td className="px-3 py-3.5">
                    <Badge tone={listing.status === "PUBLISHED" ? "green" : listing.status === "PAUSED" ? "amber" : "neutral"}>
                      {listing.status === "PUBLISHED" ? "Publicado" : listing.status === "PAUSED" ? "Pausado" : "Borrador"}
                    </Badge>
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center justify-end gap-3 text-xs">
                      <Link href={`/panel/listados/${listing.id}`} className="font-medium text-pine hover:underline">
                        Editar
                      </Link>
                      <form action={toggleListingStatusAction}>
                        <input type="hidden" name="id" value={listing.id} />
                        <button className="text-ink/60 hover:text-ink" type="submit">
                          {listing.status === "PUBLISHED" ? "Pausar" : "Publicar"}
                        </button>
                      </form>
                      {listing._count.orderItems === 0 && (
                        <form action={deleteListingAction}>
                          <input type="hidden" name="id" value={listing.id} />
                          <button className="text-red-600/70 hover:text-red-700" type="submit">
                            Borrar
                          </button>
                        </form>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
