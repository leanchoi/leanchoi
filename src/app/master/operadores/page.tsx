import Link from "next/link";
import { requireMaster } from "@/lib/auth";
import { db } from "@/lib/db";
import { tenantSiteUrl } from "@/lib/tenants";
import { PageHeader } from "@/components/panel/shell";
import { Badge, Card, Field, inputCls } from "@/components/ui";
import { createTenantAction } from "@/server/actions/tenants";

export const dynamic = "force-dynamic";

// Alta y gestion de paginas independientes (una por operador).
export default async function OperadoresPage() {
  await requireMaster();
  const tenants = await db.tenant.findMany({
    include: {
      users: { select: { email: true } },
      _count: { select: { listings: true, orders: { where: { status: "PAID" } } } },
    },
    orderBy: { createdAt: "asc" },
  });

  return (
    <>
      <PageHeader
        title="Páginas independientes"
        intro="Cada operador tiene su web propia, su acceso al panel y su cuenta de cobro."
      />

      <div className="grid gap-4 md:grid-cols-2">
        {tenants.map((tenant) => (
          <Card key={tenant.id} className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <Link
                  href={`/master/operadores/${tenant.id}`}
                  className="font-display text-lg font-semibold text-pine underline-offset-4 hover:underline"
                >
                  {tenant.name}
                </Link>
                <p className="mt-0.5 text-sm text-ink/55">{tenant.tagline}</p>
              </div>
              <Badge tone={tenant.status === "ACTIVE" ? "green" : "amber"}>
                {tenant.status === "ACTIVE" ? "Activa" : "Pausada"}
              </Badge>
            </div>
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-xs text-ink/55">
              <span>{tenant._count.listings} publicaciones</span>
              <span>{tenant._count.orders} ventas</span>
              <span>{tenant.users[0]?.email}</span>
              <span className={tenant.mpAccessToken ? "text-pine" : "text-amber-burnt"}>
                MP {tenant.mpAccessToken ? "conectado" : "sin conectar"}
              </span>
            </div>
            <div className="mt-4 flex gap-4 text-sm font-medium">
              <Link href={`/master/operadores/${tenant.id}`} className="text-pine hover:underline">
                Insights y configuración
              </Link>
              <a href={tenantSiteUrl(tenant)} target="_blank" className="text-ink/60 hover:text-ink">
                Ver sitio →
              </a>
            </div>
          </Card>
        ))}
      </div>

      <Card className="mt-8 p-6">
        <h2 className="font-display text-lg font-semibold text-ink">Crear página independiente</h2>
        <p className="mt-1 text-xs text-ink/50">
          Se crea el sitio con un template inicial y un acceso al panel para el dueño. Después él mismo
          personaliza estilo, bloques e inventario.
        </p>
        <form action={createTenantAction} className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Nombre del emprendimiento">
            <input name="name" required minLength={3} className={inputCls} placeholder="Pepito Cabalgatas" />
          </Field>
          <Field label="Lema (opcional)">
            <input name="tagline" className={inputCls} placeholder="Cabalgatas serranas..." />
          </Field>
          <Field label="Comisión % (vacío = 10%)">
            <input name="commissionPct" type="number" min={0} max={50} step="0.5" className={inputCls} placeholder="10" />
          </Field>
          <Field label="Nombre del dueño">
            <input name="adminName" className={inputCls} placeholder="Pepito" />
          </Field>
          <Field label="Email de acceso">
            <input name="email" type="email" required className={inputCls} placeholder="pepito@gmail.com" />
          </Field>
          <Field label="Contraseña inicial" hint="Mínimo 8 caracteres; puede cambiarla después">
            <input name="password" type="text" required minLength={8} className={inputCls} />
          </Field>
          <div className="sm:col-span-2 lg:col-span-3">
            <button type="submit" className="h-11 rounded-full bg-pine px-8 font-medium text-bone hover:bg-pine-deep">
              Crear página
            </button>
          </div>
        </form>
      </Card>
    </>
  );
}
