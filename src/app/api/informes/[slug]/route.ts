import { NextResponse } from 'next/server';
import { exigirPermiso, respuestaDeError } from '@/lib/auth/guardias';
import { calcularInforme, generarInforme } from '@/lib/devolucion/informe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET: vista previa del informe, sin guardarlo. */
export async function GET(_request: Request, contexto: { params: Promise<{ slug: string }> }) {
  try {
    await exigirPermiso('ver_cobertura');
    const { slug } = await contexto.params;
    const contenido = await calcularInforme(slug);
    if (!contenido) return NextResponse.json({ error: 'barrio_no_encontrado' }, { status: 404 });
    return NextResponse.json({ informe: contenido });
  } catch (error) {
    const respuesta = respuestaDeError(error);
    if (respuesta) return respuesta;
    throw error;
  }
}

/** POST: genera el informe y lo publica para que el barrio lo vea. */
export async function POST(_request: Request, contexto: { params: Promise<{ slug: string }> }) {
  try {
    const usuario = await exigirPermiso('ver_derivaciones');
    const { slug } = await contexto.params;
    const contenido = await generarInforme(usuario, slug);
    if (!contenido) return NextResponse.json({ error: 'barrio_no_encontrado' }, { status: 404 });
    return NextResponse.json({ informe: contenido }, { status: 201 });
  } catch (error) {
    const respuesta = respuestaDeError(error);
    if (respuesta) return respuesta;
    throw error;
  }
}
