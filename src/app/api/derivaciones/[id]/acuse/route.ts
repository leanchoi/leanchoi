import { NextResponse } from 'next/server';
import { z } from 'zod';
import { exigirPermiso, respuestaDeError } from '@/lib/auth/guardias';
import { DerivacionInexistente, enviarAcuse } from '@/lib/devolucion/acuses';
import { PromesaSinRespaldo, TIPOS_PLANTILLA } from '@/lib/devolucion/plantillas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Entrada = z.object({ tipo: z.enum(TIPOS_PLANTILLA) });

/**
 * POST /api/derivaciones/{id}/acuse — le escribe al vecino.
 *
 * REGLA 4: si el tipo es `compromiso` y la derivación no tiene orden de trabajo, el
 * envío se corta con 409 y no queda registrado ningún acuse.
 */
export async function POST(request: Request, contexto: { params: Promise<{ id: string }> }) {
  try {
    const usuario = await exigirPermiso('ver_derivaciones');
    const { id } = await contexto.params;

    const parseo = Entrada.safeParse(await request.json().catch(() => null));
    if (!parseo.success) {
      return NextResponse.json({ error: 'tipo_invalido' }, { status: 400 });
    }

    const resultado = await enviarAcuse(usuario, { derivacionId: id, tipo: parseo.data.tipo });
    return NextResponse.json({ acuse: resultado });
  } catch (error) {
    if (error instanceof PromesaSinRespaldo) {
      return NextResponse.json(
        { error: 'promesa_sin_respaldo', detalle: error.message },
        { status: 409 },
      );
    }
    if (error instanceof DerivacionInexistente) {
      return NextResponse.json({ error: 'no_encontrada' }, { status: 404 });
    }
    const respuesta = respuestaDeError(error);
    if (respuesta) return respuesta;
    throw error;
  }
}
