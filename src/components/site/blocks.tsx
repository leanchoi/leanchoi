import Image from "next/image";
import Link from "next/link";
import type { SiteBlock } from "@/lib/site-config";
import { ListingCard } from "@/components/listing-card";
import { Reveal } from "@/components/reveal";

type ListingForBlocks = React.ComponentProps<typeof ListingCard>["listing"] & { id: string };

// Renderer de bloques de los sitios white-label. Todos los colores salen de
// CSS vars (--site-*) que setea el layout segun el theme del tenant, asi cada
// sitio se siente propio sin tocar codigo.
export function BlockRenderer({
  blocks,
  listings,
  basePath,
}: {
  blocks: SiteBlock[];
  listings: ListingForBlocks[];
  basePath: string;
}) {
  return (
    <>
      {blocks.map((block, i) => (
        <Block key={i} block={block} listings={listings} basePath={basePath} first={i === 0} />
      ))}
    </>
  );
}

function Block({
  block,
  listings,
  basePath,
  first,
}: {
  block: SiteBlock;
  listings: ListingForBlocks[];
  basePath: string;
  first: boolean;
}) {
  switch (block.type) {
    case "hero":
      return <HeroBlock block={block} first={first} />;

    case "featured": {
      const filtered =
        block.listingType === "ALL" ? listings : listings.filter((l) => l.type === block.listingType);
      return (
        <section id="experiencias" className="mx-auto max-w-shell px-5 py-16">
          <Reveal>
            <h2 className="font-display text-3xl font-bold tracking-tight text-site-ink md:text-4xl">
              {block.title}
            </h2>
            {block.intro && <p className="mt-3 max-w-2xl text-site-muted">{block.intro}</p>}
          </Reveal>
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((listing, i) => (
              <Reveal key={listing.id} delay={i * 60}>
                <ListingCard listing={{ ...listing, tenant: null }} hrefBase={`${basePath}/l`} themed />
              </Reveal>
            ))}
          </div>
          {filtered.length === 0 && (
            <p className="mt-8 rounded-lg bg-site-ink/5 px-4 py-6 text-center text-sm text-site-muted">
              Todavía no hay publicaciones. Volvé pronto.
            </p>
          )}
        </section>
      );
    }

    case "story":
      return (
        <section className="border-y border-site-ink/10 bg-site-card/60">
          <div
            className={`mx-auto grid max-w-shell items-center gap-10 px-5 py-16 lg:grid-cols-2 ${
              block.imageSide === "left" ? "lg:[direction:rtl]" : ""
            }`}
          >
            <Reveal className="lg:[direction:ltr]">
              <h2 className="font-display text-3xl font-bold tracking-tight text-site-ink">{block.title}</h2>
              <p className="mt-4 whitespace-pre-line leading-relaxed text-site-muted">{block.body}</p>
            </Reveal>
            {block.image && (
              <Reveal delay={100} className="lg:[direction:ltr]">
                <div className="relative aspect-[4/3] overflow-hidden [border-radius:var(--site-radius)]">
                  <Image src={block.image} alt={block.title} fill sizes="(max-width:1024px) 100vw, 50vw" className="object-cover" />
                </div>
              </Reveal>
            )}
          </div>
        </section>
      );

    case "gallery":
      return (
        <section className="mx-auto max-w-shell px-5 py-16">
          {block.title && (
            <Reveal>
              <h2 className="font-display text-3xl font-bold tracking-tight text-site-ink">{block.title}</h2>
            </Reveal>
          )}
          <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-4">
            {block.images.map((src, i) => (
              <Reveal key={i} delay={i * 50} className={i === 0 ? "col-span-2 row-span-2" : ""}>
                <div className={`relative overflow-hidden [border-radius:var(--site-radius)] ${i === 0 ? "aspect-square" : "aspect-square"}`}>
                  <Image src={src} alt={`Galería ${i + 1}`} fill sizes="(max-width:768px) 50vw, 25vw" className="object-cover transition-transform duration-700 hover:scale-105" />
                </div>
              </Reveal>
            ))}
          </div>
        </section>
      );

    case "testimonials":
      return (
        <section className="border-y border-site-ink/10 bg-site-card/60">
          <div className="mx-auto max-w-shell px-5 py-16">
            <div className="grid gap-8 md:grid-cols-3">
              {block.items.slice(0, 3).map((t, i) => (
                <Reveal key={i} delay={i * 80}>
                  <figure>
                    <blockquote className="font-display text-lg leading-snug text-site-ink">
                      “{t.quote}”
                    </blockquote>
                    <figcaption className="mt-4 text-sm text-site-muted">
                      {t.name}
                      {t.origin && ` · ${t.origin}`}
                    </figcaption>
                  </figure>
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      );

    case "stats":
      return (
        <section className="mx-auto max-w-shell px-5 py-14">
          <div className="grid gap-8 sm:grid-cols-3">
            {block.items.slice(0, 3).map((stat, i) => (
              <Reveal key={i} delay={i * 80}>
                <div className="border-t-2 border-site-primary pt-4">
                  <p className="font-display text-4xl font-bold text-site-primary">{stat.value}</p>
                  <p className="mt-1 text-sm text-site-muted">{stat.label}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </section>
      );

    case "faq":
      return (
        <section className="mx-auto max-w-3xl px-5 py-16">
          <Reveal>
            <h2 className="font-display text-3xl font-bold tracking-tight text-site-ink">{block.title}</h2>
          </Reveal>
          <div className="mt-6 divide-y divide-site-ink/10">
            {block.items.map((item, i) => (
              <details key={i} className="group py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium text-site-ink">
                  {item.q}
                  <span className="text-site-primary transition-transform group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 leading-relaxed text-site-muted">{item.a}</p>
              </details>
            ))}
          </div>
        </section>
      );

    case "cta":
      return (
        <section className="mx-auto max-w-shell px-5 pb-20 pt-6">
          <div className="bg-site-primary px-8 py-14 text-center [border-radius:var(--site-radius)]">
            <h2 className="font-display text-3xl font-bold tracking-tight text-site-bg md:text-4xl">
              {block.title}
            </h2>
            {block.subtitle && <p className="mx-auto mt-3 max-w-xl text-site-bg/80">{block.subtitle}</p>}
            <Link
              href="#experiencias"
              className="mt-7 inline-flex h-12 items-center rounded-full bg-site-bg px-8 font-medium text-site-primary transition-transform hover:-translate-y-0.5"
            >
              {block.buttonLabel}
            </Link>
          </div>
        </section>
      );
  }
}

function HeroBlock({
  block,
  first,
}: {
  block: Extract<SiteBlock, { type: "hero" }>;
  first: boolean;
}) {
  if (block.layout === "full") {
    return (
      <section className="relative flex min-h-[72dvh] items-end overflow-hidden">
        {block.image && (
          <Image src={block.image} alt={block.title} fill priority={first} sizes="100vw" className="object-cover" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
        <div className="relative mx-auto w-full max-w-shell px-5 pb-14">
          <h1 className="max-w-2xl font-display text-4xl font-bold leading-[1.05] tracking-tight text-white md:text-6xl">
            {block.title}
          </h1>
          {block.subtitle && <p className="mt-4 max-w-lg text-lg text-white/85">{block.subtitle}</p>}
          <Link
            href="#experiencias"
            className="mt-7 inline-flex h-12 items-center rounded-full bg-site-primary px-8 font-medium text-site-bg transition-transform hover:-translate-y-0.5"
          >
            {block.ctaLabel}
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-shell px-5 pb-16 pt-12 md:pt-16">
      <div className="grid items-center gap-10 lg:grid-cols-[1.05fr_1fr]">
        <div className="animate-rise">
          <h1 className="font-display text-4xl font-bold leading-[1.05] tracking-tight text-site-ink md:text-6xl">
            {block.title}
          </h1>
          {block.subtitle && (
            <p className="mt-5 max-w-md text-lg leading-relaxed text-site-muted">{block.subtitle}</p>
          )}
          <Link
            href="#experiencias"
            className="mt-8 inline-flex h-12 items-center rounded-full bg-site-primary px-8 font-medium text-site-bg transition-transform hover:-translate-y-0.5"
          >
            {block.ctaLabel}
          </Link>
        </div>
        {block.image && (
          <div className="relative aspect-[4/3] overflow-hidden [border-radius:var(--site-radius)]">
            <Image src={block.image} alt={block.title} fill priority={first} sizes="(max-width:1024px) 100vw, 50vw" className="object-cover" />
          </div>
        )}
      </div>
    </section>
  );
}
