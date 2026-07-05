import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { readOnlyReason } from '@/lib/tenant';
import db from '@/lib/db';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const roMsg = readOnlyReason(Number((session.user as any).id));
  if (roMsg) return NextResponse.json({ error: roMsg }, { status: 403 });
  const { title } = await req.json();
  if (!title) return NextResponse.json({ error: 'Title required' }, { status: 400 });
  const maxPos = (db.prepare('SELECT MAX(position) as m FROM lists WHERE board_id = ?').get(params.id) as any)?.m ?? 0;
  const result = db.prepare('INSERT INTO lists (board_id, title, position) VALUES (?, ?, ?)').run(params.id, title, maxPos + 1);
  return NextResponse.json(db.prepare('SELECT * FROM lists WHERE id = ?').get(result.lastInsertRowid), { status: 201 });
}
