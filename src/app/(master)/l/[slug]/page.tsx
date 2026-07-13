import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card } from "@/components/ui";
import { BookingWidget } from "@/components/booking-widget";
import { Track } from "@/components/track";
import { listingBySlug } from "@/server/queries";
import { tenantSiteUrl } from "@/lib/tenants";
import { imageList, firstImage } from "@/lib/utils";
import { formatMoney } from "@/lib/money";

export const dynamic = "force-dynamic";

export default async function ListingDetailPage({ params }: { params: { slug: string } }) {
  const listing = await listingBySlug(params.slug);
  if (!listing || listing.status !== "PUBLISHED" || !listing.visibleOnMaster) notFound();

  const images = imageList(listing.images);
  const includes = Array.isArray(listing.includes) ? (listing.includes as string[]) : [];
  const duration =
    listing.durationMinutes && listing.durationMinutes >= 60
      ? `${Math.round((listing.durationMinutes / 60) * 10) / 10} horas`
      : listing.durationMinutes
        ? `${listing.durationMinutes} minutos`
        : null;

  return (
    <div className="mx-auto max-w-shell px-5 py-10">
      <Track type="LISTING_VIEW" channel="MASTER" listingId={listing.id} tenantId={listing.tenantId} />

      <nav className="text-sm text-ink/50">
        <Link href="/" className="hover:text-ink">Inicio</Link>
        <span className="mx-2">/</span>
        <Link href={listing.type === "ACTIVITY" ? "/experiencias" : "/productos"} className="hover:text-ink">
          {listing.type === "ACTIVITY" ? "Experiencias" : "Productos"}
        </Link>
        <span className="mx-2">/</span>
        <span className="text-ink/80">{listing.title}</span>
      </nav>

      {/* galeria */}
      <div className="mt-6 grid gap-3 md:grid-cols-[2fr_1fr]">
        <div className="relative aspect-[16/10] overflow-hidden rounded-card">
          <Image src={firstImage(listing.images)} alt={listing.title} fill priority sizes="(max-width: 768px) 100vw, 66vw" className="object-cover" />
        </div>
        <div className="hidden flex-col gap-3 md:flex">
          {images.slice(1, 3).map((src, i) => (
            <div key={i} className="relative flex-1 overflow-hidden rounded-card">
              <Image src={src} alt={`${listing.title} ${i + 2}`} fill sizes="33vw" className="object-cover" />
            </div>
          ))}
          {images.length < 2 && (
            <div className="flex flex-1 items-center justify-center rounded-card bg-pine-mist text-sm text-pine-deep">
              {listing.category}
            </div>
          )}
        </div>
      </div>

      <div className="mt-10 grid gap-10 lg:grid-cols-[1.5fr_1fr]">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="green">{listing.type === "ACTIVITY" ? "Experiencia" : "Producto"}</Badge>
            <Badge>{listing.category}</Badge>
            {listing.location && <span className="text-sm text-ink/50">{listing.location}</span>}
          </div>
          <h1 className="mt-3 font-display text-3xl font-bold tracking-tight text-ink md:text-4xl">
            {listing.title}
          </h1>
          {duration && <p className="mt-2 text-sm text-ink/60">Duración: {duration}</p>}

          <div className="prose-p:leading-relaxed mt-6 space-y-4 text-ink/75">
            {listing.description.split("\n\n").map((paragraph, i) => (
              <p key={i} className="leading-relaxed">{paragraph}</p>
            ))}
          </div>

          {includes.length > 0 && (
            <div className="mt-8">
              <h2 className="font-display text-xl font-semibold text-ink">Qué incluye</h2>
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {includes.map((item) => (
                  <li key={item} className="flex items-center gap-2.5 text-sm text-ink/75">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-burnt" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {listing.tenant && (
            <a
              href={tenantSiteUrl(listing.tenant)}
              className="mt-10 flex items-center justify-between rounded-card border border-ink/8 bg-white p-5 transition-all hover:shadow-md"
            >
              <div>
                <p className="text-xs uppercase tracking-wide text-ink/40">Ofrecido por</p>
                <p className="font-display text-lg font-semibold text-pine">{listing.tenant.name}</p>
                <p className="text-sm text-ink/60">{listing.tenant.tagline}</p>
              </div>
              <span className="text-sm font-medium text-amber-burnt">Ver su sitio →</span>
            </a>
          )}
        </div>

        <div className="lg:sticky lg:top-24 lg:self-start">
          <Card className="p-6">
            <p className="text-sm text-ink/50">
              {listing.type === "ACTIVITY" ? "Desde" : "Precio"}
            </p>
            <p className="font-display text-3xl font-bold text-pine">
              {formatMoney(listing.priceCents, listing.currency)}
              {listing.type === "ACTIVITY" && <span className="text-base font-medium text-ink/50"> / persona</span>}
            </p>
            <div className="mt-5">
              <BookingWidget
                listingId={listing.id}
                type={listing.type}
                priceCents={listing.priceCents}
                currency={listing.currency}
                stock={listing.stock}
                channel="MASTER"
                slots={listing.slots.map((s) => ({
                  id: s.id,
                  startsAt: s.startsAt.toISOString(),
                  capacity: s.capacity,
                  booked: s.booked,
                  priceCentsOverride: s.priceCentsOverride,
                }))}
              />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
