import { sesionActual } from '@/lib/auth/guardias';
import { limitadoASuBarrio, puede } from '@/lib/auth/roles';
import { obtenerVigente } from '@/lib/cuestionario/repositorio';
import { ETIQUETA_ESTADO } from '@/lib/devolucion/tipos';
import type { EstadoDerivacion } from '@/lib/devolucion/tipos';
import {
  coberturaPorBarrio,
  distribucionDePregunta,
  listarBarrios,
  MINIMO_PARA_AGREGAR,
  noRespuestaPorMotivo,
  resumenDerivaciones,
  resumenOperativo,
} from '@/lib/tablero/consultas';
import { Barras, minutos, Tile } from '@/components/tablero/piezas';

export const dynamic = 'force-dynamic';

/** La pregunta del núcleo de la que salen las prioridades del barrio (regla 7). */
const PREGUNTA_PROBLEMAS = 'nucleo-06';
const TECHO_SEGUNDOS = 720;

const ETIQUETA_COMPETENCIA_TABLERO: Record<string, string> = {
  municipal: 'Municipal',
  provincial: 'Provincial',
  nacional: 'Nacional',
  privada: 'Empresa prestadora',
};

export default async function PaginaTablero({
  searchParams,
}: {
  searchParams: Promise<{ barrio?: string }>;
}) {
  const usuario = await sesionActual();
  const puedeVer =
    usuario &&
    (puede(usuario.rol, 'ver_cobertura') ||
      puede(usuario.rol, 'ver_agregado_barrio') ||
      puede(usuario.rol, 'ver_agregado_todos'));

  if (!usuario || !puedeVer) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <h1 className="text-2xl font-semibold">No tenés acceso al tablero</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          El tablero lo ven la coordinación de barrio, las áreas y la conducción del operativo.
        </p>
        <a className="mt-6 inline-block underline underline-offset-4" href="/panel">
          Volver al panel
        </a>
      </div>
    );
  }

  const { barrio: slugPedido } = await searchParams;
  const barrios = await listarBarrios();

  // Quien está atado a su barrio ve su barrio, elija lo que elija.
  const barrioSeleccionado = limitadoASuBarrio(usuario.rol)
    ? (barrios.find((barrio) => barrio.id === usuario.barrioId) ?? null)
    : (barrios.find((barrio) => barrio.slug === slugPedido) ?? null);

  const barrioId = barrioSeleccionado?.id ?? null;

  const [resumen, cobertura, motivos, derivaciones, problemas, cuestionario] = await Promise.all([
    resumenOperativo(barrioId),
    coberturaPorBarrio(barrioId),
    noRespuestaPorMotivo(barrioId),
    puede(usuario.rol, 'ver_derivaciones') ? resumenDerivaciones(barrioId) : null,
    distribucionDePregunta(PREGUNTA_PROBLEMAS, barrioId),
    obtenerVigente(),
  ]);

  // El rol `area` ve las preguntas de su propio bloque, en todos los barrios.
  const bloqueDelArea =
    usuario.rol === 'area' && usuario.area && cuestionario
      ? cuestionario.definicion.bloques.find((bloque) => bloque.area === usuario.area)
      : undefined;

  const distribucionesDelArea = bloqueDelArea
    ? await Promise.all(
        bloqueDelArea.preguntas
          .filter((pregunta) => pregunta.tipo !== 'abierta_voz' && pregunta.tipo !== 'texto_corto')
          .map(async (pregunta) => ({
            pregunta,
            datos: await distribucionDePregunta(pregunta.id, barrioId),
          })),
      )
    : [];

  const duracionSobreTecho =
    resumen.duracionMedianaSegundos !== null && resumen.duracionMedianaSegundos > TECHO_SEGUNDOS;

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tablero</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {barrioSeleccionado ? `Barrio ${barrioSeleccionado.nombre}` : 'Todos los barrios'}
          </p>
        </div>

        {!limitadoASuBarrio(usuario.rol) && (
          <form className="no-imprimir flex gap-2" method="get">
            <select
              name="barrio"
              defaultValue={slugPedido ?? ''}
              className="h-10 rounded-lg border bg-transparent px-2 text-sm"
            >
              <option value="">Todos los barrios</option>
              {barrios.map((barrio) => (
                <option key={barrio.slug} value={barrio.slug}>
                  {barrio.nombre}
                </option>
              ))}
            </select>
            <button type="submit" className="rounded-lg border px-3 text-sm">
              Ver
            </button>
          </form>
        )}
      </div>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">Cobertura</h2>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Tile valor={String(resumen.viviendas)} etiqueta="Viviendas" />
          <Tile
            valor={`${resumen.porcentajeRelevado}%`}
            etiqueta="Relevadas"
            detalle={`${resumen.relevadas} viviendas`}
          />
          <Tile
            valor={`${resumen.porcentajeNoRespuesta}%`}
            etiqueta="No-respuesta"
            detalle={`${resumen.sinRespuesta} viviendas`}
          />
          <Tile
            valor={minutos(resumen.duracionMedianaSegundos)}
            etiqueta="Duración mediana"
            detalle={duracionSobreTecho ? 'por encima del techo de 12 min' : 'dentro de los 12 min'}
          />
        </div>
        {duracionSobreTecho && (
          <p className="text-destructive mt-2 text-sm">
            La encuesta está llevando más de 12 minutos en la calle. Hay que sacar preguntas en la
            próxima versión del cuestionario.
          </p>
        )}
      </section>

      {!barrioSeleccionado && (
        <section className="mt-10">
          <h2 className="text-lg font-semibold">Cobertura por barrio</h2>
          <p className="text-muted-foreground text-sm">
            Ordenado por avance: arriba los que van más adelantados.
          </p>
          <Barras
            filas={cobertura
              .filter((fila) => fila.viviendas > 0)
              .sort((a, b) => b.porcentajeRelevado - a.porcentajeRelevado)
              .map((fila) => ({
                etiqueta: fila.barrio,
                cantidad: fila.relevadas,
                porcentaje: fila.porcentajeRelevado,
              }))}
            vacio="Todavía no hay viviendas cargadas en ningún barrio."
          />
          {cobertura.some((fila) => fila.viviendas === 0) && (
            <p className="text-muted-foreground mt-3 text-sm">
              Sin arrancar (todavía no tienen viviendas cargadas):{' '}
              {cobertura
                .filter((fila) => fila.viviendas === 0)
                .map((fila) => fila.barrio)
                .join(', ')}
              .
            </p>
          )}
        </section>
      )}

      <section className="mt-10">
        <h2 className="text-lg font-semibold">Por qué no se pudo relevar</h2>
        <p className="text-muted-foreground text-sm">
          La no-respuesta no es un hueco: es un dato. Sin esto, los porcentajes de arriba no
          significan nada.
        </p>
        <Barras
          filas={motivos
            .filter((motivo) => motivo.cantidad > 0)
            .map((motivo) => ({
              etiqueta: motivo.etiqueta,
              cantidad: motivo.cantidad,
              porcentaje: motivo.porcentaje,
            }))}
          vacio="Todavía no se registraron cierres sin respuesta."
        />
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">Lo que priorizaron los vecinos</h2>
        {problemas.suficiente ? (
          <>
            <p className="text-muted-foreground text-sm">Sobre {problemas.total} encuestas.</p>
            <Barras
              filas={problemas.filas.map((fila) => ({
                etiqueta: fila.opcion,
                cantidad: fila.cantidad,
                porcentaje: fila.porcentaje,
              }))}
            />
          </>
        ) : (
          <p className="text-muted-foreground mt-2 text-sm">
            Hay {problemas.total} {problemas.total === 1 ? 'encuesta' : 'encuestas'}: por debajo de{' '}
            {MINIMO_PARA_AGREGAR} no se muestran distribuciones, porque con tan pocos casos un
            porcentaje deja de ser un agregado y pasa a ser el dato de una familia.
          </p>
        )}
      </section>

      {distribucionesDelArea.length > 0 && bloqueDelArea && (
        <section className="mt-10">
          <h2 className="text-lg font-semibold">{bloqueDelArea.titulo}</h2>
          <p className="text-muted-foreground text-sm">Las preguntas de tu área.</p>
          <div className="mt-4 space-y-6">
            {distribucionesDelArea.map(({ pregunta, datos }) => (
              <div key={pregunta.id}>
                <h3 className="text-sm font-medium">{pregunta.texto}</h3>
                {datos.suficiente ? (
                  <Barras
                    filas={datos.filas.map((fila) => ({
                      etiqueta: fila.opcion,
                      cantidad: fila.cantidad,
                      porcentaje: fila.porcentaje,
                    }))}
                  />
                ) : (
                  <p className="text-muted-foreground mt-1 text-sm">
                    Todavía no hay suficientes respuestas.
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {derivaciones && (
        <section className="mt-10">
          <h2 className="text-lg font-semibold">Derivaciones</h2>
          <div className="mt-3 grid gap-6 sm:grid-cols-2">
            <div>
              <h3 className="text-sm font-medium">Por estado</h3>
              <Barras
                filas={derivaciones.porEstado.map((fila) => ({
                  etiqueta: ETIQUETA_ESTADO[fila.estado as EstadoDerivacion] ?? fila.estado,
                  cantidad: fila.cantidad,
                  porcentaje: Math.round((fila.cantidad / Math.max(1, resumen.derivaciones)) * 100),
                }))}
                vacio="Todavía no hay derivaciones."
              />
            </div>
            <div>
              <h3 className="text-sm font-medium">De quién es la competencia</h3>
              <Barras
                filas={derivaciones.porCompetencia.map((fila) => ({
                  etiqueta: ETIQUETA_COMPETENCIA_TABLERO[fila.competencia] ?? fila.competencia,
                  cantidad: fila.cantidad,
                  porcentaje: Math.round((fila.cantidad / Math.max(1, resumen.derivaciones)) * 100),
                }))}
                vacio="Todavía no hay derivaciones."
              />
            </div>
          </div>
          <p className="text-muted-foreground mt-3 text-sm">
            {resumen.compromisos} con orden de trabajo · {derivaciones.sinOrdenDeTrabajo} sin orden
            (a esas no se les puede prometer nada todavía).
          </p>
        </section>
      )}

      {puede(usuario.rol, 'exportar') && (
        <section className="no-imprimir mt-10 rounded-xl border p-5">
          <h2 className="text-lg font-semibold">Exportar</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            CSV anonimizado: sin ticket, sin identificador de vivienda, sin coordenadas y sin hora
            exacta. Cada descarga queda registrada con tu usuario.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {[
              { tipo: 'respuestas', etiqueta: 'Respuestas' },
              { tipo: 'cobertura', etiqueta: 'Cobertura' },
              { tipo: 'no-respuestas', etiqueta: 'No-respuestas' },
            ].map((opcion) => (
              <a
                key={opcion.tipo}
                href={`/api/export/${opcion.tipo}.csv${barrioId ? `?barrio=${barrioId}` : ''}`}
                className="rounded-lg border px-3 py-2 text-sm hover:underline"
              >
                {opcion.etiqueta} (CSV)
              </a>
            ))}
          </div>
        </section>
      )}

      <p className="text-muted-foreground mt-10 text-sm">
        El agrupamiento temático de las respuestas habladas, con citas textuales por barrio, llega
        en la fase 7.
      </p>
    </div>
  );
}
