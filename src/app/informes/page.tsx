import type { Metadata } from 'next';
import { sesionActual } from '@/lib/auth/guardias';
import { puede } from '@/lib/auth/roles';
import { barriosConInforme } from '@/lib/devolucion/informe';
import { BotonGenerar } from './generar';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Informes de barrio',
  description:
    'Informes del relevamiento barrial de la Municipalidad de Esquel: cobertura, prioridades y compromisos asumidos por barrio.',
  robots: { index: true, follow: true },
};

export default async function PaginaInformes() {
  const publicados = await barriosConInforme();
  const usuario = await sesionActual();
  const puedeGenerar = usuario ? puede(usuario.rol, 'ver_derivaciones') : false;

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <p className="text-muted-foreground text-sm uppercase tracking-wide">
        Municipalidad de Esquel · Dirección de Juntas Vecinales
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Informes de barrio</h1>
      <p className="text-muted-foreground mt-3 max-w-2xl">
        Lo que salió del relevamiento en cada barrio: cuántas casas se visitaron, qué se priorizó y
        qué se comprometió el municipio. Una carilla por barrio, para imprimir y colgar en la sede
        vecinal.
      </p>

      {publicados.length === 0 ? (
        <p className="text-muted-foreground mt-10">
          Todavía no hay informes publicados. Se generan cuando el relevamiento de un barrio avanza
          lo suficiente.
        </p>
      ) : (
        <ul className="mt-10 space-y-3">
          {publicados.map((barrio) => (
            <li key={barrio.slug}>
              <a
                href={`/informes/${barrio.slug}`}
                className="hover:bg-accent flex items-center justify-between rounded-lg border px-4 py-4"
              >
                <span className="font-medium">{barrio.nombre}</span>
                <span className="text-muted-foreground text-sm">
                  {new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium' }).format(
                    new Date(barrio.generadoEn),
                  )}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}

      {puedeGenerar && (
        <div className="no-imprimir mt-12 rounded-xl border p-5">
          <h2 className="font-medium">Generar un informe</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Calcula la cobertura, las prioridades y los compromisos con orden de trabajo del barrio,
            y lo publica.
          </p>
          <BotonGenerar />
        </div>
      )}
    </div>
  );
}
