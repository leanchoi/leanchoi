import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/access';
import { buildDigest, digestPendingFor, markDigestSeen } from '@/lib/digest';
import { mustChangePassword } from '@/lib/passwords';

export const dynamic = 'force-dynamic';

// GET: ¿corresponde mostrar el resumen de hoy? Si sí, viene con los datos.
export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  // El resumen espera su turno: primero la contraseña. Así no se apilan dos
  // ventanas encima del usuario en el primer login.
  if (mustChangePassword(user.id)) return NextResponse.json({ pending: false, blocked: 'password' });
  if (!digestPendingFor(user.id)) return NextResponse.json({ pending: false });

  return NextResponse.json({ pending: true, digest: buildDigest(user.id) });
}

// POST: el usuario lo cerró; no se vuelve a mostrar hasta mañana.
export async function POST() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  markDigestSeen(user.id);
  return NextResponse.json({ ok: true });
}
