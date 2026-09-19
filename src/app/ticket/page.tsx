import type { Metadata } from 'next';
import { ConsultaTicket } from './consulta';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Consultar mi pedido',
  description:
    'Consulta del estado de un pedido hecho en el relevamiento barrial de la Municipalidad de Esquel.',
  robots: { index: true, follow: true },
};

export default async function PaginaTicket({
  searchParams,
}: {
  searchParams: Promise<{ codigo?: string }>;
}) {
  const { codigo } = await searchParams;

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <p className="text-muted-foreground text-sm uppercase tracking-wide">
        Municipalidad de Esquel · Dirección de Juntas Vecinales
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">¿En qué quedó mi pedido?</h1>
      <p className="text-muted-foreground mt-3">
        Si participaste del relevamiento barrial, acá podés ver qué se hizo con lo que planteaste.
        No hace falta crear ninguna cuenta.
      </p>

      <div className="mt-8">
        <ConsultaTicket {...(codigo ? { codigoInicial: codigo } : {})} />
      </div>

      <p className="text-muted-foreground mt-10 text-sm">
        Sus respuestas a la encuesta no se muestran acá ni en ningún otro lado junto a su nombre: se
        analizan separadas de sus datos de contacto.
      </p>
    </div>
  );
}
