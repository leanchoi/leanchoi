import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/access';
import { guardList } from '@/lib/boardAccess';
import { readOnlyReason } from '@/lib/tenant';
import db from '@/lib/db';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const g = guardList(user, params.id, 'edit');
  if (!g.ok) return NextResponse.json({ error: 'Sin acceso a esta lista' }, { status: g.status });
  const roMsg = readOnlyReason(user!.id);
  if (roMsg) return NextResponse.json({ error: roMsg }, { status: 403 });
  const { title } = await req.json();
  if (!title) return NextResponse.json({ error: 'Falta el título' }, { status: 400 });
  const maxPos = (db.prepare('SELECT MAX(position) as m FROM cards WHERE list_id = ?').get(params.id) as any)?.m ?? 0;
  const result = db.prepare('INSERT INTO cards (list_id, title, position, created_by) VALUES (?, ?, ?, ?)').run(params.id, title, maxPos + 1, user!.id);
  return NextResponse.json(db.prepare('SELECT * FROM cards WHERE id = ?').get(result.lastInsertRowid), { status: 201 });
}
