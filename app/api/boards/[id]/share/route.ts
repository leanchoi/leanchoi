import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import db from '@/lib/db';

function canAccess(session: any, boardId: string): boolean {
  if ((session.user as any).isAdmin) return true;
  const board = db.prepare('SELECT is_public FROM boards WHERE id = ?').get(boardId) as any;
  if (board?.is_public) return true;
  return !!db.prepare('SELECT 1 FROM user_boards WHERE user_id = ? AND board_id = ?').get((session.user as any).id, boardId);
}

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canAccess(session, params.id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const board = db.prepare('SELECT id, title, is_public FROM boards WHERE id = ?').get(params.id) as any;
  const members = db.prepare(`
    SELECT u.id, u.username, u.display_name, u.avatar FROM user_boards ub
    JOIN users u ON ub.user_id = u.id WHERE ub.board_id = ? ORDER BY u.display_name ASC
  `).all(params.id);
  const allUsers = db.prepare('SELECT id, username, display_name, avatar FROM users ORDER BY display_name ASC').all();
  return NextResponse.json({ board, members, allUsers });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canAccess(session, params.id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { userId } = await req.json();
  db.prepare('INSERT OR IGNORE INTO user_boards (user_id, board_id) VALUES (?, ?)').run(userId, params.id);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canAccess(session, params.id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { userId } = await req.json();
  db.prepare('DELETE FROM user_boards WHERE user_id = ? AND board_id = ?').run(userId, params.id);
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session || !(session.user as any).isAdmin) return NextResponse.json({ error: 'Solo el admin puede cambiar la visibilidad global' }, { status: 403 });
  const { is_public } = await req.json();
  db.prepare('UPDATE boards SET is_public = ? WHERE id = ?').run(is_public ? 1 : 0, params.id);
  return NextResponse.json({ ok: true });
}
