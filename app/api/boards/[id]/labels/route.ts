import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { readOnlyReason } from '@/lib/tenant';
import db from '@/lib/db';

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const labels = db.prepare('SELECT * FROM board_labels WHERE board_id = ? ORDER BY name ASC, id ASC').all(params.id);
  return NextResponse.json(labels);
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const roMsg = readOnlyReason(Number((session.user as any).id));
  if (roMsg) return NextResponse.json({ error: roMsg }, { status: 403 });
  const { name, color } = await req.json();
  if (!color) return NextResponse.json({ error: 'Color requerido' }, { status: 400 });
  const result = db.prepare('INSERT INTO board_labels (board_id, name, color) VALUES (?, ?, ?)').run(params.id, (name || '').trim(), color);
  return NextResponse.json(db.prepare('SELECT * FROM board_labels WHERE id = ?').get(result.lastInsertRowid), { status: 201 });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const roMsg = readOnlyReason(Number((session.user as any).id));
  if (roMsg) return NextResponse.json({ error: roMsg }, { status: 403 });
  const { labelId, name, color } = await req.json();
  const existing = db.prepare('SELECT * FROM board_labels WHERE id = ? AND board_id = ?').get(labelId, params.id) as any;
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  db.prepare('UPDATE board_labels SET name = ?, color = ? WHERE id = ?')
    .run(name !== undefined ? (name || '').trim() : existing.name, color || existing.color, labelId);
  // Keep card labels of this board in sync (matched by old color)
  db.prepare(`
    UPDATE labels SET color = ?, text = ?
    WHERE color = ? AND card_id IN (SELECT c.id FROM cards c JOIN lists li ON c.list_id = li.id WHERE li.board_id = ?)
  `).run(color || existing.color, name !== undefined ? (name || '').trim() : existing.name, existing.color, params.id);
  return NextResponse.json(db.prepare('SELECT * FROM board_labels WHERE id = ?').get(labelId));
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const roMsg = readOnlyReason(Number((session.user as any).id));
  if (roMsg) return NextResponse.json({ error: roMsg }, { status: 403 });
  const { labelId } = await req.json();
  const existing = db.prepare('SELECT * FROM board_labels WHERE id = ? AND board_id = ?').get(labelId, params.id) as any;
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  // Remove the label from every card on the board too
  db.prepare(`
    DELETE FROM labels WHERE color = ? AND card_id IN (SELECT c.id FROM cards c JOIN lists li ON c.list_id = li.id WHERE li.board_id = ?)
  `).run(existing.color, params.id);
  db.prepare('DELETE FROM board_labels WHERE id = ?').run(labelId);
  return NextResponse.json({ ok: true });
}
