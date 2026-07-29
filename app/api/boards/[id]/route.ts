import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/access';
import { guardBoard } from '@/lib/boardAccess';
import { readOnlyReason, canDeleteBoard } from '@/lib/tenant';
import db from '@/lib/db';

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const g = guardBoard(user, params.id, 'view');
  if (!g.ok) return NextResponse.json({ error: 'Sin acceso a este tablero' }, { status: g.status });

  const board = db.prepare('SELECT * FROM boards WHERE id = ?').get(params.id) as any;
  if (!board) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const lists = db.prepare('SELECT * FROM lists WHERE board_id = ? ORDER BY position ASC').all(params.id) as any[];
  const cards = db.prepare(`
    SELECT c.*, GROUP_CONCAT(l.color || '|' || COALESCE(l.text,''), ',') as labels_raw
    FROM cards c
    JOIN lists li ON c.list_id = li.id
    LEFT JOIN labels l ON l.card_id = c.id
    WHERE li.board_id = ?
    GROUP BY c.id
    ORDER BY c.position ASC
  `).all(params.id) as any[];

  const cardsWithLabels = cards.map((card: any) => ({
    ...card,
    labels: card.labels_raw ? card.labels_raw.split(',').filter(Boolean).map((l: string) => {
      const [color, text] = l.split('|');
      return { color, text: text || '' };
    }) : [],
  }));

  return NextResponse.json({ ...board, lists, cards: cardsWithLabels });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireUser();
  // Antes bastaba con ser admin de cualquier rama para renombrar un tablero
  // ajeno; guardBoard acota por rama.
  const g = guardBoard(user, params.id, 'admin');
  if (!g.ok) return NextResponse.json({ error: 'Sin permiso sobre este tablero' }, { status: g.status });
  const roMsg = readOnlyReason(user!.id);
  if (roMsg) return NextResponse.json({ error: roMsg }, { status: 403 });
  const { title, background } = await req.json();
  db.prepare('UPDATE boards SET title = COALESCE(?, title), background = COALESCE(?, background) WHERE id = ?')
    .run(title ?? null, background ?? null, params.id);
  return NextResponse.json(db.prepare('SELECT * FROM boards WHERE id = ?').get(params.id));
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const g = guardBoard(user, params.id, 'view');
  if (!g.ok) return NextResponse.json({ error: 'Sin acceso a este tablero' }, { status: g.status });
  const board = db.prepare('SELECT tenant_id, created_by FROM boards WHERE id = ?').get(params.id) as any;
  if (!board) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  // Puede borrar: Admin Master, admin de la rama, o quien creó el tablero
  const allowed = canDeleteBoard(user!, board);
  if (!allowed) return NextResponse.json({ error: 'No tenés permiso para borrar este tablero' }, { status: 403 });
  const roMsg = readOnlyReason(user!.id);
  if (roMsg) return NextResponse.json({ error: roMsg }, { status: 403 });
  db.prepare('DELETE FROM boards WHERE id = ?').run(params.id);
  return NextResponse.json({ ok: true });
}
