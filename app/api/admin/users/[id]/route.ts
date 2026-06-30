import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import db from '@/lib/db';
import bcrypt from 'bcryptjs';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session || !(session.user as any).isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { username, display_name, password, is_admin, board_ids } = await req.json();

  if (username !== undefined) db.prepare('UPDATE users SET username = ? WHERE id = ?').run(username, params.id);
  if (display_name !== undefined) db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(display_name, params.id);
  if (is_admin !== undefined) db.prepare('UPDATE users SET is_admin = ? WHERE id = ?').run(is_admin ? 1 : 0, params.id);
  if (password) {
    const hash = await bcrypt.hash(password, 10);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, params.id);
  }

  if (board_ids !== undefined) {
    db.prepare('DELETE FROM user_boards WHERE user_id = ?').run(params.id);
    const insert = db.prepare('INSERT OR IGNORE INTO user_boards (user_id, board_id) VALUES (?, ?)');
    for (const boardId of board_ids) insert.run(params.id, boardId);
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session || !(session.user as any).isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  db.prepare('DELETE FROM users WHERE id = ?').run(params.id);
  return NextResponse.json({ ok: true });
}

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session || !(session.user as any).isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const user = db.prepare('SELECT id, username, display_name, is_admin FROM users WHERE id = ?').get(params.id);
  const boards = db.prepare('SELECT board_id FROM user_boards WHERE user_id = ?').all(params.id);
  return NextResponse.json({ ...user, board_ids: boards.map((b: any) => b.board_id) });
}
