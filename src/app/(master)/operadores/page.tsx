import { Button, SectionTitle } from "@/components/ui";
import { Track } from "@/components/track";
import { activeTenants } from "@/server/queries";
import { tenantSiteUrl } from "@/lib/tenants";

export const dynamic = "force-dynamic";
export const metadata = { title: "Operadores" };

export default async function OperadoresPage() {
  const tenants = await activeTenants();

  return (
    <div className="mx-auto max-w-shell px-5 py-12">
      <Track type="PAGE_VIEW" channel="MASTER" path="/operadores" />
      <SectionTitle
        title="Los operadores de la red"
        intro="Cada uno con su web propia, su identidad y su historia. Andar los junta en un solo lugar."
      />

      <div className="mt-8 grid gap-6 md:grid-cols-2">
        {tenants.map((tenant) => (
          <a
            key={tenant.id}
            href={tenantSiteUrl(tenant)}
            className="group rounded-card border border-ink/8 bg-white p-6 transition-all hover:-translate-y-1 hover:shadow-lg"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-display text-2xl font-bold text-ink group-hover:text-pine">{tenant.name}</p>
                <p className="mt-1 text-sm text-ink/60">{tenant.tagline}</p>
              </div>
              <span className="rounded-full bg-pine-mist px-3 py-1 text-xs font-semibold text-pine-deep">
                {tenant._count.listings} publicaciones
              </span>
            </div>
            <p className="mt-5 text-sm font-medium text-amber-burnt">Visitar su sitio →</p>
          </a>
        ))}
      </div>

      <div className="mt-16 rounded-card bg-pine-deep px-8 py-12 text-center" id="sumate">
        <h2 className="font-display text-3xl font-bold text-bone">Sumá tu emprendimiento a la red</h2>
        <p className="mx-auto mt-3 max-w-xl leading-relaxed text-bone/70">
          Web propia con tu marca y tu dominio, panel para cargar disponibilidad y productos, cobro
          directo en tu cuenta de Mercado Pago. Escribinos y en una semana estás vendiendo.
        </p>
        <div className="mt-7 flex justify-center">
          <Button href="mailto:hola@andar.tur.ar" variant="accent" size="lg">
            Quiero mi web
          </Button>
        </div>
      </div>
    </div>
  );
}
