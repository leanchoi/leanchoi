import { sesionActual } from '@/lib/auth/guardias';
import { limitadoASuBarrio, puede } from '@/lib/auth/roles';
import { listarDerivaciones } from '@/lib/devolucion/derivaciones';
import { GestorDerivaciones } from './gestor';

export const dynamic = 'force-dynamic';

export default async function PaginaDerivaciones() {
  const usuario = await sesionActual();
  if (!usuario || !puede(usuario.rol, 'ver_derivaciones')) {
    // El rol no alcanza: se dice, no se rompe.
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <h1 className="text-2xl font-semibold">No tenés acceso a esta sección</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          Las derivaciones las ve la conducción del operativo. Si creés que tendrías que verlas,
          hablá con la Dirección de Juntas Vecinales.
        </p>
        <a className="mt-6 inline-block underline underline-offset-4" href="/panel">
          Volver al panel
        </a>
      </div>
    );
  }
  const derivaciones = await listarDerivaciones({
    barrioId: limitadoASuBarrio(usuario.rol) ? usuario.barrioId : null,
  });

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Derivaciones</h1>
      <p className="text-muted-foreground mt-2 max-w-2xl text-sm">
        Cada pedido, a quién le corresponde y en qué quedó. Solo se puede comprometer trabajo cuando
        hay una orden cargada: sin eso, al vecino se le acusa recibo o se le informa la derivación,
        pero no se le promete nada.
      </p>

      <div className="mt-8">
        <GestorDerivaciones iniciales={derivaciones} />
      </div>
    </div>
  );
}
