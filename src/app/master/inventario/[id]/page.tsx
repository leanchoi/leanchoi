import { notFound } from "next/navigation";
import { requireMaster } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/panel/shell";
import { ListingForm } from "@/components/panel/listing-form";

export const dynamic = "force-dynamic";

export default async function MasterEditListadoPage({ params }: { params: { id: string } }) {
  await requireMaster();
  const isNew = params.id === "nuevo";
  const listing = isNew ? null : await db.listing.findUnique({ where: { id: params.id } });
  if (!isNew && !listing) notFound();

  const tenants = await db.tenant.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } });

  return (
    <>
      <PageHeader
        title={isNew ? "Cargar inventario" : `Editar: ${listing!.title}`}
        intro="El inventario propio del master no paga comisión: el 100% de la venta va a tu cuenta."
      />
      <ListingForm listing={listing ?? undefined} tenants={tenants} />
    </>
  );
}
