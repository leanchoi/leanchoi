import { NextResponse } from 'next/server';
import { z } from 'zod';
import { exigirPermiso, respuestaDeError } from '@/lib/auth/guardias';
import { limitadoASuBarrio } from '@/lib/auth/roles';
import {
  crearDerivacion,
  ESTADOS_DERIVACION,
  listarDerivaciones,
} from '@/lib/devolucion/derivaciones';
import { COMPETENCIAS } from '@/lib/devolucion/plantillas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Nueva = z.object({
  ticket: z.uuid(),
  barrioId: z.uuid(),
  competencia: z.enum(COMPETENCIAS),
  areaDestino: z.string().min(3).max(200),
  descripcion: z.string().min(5).max(2000),
  ordenTrabajoNro: z.string().max(80).optional().nullable(),
});

export async function GET(request: Request) {
  try {
    const usuario = await exigirPermiso('ver_derivaciones');
    const parametros = new URL(request.url).searchParams;
    const estado = parametros.get('estado');

    const derivaciones = await listarDerivaciones({
      barrioId: limitadoASuBarrio(usuario.rol) ? usuario.barrioId : null,
      ...(estado && ESTADOS_DERIVACION.includes(estado as never)
        ? { estado: estado as (typeof ESTADOS_DERIVACION)[number] }
        : {}),
    });

    return NextResponse.json({ derivaciones });
  } catch (error) {
    const respuesta = respuestaDeError(error);
    if (respuesta) return respuesta;
    throw error;
  }
}

export async function POST(request: Request) {
  try {
    const usuario = await exigirPermiso('ver_derivaciones');
    const parseo = Nueva.safeParse(await request.json().catch(() => null));
    if (!parseo.success) {
      return NextResponse.json(
        { error: 'datos_invalidos', detalle: parseo.error.issues.map((i) => i.message) },
        { status: 400 },
      );
    }

    const derivacion = await crearDerivacion(usuario, parseo.data);
    return NextResponse.json({ derivacion }, { status: 201 });
  } catch (error) {
    const respuesta = respuestaDeError(error);
    if (respuesta) return respuesta;
    throw error;
  }
}
