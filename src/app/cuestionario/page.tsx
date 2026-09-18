import type { Metadata } from 'next';
import { Badge } from '@/components/ui/badge';
import { opcionesDe, preguntasDe } from '@/lib/cuestionario';
import type { Bloque, Pregunta } from '@/lib/cuestionario';
import { listarVersiones, obtenerVigente } from '@/lib/cuestionario/repositorio';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Cuestionario',
  description:
    'Texto completo del cuestionario del relevamiento barrial de la Municipalidad de Esquel, con su fecha de publicación y el changelog de versiones.',
  robots: { index: true, follow: true },
};

/**
 * REGLA 10: cuestionario público.
 *
 * Ruta abierta, sin login. Muestra la versión vigente completa, en texto plano, con
 * fecha de publicación y changelog. Es el mecanismo de transparencia del operativo:
 * cualquier vecino, periodista o concejal puede leer exactamente qué se pregunta y
 * qué se hace con cada respuesta.
 */

const NOMBRE_TIPO: Record<Pregunta['tipo'], string> = {
  opcion_unica: 'una opción',
  opcion_multiple: 'varias opciones',
  si_no: 'sí / no',
  numero: 'un número',
  escala: 'escala',
  texto_corto: 'texto breve',
  abierta_voz: 'respuesta hablada',
};

function fechaLarga(fecha: Date): string {
  return new Intl.DateTimeFormat('es-AR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'America/Argentina/Buenos_Aires',
  }).format(fecha);
}

function PreguntaPublica({ pregunta, numero }: { pregunta: Pregunta; numero: number }) {
  const opciones = opcionesDe(pregunta);

  return (
    <li className="border-t py-5">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-muted-foreground text-sm tabular-nums">{numero}.</span>
        <h3 className="flex-1 text-base font-medium">{pregunta.texto}</h3>
        {pregunta.core && <Badge variant="secondary">núcleo</Badge>}
        {pregunta.autoadministrada && <Badge variant="outline">la contesta el vecino</Badge>}
      </div>

      {opciones.length > 0 && (
        <ul className="text-muted-foreground mt-3 ml-7 list-disc space-y-1 text-sm">
          {opciones.map((opcion) => (
            <li key={opcion}>{opcion}</li>
          ))}
        </ul>
      )}

      {pregunta.tipo === 'escala' && (
        <p className="text-muted-foreground mt-3 ml-7 text-sm">
          De {pregunta.escala.minimo} ({pregunta.escala.etiqueta_minimo}) a {pregunta.escala.maximo}{' '}
          ({pregunta.escala.etiqueta_maximo}).
        </p>
      )}

      <dl className="mt-3 ml-7 space-y-1 text-sm">
        <div className="flex gap-2">
          <dt className="text-muted-foreground shrink-0">Se responde con:</dt>
          <dd>
            {NOMBRE_TIPO[pregunta.tipo]}
            {pregunta.obligatoria ? '' : ' · se puede no contestar'}
          </dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-muted-foreground shrink-0">Para qué se pregunta:</dt>
          <dd>{pregunta.decision}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-muted-foreground shrink-0">Tiempo estimado:</dt>
          <dd>{pregunta.segundos_estimados} segundos</dd>
        </div>
      </dl>
    </li>
  );
}

function BloquePublico({ bloque, desde }: { bloque: Bloque; desde: number }) {
  return (
    <section className="mt-10">
      <div className="flex flex-wrap items-baseline gap-3">
        <h2 className="text-xl font-semibold tracking-tight">{bloque.titulo}</h2>
        {bloque.area && <span className="text-muted-foreground text-sm">{bloque.area}</span>}
        {bloque.autoadministrada && <Badge variant="outline">bloque autoadministrado</Badge>}
      </div>
      {bloque.autoadministrada && (
        <p className="text-muted-foreground mt-2 max-w-2xl text-sm">
          Este bloque lo contesta el vecino solo, en el celular: el encuestador se lo entrega y no
          vuelve a ver esas respuestas.
        </p>
      )}
      <ol className="mt-2">
        {bloque.preguntas.map((pregunta, i) => (
          <PreguntaPublica key={pregunta.id} pregunta={pregunta} numero={desde + i} />
        ))}
      </ol>
    </section>
  );
}

