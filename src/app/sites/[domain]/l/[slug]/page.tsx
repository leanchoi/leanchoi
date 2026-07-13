import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { resolveTenant } from "@/lib/tenants";
import { listingBySlug } from "@/server/queries";
import { BookingWidget } from "@/components/booking-widget";
import { Track } from "@/components/track";
import { imageList, firstImage } from "@/lib/utils";
import { formatMoney } from "@/lib/money";

export const dynamic = "force-dynamic";

// Detalle de listado dentro del sitio white-label del tenant (tematizado).
export default async function TenantListingPage({
  params,
}: {
  params: { domain: string; slug: string };
}) {
  const tenant = await resolveTenant(params.domain);
  if (!tenant) notFound();

  const listing = await listingBySlug(params.slug);
  if (!listing || listing.status !== "PUBLISHED" || listing.tenantId !== tenant.id) notFound();

  const images = imageList(listing.images);
  const includes = Array.isArray(listing.includes) ? (listing.includes as string[]) : [];
  const basePath = `/sites/${params.domain}`;

  return (
    <div className="mx-auto max-w-shell px-5 py-10">
      <Track type="LISTING_VIEW" channel="TENANT_SITE" tenantId={tenant.id} listingId={listing.id} />

      <Link href={basePath} className="text-sm text-site-muted underline-offset-4 hover:underline">
        ← Volver a {tenant.name}
      </Link>

      <div className="mt-5 grid gap-3 md:grid-cols-[2fr_1fr]">
        <div className="relative aspect-[16/10] overflow-hidden [border-radius:var(--site-radius)]">
          <Image src={firstImage(listing.images)} alt={listing.title} fill priority sizes="(max-width:768px) 100vw, 66vw" className="object-cover" />
        </div>
        <div className="hidden flex-col gap-3 md:flex">
          {images.slice(1, 3).map((src, i) => (
            <div key={i} className="relative flex-1 overflow-hidden [border-radius:var(--site-radius)]">
              <Image src={src} alt={`${listing.title} ${i + 2}`} fill sizes="33vw" className="object-cover" />
            </div>
          ))}
          {images.length < 2 && (
            <div className="flex flex-1 items-center justify-center bg-site-primary/10 text-sm text-site-primary [border-radius:var(--site-radius)]">
              {listing.category}
            </div>
          )}
        </div>
      </div>

      <div className="mt-10 grid gap-10 lg:grid-cols-[1.5fr_1fr]">
        <div>
          <p className="text-sm text-site-muted">
            {[listing.category, listing.location].filter(Boolean).join(" · ")}
          </p>
          <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-site-ink md:text-4xl">
            {listing.title}
          </h1>
          <div className="mt-6 space-y-4">
            {listing.description.split("\n\n").map((paragraph, i) => (
              <p key={i} className="leading-relaxed text-site-ink/80">{paragraph}</p>
            ))}
          </div>

          {includes.length > 0 && (
            <div className="mt-8">
              <h2 className="font-display text-xl font-semibold text-site-ink">Qué incluye</h2>
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {includes.map((item) => (
                  <li key={item} className="flex items-center gap-2.5 text-sm text-site-ink/80">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-site-primary" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="lg:sticky lg:top-24 lg:self-start">
          <div className="border border-site-ink/10 bg-site-card p-6 [border-radius:var(--site-radius)]">
            <p className="text-sm text-site-muted">{listing.type === "ACTIVITY" ? "Desde" : "Precio"}</p>
            <p className="font-display text-3xl font-bold text-site-primary">
              {formatMoney(listing.priceCents, listing.currency)}
              {listing.type === "ACTIVITY" && (
                <span className="text-base font-medium text-site-muted"> / persona</span>
              )}
            </p>
            <div className="mt-5">
              <BookingWidget
                listingId={listing.id}
                type={listing.type}
                priceCents={listing.priceCents}
                currency={listing.currency}
                stock={listing.stock}
                channel="TENANT_SITE"
                themed
                slots={listing.slots.map((s) => ({
                  id: s.id,
                  startsAt: s.startsAt.toISOString(),
                  capacity: s.capacity,
                  booked: s.booked,
                  priceCentsOverride: s.priceCentsOverride,
                }))}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
