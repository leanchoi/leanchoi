import { NextResponse } from 'next/server';
import { z } from 'zod';
import { consultarPorApellidoYDni, consultarPorCodigo } from '@/lib/devolucion/consulta';
import { getEnv } from '@/lib/env';
import { cabecerasDeEspera, clienteDe, frenoPerezoso } from '@/lib/seguridad/freno';

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

/**
 * Freno contra quien quiera probar apellidos a mano. La consulta del vecino es
 * apellido + los últimos tres del documento: sin freno, probar de a uno es viable.
 */
const freno = frenoPerezoso(() => ({
  maximo: getEnv().TICKET_MAX_CONSULTAS,
  ventanaMs: getEnv().TICKET_VENTANA_MINUTOS * 60_000,
}));

export async function POST(request: Request) {
  const veredicto = freno.registrar(clienteDe(request));
  if (veredicto.frenado) {
    return NextResponse.json(
      { error: 'demasiadas_consultas', detalle: 'Esperá unos minutos y volvé a probar.' },
      { status: 429, headers: cabecerasDeEspera(veredicto) },
    );
  }

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
