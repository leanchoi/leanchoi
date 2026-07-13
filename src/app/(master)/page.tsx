import Image from "next/image";
import Link from "next/link";
import { Button, SectionTitle } from "@/components/ui";
import { ListingCard } from "@/components/listing-card";
import { Reveal } from "@/components/reveal";
import { Track } from "@/components/track";
import { publishedListings, activeTenants } from "@/server/queries";
import { tenantSiteUrl } from "@/lib/tenants";
import { firstImage } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [featured, products, tenants] = await Promise.all([
    publishedListings({ type: "ACTIVITY", onlyMasterVisible: true, take: 8 }),
    publishedListings({ type: "PRODUCT", onlyMasterVisible: true, take: 4 }),
    activeTenants(),
  ]);
  const heroListing = featured[0];

  return (
    <>
      <Track type="PAGE_VIEW" channel="MASTER" path="/" />

      {/* Hero: split, izquierda mensaje + derecha visual real */}
      <section className="mx-auto max-w-shell px-5 pt-14 pb-16 md:pt-20">
        <div className="grid items-center gap-10 lg:grid-cols-[1.05fr_1fr]">
          <div className="animate-rise">
            <h1 className="font-display text-4xl font-bold leading-[1.05] tracking-tight text-ink md:text-6xl">
              Experiencias reales,
              <br />
              de la gente del lugar.
            </h1>
            <p className="mt-5 max-w-md text-lg leading-relaxed text-ink/60">
              Cabalgatas, remadas, cumbres y sabores regionales. Reservás acá, cobra directo quien te recibe.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button href="/experiencias" variant="accent" size="lg">
                Explorar experiencias
              </Button>
              <Button href="/productos" variant="outline" size="lg">
                Productos regionales
              </Button>
            </div>
          </div>
          <div className="relative">
            <div className="relative aspect-[4/3] overflow-hidden rounded-card">
              <Image
                src={heroListing ? firstImage(heroListing.images) : "https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=1600&q=80"}
                alt="Experiencias Andar"
                fill
                priority
                sizes="(max-width: 1024px) 100vw, 50vw"
                className="object-cover"
              />
            </div>
            {heroListing && (
              <Link
                href={`/l/${heroListing.slug}`}
                className="absolute -bottom-5 left-5 hidden items-center gap-3 rounded-card border border-ink/8 bg-white px-4 py-3 shadow-lg transition-transform hover:-translate-y-0.5 md:flex"
              >
                <span className="h-2.5 w-2.5 rounded-full bg-amber-burnt" />
                <span className="text-sm font-medium text-ink">{heroListing.title}</span>
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* Experiencias destacadas */}
      <section className="mx-auto max-w-shell px-5 py-16">
        <Reveal>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <SectionTitle
              title="Para tu próxima escapada"
              intro="Seleccionadas entre los operadores mejor puntuados de la red."
            />
            <Link href="/experiencias" className="text-sm font-medium text-pine underline-offset-4 hover:underline">
              Ver todas
            </Link>
          </div>
        </Reveal>
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {featured.slice(0, 8).map((listing, i) => (
            <Reveal key={listing.id} delay={i * 60}>
              <ListingCard listing={listing} />
            </Reveal>
          ))}
        </div>
      </section>

      {/* Como funciona: split asimetrico, sin tarjetas */}
      <section className="border-y border-ink/8 bg-white">
        <div className="mx-auto grid max-w-shell gap-12 px-5 py-16 lg:grid-cols-[1fr_1.2fr]">
          <Reveal>
            <SectionTitle
              title="Comprás directo a quien te recibe"
              intro="Andar junta a los mejores emprendimientos turísticos del país. Sin intermediarios raros: tu plata llega directo al operador."
            />
          </Reveal>
          <Reveal delay={100}>
            <ol className="divide-y divide-ink/8">
              {[
                ["Elegí la experiencia", "Filtrá por lugar, tipo de actividad o producto regional."],
                ["Reservá con Mercado Pago", "Fecha, horario y pago seguro en dos minutos."],
                ["Vivila con los locales", "Te recibe el dueño del emprendimiento, no un call center."],
              ].map(([title, body], i) => (
                <li key={title} className="flex gap-5 py-5 first:pt-0 last:pb-0">
                  <span className="font-display text-3xl font-bold text-amber-burnt">{i + 1}</span>
                  <div>
                    <p className="font-display text-lg font-semibold text-ink">{title}</p>
                    <p className="mt-1 text-sm leading-relaxed text-ink/60">{body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Reveal>
        </div>
      </section>

      {/* Operadores con sitio propio */}
      <section className="mx-auto max-w-shell px-5 py-16">
        <Reveal>
          <SectionTitle
            title="Operadores con nombre y apellido"
            intro="Cada emprendimiento tiene su propia web dentro de la red. Conocelos."
          />
        </Reveal>
        <div className="mt-8 grid gap-6 md:grid-cols-3">
          {tenants.map((tenant, i) => (
            <Reveal key={tenant.id} delay={i * 80}>
              <a
                href={tenantSiteUrl(tenant)}
                className="group block overflow-hidden rounded-card border border-ink/8 bg-white transition-all hover:-translate-y-1 hover:shadow-lg"
              >
                <div className="flex h-28 items-end bg-pine-mist px-5 pb-4">
                  <p className="font-display text-xl font-bold text-pine-deep group-hover:underline">
                    {tenant.name}
                  </p>
                </div>
                <div className="flex items-center justify-between px-5 py-4">
                  <p className="text-sm text-ink/60">{tenant.tagline}</p>
                  <span className="shrink-0 text-xs font-semibold text-amber-burnt">
                    {tenant._count.listings} publicaciones
                  </span>
                </div>
              </a>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Productos regionales */}
      {products.length > 0 && (
        <section className="mx-auto max-w-shell px-5 pb-16">
          <Reveal>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <SectionTitle title="Sabores y oficios para llevarte" />
              <Link href="/productos" className="text-sm font-medium text-pine underline-offset-4 hover:underline">
                Ver todos
              </Link>
            </div>
          </Reveal>
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {products.map((listing, i) => (
              <Reveal key={listing.id} delay={i * 60}>
                <ListingCard listing={listing} />
              </Reveal>
            ))}
          </div>
        </section>
      )}

      {/* CTA para emprendedores */}
      <section className="bg-pine-deep" id="sumate">
        <div className="mx-auto flex max-w-shell flex-col items-start gap-6 px-5 py-16 md:flex-row md:items-center md:justify-between">
          <div className="max-w-xl">
            <h2 className="font-display text-3xl font-bold tracking-tight text-bone md:text-4xl">
              ¿Tenés un emprendimiento turístico?
            </h2>
            <p className="mt-3 leading-relaxed text-bone/70">
              Te armamos tu web propia con tu dominio, cobrás directo en tu Mercado Pago y tus
              experiencias también se venden acá.
            </p>
          </div>
          <Button href="/operadores" variant="accent" size="lg">
            Sumá tu emprendimiento
          </Button>
        </div>
      </section>
    </>
  );
}
