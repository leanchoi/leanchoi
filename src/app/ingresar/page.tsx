import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { sesionActual } from '@/lib/auth/guardias';
import { FormularioIngreso } from './formulario';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Ingresar',
  robots: { index: false, follow: false },
};

export default async function PaginaIngreso({
  searchParams,
}: {
  searchParams: Promise<{ destino?: string }>;
}) {
  const { destino } = await searchParams;
  const sesion = await sesionActual();
  const ruta = destino && destino.startsWith('/') ? destino : '/campo';

  if (sesion) redirect(ruta);

  return (
    <div className="mx-auto max-w-sm px-4 py-16">
      <p className="text-muted-foreground text-sm uppercase tracking-wide">
        Municipalidad de Esquel
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Relevamiento barrial</h1>
      <p className="text-muted-foreground mt-2 text-sm">
        Ingreso para el equipo del operativo. Si sos vecino o vecina y querés consultar tu pedido,
        no hace falta cuenta: usá tu ticket.
      </p>

      <div className="mt-8">
        <FormularioIngreso destino={ruta} />
      </div>
    </div>
  );
}
