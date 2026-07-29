import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/access';
import { guardCard } from '@/lib/boardAccess';
import { readOnlyReason } from '@/lib/tenant';
import db, { notify, boardIdOfCard } from '@/lib/db';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const g = guardCard(user, params.id, 'edit');
  if (!g.ok) return NextResponse.json({ error: 'Sin acceso a esta tarjeta' }, { status: g.status });
  const roMsg = readOnlyReason(user!.id);
  if (roMsg) return NextResponse.json({ error: roMsg }, { status: 403 });
  const { userId } = await req.json();

  // Sólo se asigna gente de la misma rama (el master puede a cualquiera)
  const target = db.prepare('SELECT id, tenant_id FROM users WHERE id = ?').get(userId) as any;
  if (!target || (!user!.isMaster && target.tenant_id !== user!.tenantId))
    return NextResponse.json({ error: 'Usuario inválido' }, { status: 400 });

  const result = db.prepare('INSERT OR IGNORE INTO card_members (card_id, user_id) VALUES (?, ?)').run(params.id, userId);

  if (result.changes > 0 && Number(userId) !== user!.id) {
    const card = db.prepare('SELECT title FROM cards WHERE id = ?').get(params.id) as any;
    notify(Number(userId), 'assigned', `${user!.name || 'Alguien'} te asignó la tarjeta "${card?.title || ''}"`, boardIdOfCard(params.id), Number(params.id));
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const g = guardCard(user, params.id, 'edit');
  if (!g.ok) return NextResponse.json({ error: 'Sin acceso a esta tarjeta' }, { status: g.status });
  const roMsg = readOnlyReason(user!.id);
  if (roMsg) return NextResponse.json({ error: roMsg }, { status: 403 });
  const { userId } = await req.json();
  db.prepare('DELETE FROM card_members WHERE card_id = ? AND user_id = ?').run(params.id, userId);
  return NextResponse.json({ ok: true });
}
