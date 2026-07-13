import { requireTenant } from "@/lib/auth";
import { db } from "@/lib/db";
import { parseSiteConfig, TEMPLATES } from "@/lib/site-config";
import { tenantSiteUrl } from "@/lib/tenants";
import { PageHeader } from "@/components/panel/shell";
import { Card, Field, inputCls } from "@/components/ui";
import { BlocksEditor } from "@/components/panel/blocks-editor";
import { applyTemplateAction, saveThemeAction, saveBlocksAction, saveContactAction } from "@/server/actions/site";

export const dynamic = "force-dynamic";

// "Mi sitio": el dueño arma su web con templates, colores y bloques,
// sin tocar codigo y sin sentir que es una pagina enlatada.
export default async function SitioPage() {
  const session = await requireTenant();
  const tenant = await db.tenant.findUniqueOrThrow({ where: { id: session.tenantId } });
  const config = parseSiteConfig(tenant.siteConfig, tenant.name, tenant.tagline);

  return (
    <>
      <PageHeader
        title="Mi sitio"
        intro="Tu web propia dentro de la red: elegí un estilo, ajustá los colores y armá la página con bloques."
        action={
          <a
            href={tenantSiteUrl(tenant)}
            target="_blank"
            className="inline-flex h-10 items-center rounded-full border border-ink/20 px-5 text-sm font-medium text-ink hover:border-ink/50"
          >
            Ver mi sitio →
          </a>
        }
      />

      {/* Template */}
      <Card className="p-6">
        <h2 className="font-display text-lg font-semibold text-ink">Estilo base</h2>
        <p className="mt-1 text-xs text-ink/50">
          Aplicar un estilo pisa los colores actuales (los bloques no se tocan).
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {Object.entries(TEMPLATES).map(([id, template]) => (
            <form key={id} action={applyTemplateAction}>
              <input type="hidden" name="template" value={id} />
              <button
                type="submit"
                className={`w-full rounded-card border p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-md ${
                  config.template === id ? "border-pine ring-2 ring-pine/30" : "border-ink/10"
                }`}
              >
                <div className="flex gap-1.5">
                  {[template.theme.bg, template.theme.primary, template.theme.accent, template.theme.ink].map(
                    (color) => (
                      <span key={color} className="h-6 w-6 rounded-full border border-ink/10" style={{ background: color }} />
                    ),
                  )}
                </div>
                <p className="mt-3 font-display font-semibold text-ink">{template.name}</p>
                <p className="mt-1 text-xs leading-relaxed text-ink/55">{template.description}</p>
              </button>
            </form>
          ))}
        </div>
      </Card>

      {/* Theme fino */}
      <Card className="mt-6 p-6">
        <h2 className="font-display text-lg font-semibold text-ink">Colores y tipografía</h2>
        <form action={saveThemeAction} className="mt-4 grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {(
            [
              ["bg", "Fondo"],
              ["ink", "Texto"],
              ["primary", "Color principal"],
              ["accent", "Acento"],
              ["card", "Tarjetas"],
              ["muted", "Texto suave"],
            ] as const
          ).map(([key, label]) => (
            <Field key={key} label={label}>
              <input
                type="color"
                name={key}
                defaultValue={config.theme[key]}
                className="h-11 w-full cursor-pointer rounded-lg border border-ink/15 bg-white p-1"
              />
            </Field>
          ))}
          <Field label="Esquinas">
            <select name="radius" defaultValue={config.theme.radius} className={inputCls}>
              <option value="sharp">Rectas</option>
              <option value="soft">Suaves</option>
              <option value="round">Redondeadas</option>
            </select>
          </Field>
          <Field label="Tipografía">
            <select name="font" defaultValue={config.theme.font} className={inputCls}>
              <option value="moderna">Moderna</option>
              <option value="clasica">Clásica (serif)</option>
              <option value="fuerte">Fuerte</option>
            </select>
          </Field>
          <div className="flex items-end">
            <button type="submit" className="h-11 w-full rounded-full bg-pine px-6 font-medium text-bone hover:bg-pine-deep">
              Guardar
            </button>
          </div>
        </form>
      </Card>

      {/* Datos de contacto */}
      <Card className="mt-6 p-6">
        <h2 className="font-display text-lg font-semibold text-ink">Datos del negocio</h2>
        <form action={saveContactAction} className="mt-4 grid gap-4 sm:grid-cols-3">
          <Field label="Lema / tagline">
            <input name="tagline" defaultValue={tenant.tagline ?? ""} className={inputCls} />
          </Field>
          <Field label="WhatsApp">
            <input name="whatsapp" defaultValue={tenant.whatsapp ?? ""} className={inputCls} placeholder="+54 9 ..." />
          </Field>
          <Field label="Email de contacto">
            <input name="contactEmail" type="email" defaultValue={tenant.contactEmail ?? ""} className={inputCls} />
          </Field>
          <div>
            <button type="submit" className="h-11 rounded-full bg-pine px-6 font-medium text-bone hover:bg-pine-deep">
              Guardar
            </button>
          </div>
        </form>
      </Card>

      {/* Bloques */}
      <div className="mt-6">
        <h2 className="mb-3 font-display text-lg font-semibold text-ink">Bloques de la página</h2>
        <BlocksEditor initialBlocks={config.blocks} action={saveBlocksAction} />
      </div>
    </>
  );
}