export default async function PaginaCuestionario() {
  const vigente = await obtenerVigente();
  const versiones = await listarVersiones();

  if (!vigente) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <h1 className="text-2xl font-semibold">Cuestionario</h1>
        <p className="text-muted-foreground mt-4">
          Todavía no hay una versión publicada del cuestionario.
        </p>
      </div>
    );
  }

  const { definicion } = vigente;
  const total = preguntasDe(definicion).length;
  let numero = 0;

  return (
    <article className="mx-auto max-w-3xl px-4 py-12">
      <header>
        <p className="text-muted-foreground text-sm uppercase tracking-wide">
          Municipalidad de Esquel · Dirección de Juntas Vecinales
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">{definicion.titulo}</h1>
        <p className="text-muted-foreground mt-3 text-sm">
          Versión {vigente.version} · publicada el {fechaLarga(vigente.publicadoEn)} · {total}{' '}
          preguntas · {Math.round(vigente.segundosTotales / 60)} minutos estimados
        </p>
        <p className="mt-6 max-w-2xl">
          Este es el texto completo de lo que se pregunta casa por casa, con el motivo de cada
          pregunta. Se publica para que cualquier persona pueda leerlo sin pedir permiso a nadie.
        </p>
        <p className="text-muted-foreground no-imprimir mt-3 text-sm">
          También disponible en formato de datos:{' '}
          <a className="underline underline-offset-4" href="/api/cuestionario">
            /api/cuestionario
          </a>
        </p>
      </header>

      <section className="bg-muted/40 mt-10 rounded-xl border p-6">
        <h2 className="text-lg font-semibold">{definicion.consentimiento.titulo}</h2>
        <p className="mt-3 whitespace-pre-line">{definicion.consentimiento.texto}</p>
        <dl className="mt-4 space-y-2 text-sm">
          <div>
            <dt className="text-muted-foreground">Para qué se usan los datos</dt>
            <dd>{definicion.consentimiento.finalidad}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Responsable</dt>
            <dd>{definicion.consentimiento.responsable}</dd>
          </div>
          {definicion.consentimiento.base_legal && (
            <div>
              <dt className="text-muted-foreground">Marco legal</dt>
              <dd>{definicion.consentimiento.base_legal}</dd>
            </div>
          )}
          <div>
            <dt className="text-muted-foreground">Versión del consentimiento</dt>
            <dd>{vigente.consentimientoVersion}</dd>
          </div>
        </dl>
      </section>

      {definicion.bloques.map((bloque) => {
        const desde = numero + 1;
        numero += bloque.preguntas.length;
        return <BloquePublico key={bloque.id} bloque={bloque} desde={desde} />;
      })}

      <section className="mt-14 border-t pt-8">
        <h2 className="text-xl font-semibold tracking-tight">Versiones del cuestionario</h2>
        <p className="text-muted-foreground mt-2 text-sm">
          Cada cambio queda registrado. Las diez preguntas del núcleo no cambian entre versiones: es
          lo que permite comparar barrios entre sí y repetir el relevamiento en años siguientes.
        </p>
        <ul className="mt-4 space-y-3">
          {versiones.map((version) => (
            <li key={version.version} className="text-sm">
              <span className="font-medium">Versión {version.version}</span>{' '}
              <span className="text-muted-foreground">
                {version.publicadoEn
                  ? `· publicada el ${fechaLarga(version.publicadoEn)}`
                  : '· borrador'}{' '}
                · {Math.round(version.segundosTotales / 60)} min
              </span>
              {version.changelog && (
                <p className="text-muted-foreground mt-1">{version.changelog}</p>
              )}
            </li>
          ))}
        </ul>
      </section>
    </article>
  );
}
