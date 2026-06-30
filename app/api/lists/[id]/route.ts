import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import db from '@/lib/db';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json();
  if (body.title !== undefined) db.prepare('UPDATE lists SET title = ? WHERE id = ?').run(body.title, params.id);
  if (body.position !== undefined) db.prepare('UPDATE lists SET position = ? WHERE id = ?').run(body.position, params.id);
  return NextResponse.json(db.prepare('SELECT * FROM lists WHERE id = ?').get(params.id));
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  db.prepare('DELETE FROM lists WHERE id = ?').run(params.id);
  return NextResponse.json({ ok: true });
}
