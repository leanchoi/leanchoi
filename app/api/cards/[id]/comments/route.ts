import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import db, { notify, boardIdOfCard } from '@/lib/db';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = (session.user as any).id;
  const { text } = await req.json();
  if (!text?.trim()) return NextResponse.json({ error: 'Text required' }, { status: 400 });
  const result = db.prepare('INSERT INTO comments (card_id, user_id, text) VALUES (?, ?, ?)').run(params.id, userId, text.trim());
  const comment = db.prepare(`
    SELECT c.*, u.display_name as author_name FROM comments c JOIN users u ON c.user_id = u.id WHERE c.id = ?
  `).get(result.lastInsertRowid) as any;

  // Notifications: mentions + card members
  const card = db.prepare('SELECT title FROM cards WHERE id = ?').get(params.id) as any;
  const boardId = boardIdOfCard(params.id);
  const authorName = comment.author_name;
  const notified = new Set<number>([Number(userId)]);

  const mentioned = (text.match(/@([a-zA-Z0-9_.-]+)/g) || []).map((m: string) => m.slice(1));
  for (const uname of mentioned) {
    const u = db.prepare('SELECT id FROM users WHERE username = ?').get(uname) as any;
    if (u && !notified.has(u.id)) {
      notified.add(u.id);
      notify(u.id, 'mention', `${authorName} te mencionó en "${card?.title || 'una tarjeta'}"`, boardId, Number(params.id));
    }
  }

  const members = db.prepare('SELECT user_id FROM card_members WHERE card_id = ?').all(params.id) as any[];
  for (const m of members) {
    if (!notified.has(m.user_id)) {
      notified.add(m.user_id);
      notify(m.user_id, 'comment', `${authorName} comentó en "${card?.title || 'una tarjeta'}"`, boardId, Number(params.id));
    }
  }

  return NextResponse.json(comment, { status: 201 });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { commentId } = await req.json();
  const userId = (session.user as any).id;
  const isAdmin = (session.user as any).isAdmin;
  const comment = db.prepare('SELECT * FROM comments WHERE id = ?').get(commentId) as any;
  if (!comment) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!isAdmin && comment.user_id !== Number(userId)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  db.prepare('DELETE FROM comments WHERE id = ?').run(commentId);
  return NextResponse.json({ ok: true });
}
