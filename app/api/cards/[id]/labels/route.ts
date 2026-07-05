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
  const { color, text } = await req.json();
  if (!color) return NextResponse.json({ error: 'Color required' }, { status: 400 });
  const result = db.prepare('INSERT INTO labels (card_id, color, text) VALUES (?, ?, ?)').run(params.id, color, text || '');
  return NextResponse.json(db.prepare('SELECT * FROM labels WHERE id = ?').get(result.lastInsertRowid), { status: 201 });
}

export async function DELETE(req: NextRequest, { params: _ }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const roMsg = readOnlyReason(Number((session.user as any).id));
  if (roMsg) return NextResponse.json({ error: roMsg }, { status: 403 });
  const { labelId } = await req.json();
  db.prepare('DELETE FROM labels WHERE id = ?').run(labelId);
  return NextResponse.json({ ok: true });
}
