import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/access';
import { accessibleBoardsSql } from '@/lib/boardAccess';
import { readOnlyReason } from '@/lib/tenant';
import db from '@/lib/db';

export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  // El admin de rama veía TODOS los tableros de TODAS las ramas; ahora la
  // consulta sale de accessibleBoardsSql, que siempre acota por tenant salvo
  // para el Admin Master.
  const { sql, params } = accessibleBoardsSql(user);
  const boards = db.prepare(`${sql} ORDER BY b.created_at DESC`).all(...params);

  return NextResponse.json(boards);
}

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const roMsg = readOnlyReason(user.id);
  if (roMsg) return NextResponse.json({ error: roMsg }, { status: 403 });
  const { title, background } = await req.json();
  if (!title?.trim()) return NextResponse.json({ error: 'Falta el título' }, { status: 400 });
  const result = db
    .prepare('INSERT INTO boards (title, background, tenant_id, created_by) VALUES (?, ?, ?, ?)')
    .run(title.trim(), background || '#0079bf', user.tenantId, user.id);
  // The creator becomes a member so the board shows up in their list
  db.prepare('INSERT OR IGNORE INTO user_boards (user_id, board_id) VALUES (?, ?)').run(user.id, result.lastInsertRowid);
  const board = db.prepare('SELECT * FROM boards WHERE id = ?').get(result.lastInsertRowid);
  return NextResponse.json(board, { status: 201 });
}
