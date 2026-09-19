import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { informePublicado } from '@/lib/devolucion/informe';
import type { ContenidoInforme } from '@/lib/devolucion/informe';
import { ETIQUETA_ESTADO } from '@/lib/devolucion/tipos';
import type { EstadoDerivacion } from '@/lib/devolucion/tipos';

export const dynamic = 'force-dynamic';

/**
 * El informe de barrio: una carilla A4 para imprimir y colgar en la sede vecinal.
 *
 * Decisiones de presentación: la cobertura va como números grandes (no es un
 * gráfico, es un dato); las prioridades van como barras horizontales ordenadas con
 * el valor escrito al lado, que es lo que se lee de un vistazo y sobrevive a una
 * fotocopia en blanco y negro.
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const informe = await informePublicado(slug);
  return {
    title: informe ? `Informe del barrio ${informe.barrio.nombre}` : 'Informe de barrio',
    description: informe
      ? `Resultados del relevamiento barrial en ${informe.barrio.nombre}: cobertura, prioridades y compromisos asumidos.`
      : undefined,
  };
}

function fecha(iso: string): string {
  return new Intl.DateTimeFormat('es-AR', { dateStyle: 'long' }).format(new Date(iso));
}

function Tile({ valor, etiqueta, detalle }: { valor: string; etiqueta: string; detalle?: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-2xl font-semibold tabular-nums">{valor}</p>
      <p className="text-sm font-medium">{etiqueta}</p>
      {detalle && <p className="text-muted-foreground text-xs">{detalle}</p>}
    </div>
  );
}

function Barra({
  opcion,
  cantidad,
  porcentaje,
  maximo,
}: {
  opcion: string;
  cantidad: number;
  porcentaje: number;
  maximo: number;
}) {
  const ancho = maximo === 0 ? 0 : Math.round((cantidad / maximo) * 100);
  return (
    <li className="py-1.5">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span>{opcion}</span>
        <span className="tabular-nums whitespace-nowrap">
          {porcentaje}% <span className="text-muted-foreground">({cantidad})</span>
        </span>
      </div>
      <div className="mt-1 h-2 w-full rounded-sm border">
        <div
          className="barra-dato bg-foreground h-full rounded-sm"
          style={{ width: `${ancho}%` }}
          role="presentation"
        />
      </div>
    </li>
  );
}

export default async function PaginaInforme({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const informe: ContenidoInforme | null = await informePublicado(slug);
  if (!informe) notFound();

  const { cobertura, topProblemas, compromisos, derivacionesPorCompetencia } = informe;
  const maximo = topProblemas[0]?.cantidad ?? 0;

  return (
    <article className="hoja-a4 px-6 py-10">
      <header className="border-b pb-4">
        <p className="text-xs uppercase tracking-wide">
          Municipalidad de Esquel · Dirección de Juntas Vecinales
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">
          Barrio {informe.barrio.nombre}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Relevamiento casa por casa · informe del {fecha(informe.generadoEn)} · cuestionario
          versión {informe.cuestionarioVersion}
        </p>
      </header>

      <section className="mt-6">
        <h2 className="text-lg font-semibold">Cuántas casas se visitaron</h2>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Tile valor={String(cobertura.viviendas)} etiqueta="Viviendas del barrio" />
          <Tile
            valor={`${cobertura.porcentajeRelevado}%`}
            etiqueta="Relevadas"
            detalle={`${cobertura.relevadas} encuestas`}
          />
          <Tile
            valor={`${cobertura.porcentajeNoRespuesta}%`}
            etiqueta="Sin respuesta"
            detalle={`${cobertura.sinRespuesta} viviendas`}
          />
          <Tile valor={String(cobertura.pendientes)} etiqueta="Pendientes" />
        </div>

        {cobertura.porMotivo.length > 0 && (
          <div className="mt-4">
            <h3 className="text-sm font-medium">Por qué no se pudo relevar</h3>
            <ul className="text-muted-foreground mt-2 grid gap-1 text-sm sm:grid-cols-2">
              {cobertura.porMotivo.map((motivo) => (
                <li key={motivo.motivo} className="flex justify-between gap-3">
                  <span>{motivo.etiqueta}</span>
                  <span className="tabular-nums">{motivo.cantidad}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">Lo que el barrio priorizó</h2>
        <p className="text-muted-foreground text-sm">
          Sobre {informe.totalRespuestas} encuestas. Cada vecino eligió hasta tres problemas.
        </p>
        {topProblemas.length === 0 ? (
          <p className="text-muted-foreground mt-3 text-sm">
            Todavía no hay respuestas suficientes para mostrar prioridades.
          </p>
        ) : (
          <ul className="mt-3">
            {topProblemas.slice(0, 6).map((problema) => (
              <Barra key={problema.opcion} {...problema} maximo={maximo} />
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">Lo que se comprometió el municipio</h2>
        {compromisos.length === 0 ? (
          <p className="text-muted-foreground mt-2 text-sm">
            Todavía no hay compromisos con orden de trabajo para este barrio. Cuando los haya, van a
            figurar acá con su número, para que se les pueda seguir el rastro.
          </p>
        ) : (
          <table className="mt-3 w-full border-collapse text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2 font-medium">Qué</th>
                <th className="py-2 font-medium">A cargo de</th>
                <th className="py-2 font-medium">Orden</th>
                <th className="py-2 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {compromisos.map((compromiso) => (
                <tr key={compromiso.ordenTrabajoNro} className="border-b align-top">
                  <td className="py-2 pr-3">{compromiso.descripcion}</td>
                  <td className="py-2 pr-3">{compromiso.areaDestino}</td>
                  <td className="py-2 pr-3 font-mono text-xs whitespace-nowrap">
                    {compromiso.ordenTrabajoNro}
                  </td>
                  <td className="py-2">
                    {ETIQUETA_ESTADO[compromiso.estado as EstadoDerivacion] ?? compromiso.estado}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {derivacionesPorCompetencia.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-semibold">A quién le corresponde</h2>
          <ul className="text-muted-foreground mt-2 grid gap-1 text-sm sm:grid-cols-2">
            {derivacionesPorCompetencia.map((fila) => (
              <li key={fila.competencia} className="flex justify-between gap-3">
                <span className="capitalize">{fila.competencia}</span>
                <span className="tabular-nums">{fila.cantidad}</span>
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground mt-2 text-xs">
            No todo lo que se pidió lo resuelve el municipio. Lo que es de la provincia, de la
            Nación o de una empresa prestadora se deriva y se informa.
          </p>
        </section>
      )}

      <footer className="text-muted-foreground mt-10 border-t pt-4 text-xs">
        <p>
          Si participaste del relevamiento, podés consultar en qué quedó tu pedido con el código de
          tu comprobante en <strong>/ticket</strong>, o con tu apellido y los últimos 3 números de
          tu documento.
        </p>
        <p className="mt-1">
          El cuestionario completo, con el motivo de cada pregunta, está publicado en{' '}
          <strong>/cuestionario</strong>.
        </p>
      </footer>
    </article>
  );
}
