import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/access';
import { guardCard } from '@/lib/boardAccess';
import { readOnlyReason } from '@/lib/tenant';
import db from '@/lib/db';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const g = guardCard(user, params.id, 'edit');
  if (!g.ok) return NextResponse.json({ error: 'Sin acceso a esta tarjeta' }, { status: g.status });
  const roMsg = readOnlyReason(user!.id);
  if (roMsg) return NextResponse.json({ error: roMsg }, { status: 403 });
  const { color, text } = await req.json();
  if (!color) return NextResponse.json({ error: 'Falta el color' }, { status: 400 });
  const result = db.prepare('INSERT INTO labels (card_id, color, text) VALUES (?, ?, ?)').run(params.id, color, text || '');
  return NextResponse.json(db.prepare('SELECT * FROM labels WHERE id = ?').get(result.lastInsertRowid), { status: 201 });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const g = guardCard(user, params.id, 'edit');
  if (!g.ok) return NextResponse.json({ error: 'Sin acceso a esta tarjeta' }, { status: g.status });
  const roMsg = readOnlyReason(user!.id);
  if (roMsg) return NextResponse.json({ error: roMsg }, { status: 403 });
  const { labelId } = await req.json();
  // Acotado a la tarjeta: antes un labelId cualquiera borraba la etiqueta de
  // otra tarjeta, de otro tablero incluso.
  const deleted = db.prepare('DELETE FROM labels WHERE id = ? AND card_id = ?').run(labelId, params.id);
  if (deleted.changes === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
