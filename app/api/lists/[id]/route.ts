import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/access';
import { guardList } from '@/lib/boardAccess';
import { readOnlyReason } from '@/lib/tenant';
import db from '@/lib/db';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const g = guardList(user, params.id, 'edit');
  if (!g.ok) return NextResponse.json({ error: 'Sin acceso a esta lista' }, { status: g.status });
  const roMsg = readOnlyReason(user!.id);
  if (roMsg) return NextResponse.json({ error: roMsg }, { status: 403 });
  const body = await req.json();
  if (body.title !== undefined) db.prepare('UPDATE lists SET title = ? WHERE id = ?').run(body.title, params.id);
  if (body.position !== undefined) db.prepare('UPDATE lists SET position = ? WHERE id = ?').run(body.position, params.id);
  return NextResponse.json(db.prepare('SELECT * FROM lists WHERE id = ?').get(params.id));
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const g = guardList(user, params.id, 'edit');
  if (!g.ok) return NextResponse.json({ error: 'Sin acceso a esta lista' }, { status: g.status });
  const roMsg = readOnlyReason(user!.id);
  if (roMsg) return NextResponse.json({ error: roMsg }, { status: 403 });
  db.prepare('DELETE FROM lists WHERE id = ?').run(params.id);
  return NextResponse.json({ ok: true });
}
