import { SectionTitle, EmptyState } from "@/components/ui";
import { ListingCard } from "@/components/listing-card";
import { Track } from "@/components/track";
import { publishedListings } from "@/server/queries";

export const dynamic = "force-dynamic";
export const metadata = { title: "Productos regionales" };

export default async function ProductosPage() {
  const listings = await publishedListings({ type: "PRODUCT", onlyMasterVisible: true });

  return (
    <div className="mx-auto max-w-shell px-5 py-12">
      <Track type="PAGE_VIEW" channel="MASTER" path="/productos" />
      <SectionTitle
        title="Productos regionales"
        intro="Artesanías, vinos y equipamiento hechos por los mismos operadores de la red."
      />
      {listings.length === 0 ? (
        <div className="mt-10">
          <EmptyState title="Sin productos publicados" body="Pronto vas a encontrar productos regionales acá." />
        </div>
      ) : (
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {listings.map((listing) => (
            <ListingCard key={listing.id} listing={listing} />
          ))}
        </div>
      )}
    </div>
  );
}
