import { SectionTitle, EmptyState } from "@/components/ui";
import { ListingCard } from "@/components/listing-card";
import { Track } from "@/components/track";
import { publishedListings } from "@/server/queries";

export const dynamic = "force-dynamic";
export const metadata = { title: "Experiencias" };

export default async function ExperienciasPage({
  searchParams,
}: {
  searchParams: { categoria?: string };
}) {
  const all = await publishedListings({ type: "ACTIVITY", onlyMasterVisible: true });
  const categories = [...new Set(all.map((l) => l.category))].sort();
  const active = searchParams.categoria;
  const listings = active ? all.filter((l) => l.category === active) : all;

  return (
    <div className="mx-auto max-w-shell px-5 py-12">
      <Track type="PAGE_VIEW" channel="MASTER" path="/experiencias" />
      <SectionTitle
        title="Experiencias"
        intro="Actividades guiadas por operadores locales de toda Argentina."
      />

      <div className="mt-6 flex flex-wrap gap-2">
        <a
          href="/experiencias"
          className={`rounded-full border px-4 py-1.5 text-sm transition-colors ${
            !active ? "border-pine bg-pine text-bone" : "border-ink/15 text-ink/70 hover:border-ink/40"
          }`}
        >
          Todas
        </a>
        {categories.map((cat) => (
          <a
            key={cat}
            href={`/experiencias?categoria=${encodeURIComponent(cat)}`}
            className={`rounded-full border px-4 py-1.5 text-sm transition-colors ${
              active === cat ? "border-pine bg-pine text-bone" : "border-ink/15 text-ink/70 hover:border-ink/40"
            }`}
          >
            {cat}
          </a>
        ))}
      </div>

      {listings.length === 0 ? (
        <div className="mt-10">
          <EmptyState
            title="Nada por acá todavía"
            body="No hay experiencias publicadas en esta categoría. Probá con otra."
          />
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
