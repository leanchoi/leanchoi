import { NextResponse } from 'next/server';
import { sesionActual } from '@/lib/auth/guardias';
import { permisosDe } from '@/lib/auth/roles';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/auth/yo — quién soy y qué puedo hacer. */
export async function GET() {
  const usuario = await sesionActual();
  if (!usuario) return NextResponse.json({ usuario: null }, { status: 401 });
  return NextResponse.json({ usuario, permisos: permisosDe(usuario.rol) });
}
