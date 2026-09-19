import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { sesionActual } from '@/lib/auth/guardias';
import { ETIQUETA_ROL, puede } from '@/lib/auth/roles';
import { CerrarSesion } from './cerrar-sesion';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Panel',
  robots: { index: false, follow: false },
};

export default async function LayoutPanel({ children }: { children: React.ReactNode }) {
  const usuario = await sesionActual();
  if (!usuario) redirect('/ingresar?destino=/panel');

  const enlaces = [
    { href: '/panel', etiqueta: 'Inicio', visible: true },
    {
      href: '/panel/tablero',
      etiqueta: 'Tablero',
      visible:
        puede(usuario.rol, 'ver_cobertura') ||
        puede(usuario.rol, 'ver_agregado_barrio') ||
        puede(usuario.rol, 'ver_agregado_todos'),
    },
    {
      href: '/panel/derivaciones',
      etiqueta: 'Derivaciones',
      visible: puede(usuario.rol, 'ver_derivaciones'),
    },
    { href: '/informes', etiqueta: 'Informes de barrio', visible: true },
    { href: '/cuestionario', etiqueta: 'Cuestionario', visible: true },
  ].filter((enlace) => enlace.visible);

  return (
    <div className="min-h-dvh">
      <header className="no-imprimir border-b">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <nav className="flex flex-wrap gap-4 text-sm">
            {enlaces.map((enlace) => (
              <a key={enlace.href} href={enlace.href} className="hover:underline">
                {enlace.etiqueta}
              </a>
            ))}
          </nav>
          <div className="text-muted-foreground flex items-center gap-3 text-sm">
            <span>
              {usuario.nombreVisible} · {ETIQUETA_ROL[usuario.rol]}
            </span>
            <CerrarSesion />
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}
