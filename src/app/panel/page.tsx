import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { exigirSesion } from '@/lib/auth/guardias';
import { ETIQUETA_ROL, permisosDe, puede } from '@/lib/auth/roles';

export const dynamic = 'force-dynamic';

export default async function PaginaPanel() {
  const usuario = await exigirSesion();

  const accesos = [
    {
      href: '/panel/tablero',
      titulo: 'Tablero',
      descripcion: 'Cobertura, no-respuesta por motivo, prioridades y derivaciones.',
      visible:
        puede(usuario.rol, 'ver_cobertura') ||
        puede(usuario.rol, 'ver_agregado_barrio') ||
        puede(usuario.rol, 'ver_agregado_todos'),
    },
    {
      href: '/panel/derivaciones',
      titulo: 'Derivaciones',
      descripcion: 'Qué pidió cada vecino, a quién le corresponde y en qué quedó.',
      visible: puede(usuario.rol, 'ver_derivaciones'),
    },
    {
      href: '/informes',
      titulo: 'Informes de barrio',
      descripcion: 'La carilla que se imprime y se cuelga en la sede vecinal.',
      visible: true,
    },
    {
      href: '/campo',
      titulo: 'App de campo',
      descripcion: 'Cargar encuestas en la calle.',
      visible: puede(usuario.rol, 'cargar_en_su_barrio'),
    },
  ].filter((acceso) => acceso.visible);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">
        Hola, {usuario.nombreVisible.split(' ')[0]}
      </h1>
      <p className="text-muted-foreground mt-2 text-sm">
        Tu rol es <strong>{ETIQUETA_ROL[usuario.rol]}</strong>. Podés:{' '}
        {permisosDe(usuario.rol).join(', ')}.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {accesos.map((acceso) => (
          <a key={acceso.href} href={acceso.href}>
            <Card className="hover:bg-accent h-full transition-colors">
              <CardHeader>
                <CardTitle>{acceso.titulo}</CardTitle>
                <CardDescription>{acceso.descripcion}</CardDescription>
              </CardHeader>
            </Card>
          </a>
        ))}
      </div>
    </div>
  );
}
