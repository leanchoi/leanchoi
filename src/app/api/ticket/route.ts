import { NextResponse } from 'next/server';
import { z } from 'zod';
import { consultarPorApellidoYDni, consultarPorCodigo } from '@/lib/devolucion/consulta';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/ticket — consulta del vecino, sin cuenta.
 *
 * Con el código del comprobante, o con apellido y los últimos 3 del DNI. No devuelve
 * ningún dato personal: solo el estado del pedido.
 */
const Entrada = z.union([
  z.object({ codigo: z.string().min(4).max(40) }),
  z.object({
    apellido: z.string().min(2).max(120),
    dni: z.string().regex(/^\d{3}$/, 'Son los últimos 3 números del documento.'),
  }),
]);

/** Freno contra quien quiera probar apellidos a mano. */
const intentos = new Map<string, { cantidad: number; hasta: number }>();
const MAX = 20;
const VENTANA_MS = 10 * 60_000;

function frenado(ip: string): boolean {
  const registro = intentos.get(ip);
  if (!registro) return false;
  if (Date.now() > registro.hasta) {
    intentos.delete(ip);
    return false;
  }
  return registro.cantidad >= MAX;
}

function anotar(ip: string): void {
  const registro = intentos.get(ip);
  if (!registro || Date.now() > registro.hasta) {
    intentos.set(ip, { cantidad: 1, hasta: Date.now() + VENTANA_MS });
    return;
  }
  registro.cantidad += 1;
}

export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for') ?? 'local';
  if (frenado(ip)) {
    return NextResponse.json(
      { error: 'demasiadas_consultas', detalle: 'Esperá unos minutos y volvé a probar.' },
      { status: 429 },
    );
  }
  anotar(ip);

  const parseo = Entrada.safeParse(await request.json().catch(() => null));
  if (!parseo.success) {
    return NextResponse.json({ error: 'datos_invalidos' }, { status: 400 });
  }

  const estado =
    'codigo' in parseo.data
      ? await consultarPorCodigo(parseo.data.codigo)
      : await consultarPorApellidoYDni(parseo.data.apellido, parseo.data.dni);

  if (!estado) {
    // Mismo mensaje siempre: no se confirma si el apellido existe o no.
    return NextResponse.json(
      {
        error: 'no_encontrado',
        detalle:
          'No encontramos un pedido con esos datos. Revisá el código, o acercate a la sede vecinal de tu barrio.',
      },
      { status: 404 },
    );
  }

  return NextResponse.json({ estado });
}
