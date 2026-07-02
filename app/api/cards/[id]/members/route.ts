import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import db, { notify, boardIdOfCard } from '@/lib/db';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { userId } = await req.json();
  const result = db.prepare('INSERT OR IGNORE INTO card_members (card_id, user_id) VALUES (?, ?)').run(params.id, userId);

  const actorId = Number((session.user as any).id);
  if (result.changes > 0 && Number(userId) !== actorId) {
    const card = db.prepare('SELECT title FROM cards WHERE id = ?').get(params.id) as any;
    notify(Number(userId), 'assigned', `${session.user?.name || 'Alguien'} te asignó la tarjeta "${card?.title || ''}"`, boardIdOfCard(params.id), Number(params.id));
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { userId } = await req.json();
  db.prepare('DELETE FROM card_members WHERE card_id = ? AND user_id = ?').run(params.id, userId);
  return NextResponse.json({ ok: true });
}
