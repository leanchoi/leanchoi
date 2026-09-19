import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

type Modulo = {
  nombre: string;
  descripcion: string;
  ruta: string;
  fase: number;
  estado: 'disponible' | 'pendiente';
};

/**
 * El sistema son cuatro módulos encadenados: instrumento → campo → procesamiento
 * → devolución. Esta pantalla es el mapa del ciclo y el estado real de cada parte.
 */
const MODULOS: Modulo[] = [
  {
    nombre: '1. Instrumento',
    descripcion:
      'Cuestionario versionado, público y auditable. Techo de 12 minutos y núcleo inmutable.',
    ruta: '/cuestionario',
    fase: 2,
    estado: 'pendiente',
  },
  {
    nombre: '2. Campo',
    descripcion:
      'App móvil instalable que funciona sin señal. Encuesta, modo vecino, no-respuesta y ticket.',
    ruta: '/campo',
    fase: 3,
    estado: 'pendiente',
  },
  {
    nombre: '3. Procesamiento',
    descripcion:
      'Tablero por barrio y por área, cobertura, no-respuesta por motivo y exports anonimizados.',
    ruta: '/panel',
    fase: 6,
    estado: 'pendiente',
  },
  {
    nombre: '4. Devolución',
    descripcion:
      'Acuse por competencia, derivaciones, consulta de ticket e informe de barrio imprimible.',
    ruta: '/informes',
    fase: 5,
    estado: 'pendiente',
  },
];

export default function Home() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <header className="mb-10">
        <p className="text-muted-foreground text-sm uppercase tracking-wide">
          Municipalidad de Esquel · Chubut
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
          Relevamiento barrial casa por casa
        </h1>
        <p className="text-muted-foreground mt-4 max-w-2xl text-base">
          Un solo instrumento compartido por todas las áreas del municipio. Los datos de respuesta y
          los datos identificatorios viven en bases separadas: el único puente es el ticket del
          vecino.
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2">
        {MODULOS.map((modulo) => (
          <Card key={modulo.ruta}>
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <CardTitle>{modulo.nombre}</CardTitle>
                <Badge variant={modulo.estado === 'disponible' ? 'default' : 'outline'}>
                  {modulo.estado === 'disponible' ? 'disponible' : `fase ${modulo.fase}`}
                </Badge>
              </div>
              <CardDescription>{modulo.descripcion}</CardDescription>
            </CardHeader>
            <CardContent>
              {modulo.estado === 'disponible' ? (
                <a className="text-sm underline underline-offset-4" href={modulo.ruta}>
                  {modulo.ruta}
                </a>
              ) : (
                <code className="text-muted-foreground text-xs">{modulo.ruta}</code>
              )}
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="mt-10 rounded-xl border p-5">
        <h2 className="text-lg font-semibold">¿Participaste del relevamiento?</h2>
        <p className="text-muted-foreground mt-2 text-sm">
          Consultá en qué quedó tu pedido con el código de tu comprobante, o con tu apellido y los
          últimos 3 números de tu documento. No hace falta crear ninguna cuenta.
        </p>
        <a className="mt-3 inline-block underline underline-offset-4" href="/ticket">
          Consultar mi pedido
        </a>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">Estado del despliegue</h2>
        <p className="text-muted-foreground mt-2 text-sm">
          Verificación de salud del servicio y de la base:{' '}
          <a className="underline underline-offset-4" href="/api/health">
            /api/health
          </a>
          . El detalle operativo está en <code>HANDOFF.md</code>.
        </p>
      </section>
    </div>
  );
}
