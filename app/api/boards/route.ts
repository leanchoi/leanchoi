import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import db from '@/lib/db';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = (session.user as any).id;
  const isAdmin = (session.user as any).isAdmin;

  const boards = isAdmin
    ? db.prepare('SELECT * FROM boards ORDER BY created_at DESC').all()
    : db.prepare('SELECT b.* FROM boards b JOIN user_boards ub ON b.id = ub.board_id WHERE ub.user_id = ? ORDER BY b.created_at DESC').all(userId);

  return NextResponse.json(boards);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !(session.user as any).isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { title, background } = await req.json();
  if (!title) return NextResponse.json({ error: 'Title required' }, { status: 400 });
  const result = db.prepare('INSERT INTO boards (title, background) VALUES (?, ?)').run(title, background || '#0079bf');
  const board = db.prepare('SELECT * FROM boards WHERE id = ?').get(result.lastInsertRowid);
  return NextResponse.json(board, { status: 201 });
}
