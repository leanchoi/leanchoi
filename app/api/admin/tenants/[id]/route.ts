import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import db from '@/lib/db';

export const dynamic = 'force-dynamic';

// Editar límites/vencimiento de una rama: SOLO el Admin Master.
// Poner una nueva fecha de vencimiento revierte el modo solo-lectura.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session || !(session.user as any).isMaster)
    return NextResponse.json({ error: 'Solo el Admin Master' }, { status: 403 });
  const t = db.prepare('SELECT * FROM tenants WHERE id = ?').get(Number(params.id)) as any;
  if (!t) return NextResponse.json({ error: 'Rama no encontrada' }, { status: 404 });
  const body = await req.json();
  const name = body.name !== undefined ? String(body.name).trim() || t.name : t.name;
  const maxUsers =
    body.maxUsers !== undefined
      ? Math.max(1, Math.min(500, Number(body.maxUsers) || t.max_users))
      : t.max_users;
  const storageMb =
    body.storageMb !== undefined
      ? Math.max(50, Math.min(100000, Number(body.storageMb) || t.storage_mb))
      : t.storage_mb;
  let expiresAt = t.expires_at;
  if (body.expiresAt !== undefined) {
    expiresAt = body.expiresAt ? String(body.expiresAt).slice(0, 10) : null;
  }
  db.prepare(
    'UPDATE tenants SET name = ?, max_users = ?, storage_mb = ?, expires_at = ? WHERE id = ?'
  ).run(name, maxUsers, storageMb, expiresAt, Number(params.id));
  return NextResponse.json({ ok: true });
}
