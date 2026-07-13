import Image from "next/image";
import Link from "next/link";
import { formatMoney } from "@/lib/money";
import { firstImage } from "@/lib/utils";

type ListingForCard = {
  slug: string;
  title: string;
  category: string;
  location: string | null;
  priceCents: number;
  currency: string;
  images: unknown;
  type: "ACTIVITY" | "PRODUCT";
  durationMinutes: number | null;
  tenant?: { name: string } | null;
};

// Tarjeta de listado compartida entre el master y los sitios white-label.
// hrefBase permite que cada sitio la rutee a su propio detalle.
export function ListingCard({
  listing,
  hrefBase = "/l",
  themed = false,
}: {
  listing: ListingForCard;
  hrefBase?: string;
  themed?: boolean;
}) {
  const duration =
    listing.durationMinutes && listing.durationMinutes >= 60
      ? `${Math.round(listing.durationMinutes / 60)} h`
      : listing.durationMinutes
        ? `${listing.durationMinutes} min`
        : null;

  return (
    <Link
      href={`${hrefBase}/${listing.slug}`}
      className={`group block overflow-hidden border transition-all hover:-translate-y-1 hover:shadow-lg ${
        themed
          ? "bg-site-card border-site-ink/10 [border-radius:var(--site-radius)]"
          : "rounded-card bg-white border-ink/8"
      }`}
    >
      <div className="relative aspect-[4/3] overflow-hidden">
        <Image
          src={firstImage(listing.images)}
          alt={listing.title}
          fill
          sizes="(max-width: 768px) 100vw, 33vw"
          className="object-cover transition-transform duration-700 group-hover:scale-105"
        />
        <span
          className={`absolute left-3 top-3 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${
            themed ? "bg-site-bg/90 text-site-ink" : "bg-bone/90 text-ink"
          }`}
        >
          {listing.type === "ACTIVITY" ? "Experiencia" : "Producto"}
        </span>
      </div>
      <div className="p-4">
        <p className={`text-xs ${themed ? "text-site-muted" : "text-ink/50"}`}>
          {[listing.category, listing.location].filter(Boolean).join(" · ")}
        </p>
        <h3
          className={`mt-1 font-display text-lg font-semibold leading-snug ${
            themed ? "text-site-ink" : "text-ink"
          }`}
        >
          {listing.title}
        </h3>
        <div className="mt-3 flex items-baseline justify-between">
          <p className={`text-sm ${themed ? "text-site-muted" : "text-ink/60"}`}>
            {listing.tenant?.name ?? (duration ? `Duración ${duration}` : "Entrega a coordinar")}
          </p>
          <p className={`font-display text-lg font-bold ${themed ? "text-site-primary" : "text-pine"}`}>
            {formatMoney(listing.priceCents, listing.currency)}
          </p>
        </div>
      </div>
    </Link>
  );
}
