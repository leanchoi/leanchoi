import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { readOnlyReason } from '@/lib/tenant';
import db from '@/lib/db';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = (session.user as any).id;
  const isAdmin = (session.user as any).isAdmin;

  const boards = isAdmin
    ? db.prepare('SELECT * FROM boards ORDER BY created_at DESC').all()
    : db.prepare(`
        SELECT DISTINCT b.* FROM boards b
        LEFT JOIN user_boards ub ON b.id = ub.board_id AND ub.user_id = ?
        WHERE b.is_public = 1 OR ub.user_id IS NOT NULL
        ORDER BY b.created_at DESC
      `).all(userId);

  return NextResponse.json(boards);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const roMsg = readOnlyReason(Number((session.user as any).id));
  if (roMsg) return NextResponse.json({ error: roMsg }, { status: 403 });
  const userId = (session.user as any).id;
  const { title, background } = await req.json();
  if (!title) return NextResponse.json({ error: 'Title required' }, { status: 400 });
  const tenantId = Number((session.user as any).tenantId || 1);
  const result = db.prepare('INSERT INTO boards (title, background, tenant_id) VALUES (?, ?, ?)').run(title, background || '#0079bf', tenantId);
  // The creator becomes a member so the board shows up in their list
  db.prepare('INSERT OR IGNORE INTO user_boards (user_id, board_id) VALUES (?, ?)').run(userId, result.lastInsertRowid);
  const board = db.prepare('SELECT * FROM boards WHERE id = ?').get(result.lastInsertRowid);
  return NextResponse.json(board, { status: 201 });
}
