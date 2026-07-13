import { requireTenant } from "@/lib/auth";
import { db } from "@/lib/db";
import { DEFAULT_COMMISSION_PCT } from "@/lib/money";
import { PageHeader } from "@/components/panel/shell";
import { Badge, Card } from "@/components/ui";

export const dynamic = "force-dynamic";

// Conexion de Mercado Pago del vendedor (OAuth, split de pagos).
export default async function PagosPage({
  searchParams,
}: {
  searchParams: { conectado?: string; error?: string };
}) {
  const session = await requireTenant();
  const tenant = await db.tenant.findUniqueOrThrow({ where: { id: session.tenantId } });
  const connected = Boolean(tenant.mpAccessToken);
  const commission = tenant.commissionPct ?? DEFAULT_COMMISSION_PCT;

  return (
    <>
      <PageHeader
        title="Pagos"
        intro="Cobrás directo en tu cuenta de Mercado Pago, en el momento de la venta."
      />

      {searchParams.conectado && (
        <p className="mb-5 rounded-lg bg-pine-mist px-4 py-3 text-sm font-medium text-pine-deep">
          ¡Listo! Tu cuenta de Mercado Pago quedó vinculada.
        </p>
      )}
      {searchParams.error && (
        <p className="mb-5 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          No se pudo completar la vinculación ({searchParams.error}). Probá de nuevo o avisale al administrador.
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-ink">Mercado Pago</h2>
            <Badge tone={connected ? "green" : "amber"}>{connected ? "Conectado" : "Sin conectar"}</Badge>
          </div>
          {connected ? (
            <div className="mt-4 text-sm text-ink/70">
              <p>
                Cuenta vinculada{tenant.mpUserId && <> (ID {tenant.mpUserId})</>}
                {tenant.mpConnectedAt && (
                  <> desde el {tenant.mpConnectedAt.toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric" })}</>
                )}
                .
              </p>
              <p className="mt-2">
                Cada venta entra directo a tu cuenta. La comisión de la red ({commission}%) se separa
                automáticamente: no tenés que hacer nada.
              </p>
              <a href="/api/mp/oauth/connect" className="mt-4 inline-block text-sm font-medium text-pine underline-offset-4 hover:underline">
                Volver a vincular
              </a>
            </div>
          ) : (
            <div className="mt-4 text-sm text-ink/70">
              <p>
                Vinculá tu cuenta una sola vez y empezá a cobrar al instante. Solo necesitás tu usuario
                de Mercado Pago (personal o de tu negocio).
              </p>
              <a
                href="/api/mp/oauth/connect"
                className="mt-5 inline-flex h-11 items-center rounded-full bg-[#009EE3] px-7 font-medium text-white transition-all hover:brightness-110"
              >
                Conectar Mercado Pago
              </a>
              <p className="mt-3 text-xs text-ink/45">
                Mientras no tengas cuenta conectada, tus ventas se procesan por la cuenta de la red y se
                liquidan a mano.
              </p>
            </div>
          )}
        </Card>

        <Card className="p-6">
          <h2 className="font-display text-lg font-semibold text-ink">¿Cómo se reparte cada venta?</h2>
          <div className="mt-4 space-y-3 text-sm text-ink/70">
            <div className="flex items-center justify-between rounded-lg bg-bone px-4 py-3">
              <span>Vos (dueño de la experiencia)</span>
              <span className="font-display text-lg font-bold text-pine">{100 - commission}%</span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-bone px-4 py-3">
              <span>Red Andar (comisión por venta)</span>
              <span className="font-display text-lg font-bold text-amber-burnt">{commission}%</span>
            </div>
            <p className="text-xs leading-relaxed text-ink/50">
              El reparto lo hace Mercado Pago en el momento del pago (split de pagos). La comisión de
              procesamiento de Mercado Pago corre por cuenta del vendedor, como en cualquier cobro.
            </p>
          </div>
        </Card>
      </div>
    </>
  );
}
