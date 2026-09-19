import { NextResponse } from 'next/server';
import { z } from 'zod';
import { exigirPermiso, respuestaDeError } from '@/lib/auth/guardias';
import { actualizarDerivacion, ESTADOS_DERIVACION } from '@/lib/devolucion/derivaciones';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Cambio = z.object({
  estado: z.enum(ESTADOS_DERIVACION).optional(),
  ordenTrabajoNro: z.string().max(80).nullable().optional(),
  areaDestino: z.string().min(3).max(200).optional(),
});

export async function PATCH(request: Request, contexto: { params: Promise<{ id: string }> }) {
  try {
    const usuario = await exigirPermiso('ver_derivaciones');
    const { id } = await contexto.params;

    const parseo = Cambio.safeParse(await request.json().catch(() => null));
    if (!parseo.success) {
      return NextResponse.json({ error: 'datos_invalidos' }, { status: 400 });
    }

    const derivacion = await actualizarDerivacion(usuario, id, parseo.data);
    if (!derivacion) return NextResponse.json({ error: 'no_encontrada' }, { status: 404 });

    return NextResponse.json({ derivacion });
  } catch (error) {
    const respuesta = respuestaDeError(error);
    if (respuesta) return respuesta;
    throw error;
  }
}
