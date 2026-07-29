import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/access';
import { guardBoard } from '@/lib/boardAccess';
import { readOnlyReason } from '@/lib/tenant';
import db from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Reordenamiento en lote de listas y tarjetas de un tablero.
 *
 * Antes, arrastrar una tarjeta disparaba un PATCH por cada tarjeta de la lista
 * destino, encadenados con await: mover algo en una lista de 30 tarjetas eran
 * 30 viajes al servidor. Acá va todo en una request y una transacción, así el
 * tablero no queda a medio reordenar si se corta la conexión.
 *
 * Body: { lists?: [{ id, position }], cards?: [{ id, list_id, position }] }
 * Sólo se aceptan ids que pertenezcan a ESTE tablero.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const g = guardBoard(user, params.id, 'edit');
  if (!g.ok) return NextResponse.json({ error: 'Sin acceso a este tablero' }, { status: g.status });
  const roMsg = readOnlyReason(user!.id);
  if (roMsg) return NextResponse.json({ error: roMsg }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const lists: any[] = Array.isArray(body.lists) ? body.lists : [];
  const cards: any[] = Array.isArray(body.cards) ? body.cards : [];

  // Ids válidos del tablero, para no dejar que una request mueva cosas ajenas
  const boardListIds = new Set(
    (db.prepare('SELECT id FROM lists WHERE board_id = ?').all(g.boardId) as any[]).map((r) => Number(r.id))
  );
  const boardCardIds = new Set(
    (
      db
        .prepare('SELECT c.id FROM cards c JOIN lists li ON c.list_id = li.id WHERE li.board_id = ?')
        .all(g.boardId) as any[]
    ).map((r) => Number(r.id))
  );

  const updateList = db.prepare('UPDATE lists SET position = ? WHERE id = ?');
  const updateCard = db.prepare('UPDATE cards SET list_id = ?, position = ? WHERE id = ?');

  let listsMoved = 0;
  let cardsMoved = 0;

  const tx = db.transaction(() => {
    for (const l of lists) {
      const id = Number(l?.id);
      const pos = Number(l?.position);
      if (!boardListIds.has(id) || !Number.isFinite(pos)) continue;
      updateList.run(pos, id);
      listsMoved++;
    }
    for (const c of cards) {
      const id = Number(c?.id);
      const listId = Number(c?.list_id);
      const pos = Number(c?.position);
      if (!boardCardIds.has(id) || !boardListIds.has(listId) || !Number.isFinite(pos)) continue;
      updateCard.run(listId, pos, id);
      cardsMoved++;
    }
  });
  tx();

  return NextResponse.json({ ok: true, lists: listsMoved, cards: cardsMoved });
}
