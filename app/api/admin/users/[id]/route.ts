import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import db from '@/lib/db';
import bcrypt from 'bcryptjs';

// Un admin de rama solo puede tocar usuarios de SU rama; el master, a todos.
function canManage(session: any, targetId: string | number) {
  const u = session?.user as any;
  if (!u?.isAdmin && !u?.isMaster) return null;
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(targetId)) as any;
  if (!target) return null;
  if (u.isMaster) return target;
  if (target.tenant_id !== Number(u.tenantId)) return null;
  if (target.is_master) return null; // nadie toca al master salvo él mismo
  return target;
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const target = canManage(session, params.id);
  if (!target) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { username, display_name, password, is_admin, board_ids } = await req.json();

  if (username !== undefined) db.prepare('UPDATE users SET username = ? WHERE id = ?').run(username, params.id);
  if (display_name !== undefined) db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(display_name, params.id);
  if (is_admin !== undefined && !target.is_master)
    db.prepare('UPDATE users SET is_admin = ? WHERE id = ?').run(is_admin ? 1 : 0, params.id);
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
  const target = canManage(session, params.id);
  if (!target) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (Number(params.id) === Number((session!.user as any).id))
    return NextResponse.json({ error: 'No podés borrarte a vos mismo' }, { status: 400 });
  if (target.is_master)
    return NextResponse.json({ error: 'No se puede borrar al Admin Master' }, { status: 400 });
  db.prepare('DELETE FROM users WHERE id = ?').run(params.id);
  return NextResponse.json({ ok: true });
}

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const target = canManage(session, params.id);
  if (!target) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const user = db
    .prepare('SELECT id, username, display_name, is_admin, tenant_id FROM users WHERE id = ?')
    .get(params.id) as any;
  const boards = db.prepare('SELECT board_id FROM user_boards WHERE user_id = ?').all(params.id);
  return NextResponse.json({ ...user, board_ids: boards.map((b: any) => b.board_id) });
}
