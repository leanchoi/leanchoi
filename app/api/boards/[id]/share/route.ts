import { NextRequest, NextResponse } from 'next/server';
import { requireUser, visibleUsers } from '@/lib/access';
import { guardBoard } from '@/lib/boardAccess';
import { readOnlyReason } from '@/lib/tenant';
import db from '@/lib/db';

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const g = guardBoard(user, params.id, 'view');
  if (!g.ok) return NextResponse.json({ error: 'Sin acceso a este tablero' }, { status: g.status });

  const board = db.prepare('SELECT id, title, is_public FROM boards WHERE id = ?').get(params.id) as any;
  const members = db.prepare(`
    SELECT u.id, u.username, u.display_name, u.avatar FROM user_boards ub
    JOIN users u ON ub.user_id = u.id WHERE ub.board_id = ? ORDER BY u.display_name ASC
  `).all(params.id);
  // Antes devolvía la lista completa de usuarios del sistema, incluidos los de
  // otras ramas; visibleUsers ya acota por rama.
  const allUsers = visibleUsers(user!).map((u: any) => ({
    id: u.id,
    username: u.username,
    display_name: u.name,
    avatar: u.avatar,
  }));
  return NextResponse.json({ board, members, allUsers });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const g = guardBoard(user, params.id, 'edit');
  if (!g.ok) return NextResponse.json({ error: 'Sin acceso a este tablero' }, { status: g.status });
  const roMsg = readOnlyReason(user!.id);
  if (roMsg) return NextResponse.json({ error: roMsg }, { status: 403 });
  const { userId } = await req.json();

  // Sólo se comparte con gente de la misma rama
  const target = db.prepare('SELECT id, tenant_id FROM users WHERE id = ?').get(userId) as any;
  if (!target || (!user!.isMaster && target.tenant_id !== user!.tenantId))
    return NextResponse.json({ error: 'Usuario inválido' }, { status: 400 });

  db.prepare('INSERT OR IGNORE INTO user_boards (user_id, board_id) VALUES (?, ?)').run(userId, params.id);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const g = guardBoard(user, params.id, 'edit');
  if (!g.ok) return NextResponse.json({ error: 'Sin acceso a este tablero' }, { status: g.status });
  const roMsg = readOnlyReason(user!.id);
  if (roMsg) return NextResponse.json({ error: roMsg }, { status: 403 });
  const { userId } = await req.json();
  db.prepare('DELETE FROM user_boards WHERE user_id = ? AND board_id = ?').run(userId, params.id);
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const g = guardBoard(user, params.id, 'admin');
  if (!g.ok)
    return NextResponse.json({ error: 'Solo el admin puede cambiar la visibilidad global' }, { status: g.status });
  const roMsg = readOnlyReason(user!.id);
  if (roMsg) return NextResponse.json({ error: roMsg }, { status: 403 });
  const { is_public } = await req.json();
  db.prepare('UPDATE boards SET is_public = ? WHERE id = ?').run(is_public ? 1 : 0, params.id);
  return NextResponse.json({ ok: true });
}
