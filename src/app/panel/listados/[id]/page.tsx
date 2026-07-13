import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/panel/shell";
import { ListingForm } from "@/components/panel/listing-form";

export const dynamic = "force-dynamic";

export default async function EditListadoPage({ params }: { params: { id: string } }) {
  const session = await requireTenant();
  const isNew = params.id === "nuevo";
  const listing = isNew
    ? null
    : await db.listing.findFirst({ where: { id: params.id, tenantId: session.tenantId } });
  if (!isNew && !listing) notFound();

  return (
    <>
      <PageHeader
        title={isNew ? "Nueva publicación" : `Editar: ${listing!.title}`}
        intro={
          isNew
            ? "Una experiencia se reserva por fecha y horario; un producto se vende con stock."
            : undefined
        }
      />
      <ListingForm listing={listing ?? undefined} />
    </>
  );
}
