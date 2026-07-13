import { requireMaster } from "@/lib/auth";
import { CONNECTORS, connectorStatusLabel } from "@/server/integrations/registry";
import { PageHeader } from "@/components/panel/shell";
import { Badge, Card } from "@/components/ui";

export const dynamic = "force-dynamic";

const TONE: Record<string, "green" | "amber" | "blue" | "neutral"> = {
  ready: "green",
  needs_credentials: "amber",
  affiliate_only: "blue",
  not_available: "neutral",
};

// Estado de los conectores OTA. La estrategia completa esta en docs/integraciones-ota.md
export default async function IntegracionesPage() {
  await requireMaster();

  return (
    <>
      <PageHeader
        title="Integraciones OTA"
        intro="Conectores para nutrir el catálogo con inventario de terceros y distribuir el propio. El detalle de cada estrategia está en docs/integraciones-ota.md del repo."
      />

      <div className="grid gap-4 md:grid-cols-2">
        {CONNECTORS.map((connector) => {
          const status = connector.status();
          return (
            <Card key={connector.id} className="p-5">
              <div className="flex items-start justify-between gap-3">
                <p className="font-display text-lg font-semibold text-ink">{connector.name}</p>
                <Badge tone={TONE[status]}>{connectorStatusLabel(status)}</Badge>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-ink/60">{connector.capability}</p>
              <a
                href={connector.docsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-block text-sm font-medium text-pine underline-offset-4 hover:underline"
              >
                Documentación →
              </a>
            </Card>
          );
        })}
      </div>

      <Card className="mt-6 border-amber-burnt/20 bg-amber-soft/40 p-5">
        <p className="text-sm leading-relaxed text-ink/75">
          <span className="font-semibold">Recomendación de arranque:</span> Viator (acceso básico sin
          aprobación previa) para nutrir el catálogo con comisión de afiliado, y Civitatis para el
          público hispano. Para distribuir TU inventario en GetYourGuide/Booking hay que exponer una
          Supplier API (roadmap en docs). Las credenciales se cargan por variables de entorno del VPS.
        </p>
      </Card>
    </>
  );
}
