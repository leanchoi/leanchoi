import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/access';
import { guardCard } from '@/lib/boardAccess';
import { readOnlyReason } from '@/lib/tenant';
import db, { notify, boardIdOfCard } from '@/lib/db';

// Un checklist/ítem sólo se puede tocar desde la tarjeta a la que pertenece:
// si no, mandando un id ajeno se editaría el checklist de otro tablero.
function checklistBelongsToCard(checklistId: any, cardId: string): boolean {
  const row = db.prepare('SELECT card_id FROM checklists WHERE id = ?').get(checklistId) as any;
  return !!row && String(row.card_id) === String(cardId);
}

function itemBelongsToCard(itemId: any, cardId: string): boolean {
  const row = db
    .prepare('SELECT cl.card_id AS cid FROM checklist_items ci JOIN checklists cl ON ci.checklist_id = cl.id WHERE ci.id = ?')
    .get(itemId) as any;
  return !!row && String(row.cid) === String(cardId);
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const g = guardCard(user, params.id, 'edit');
  if (!g.ok) return NextResponse.json({ error: 'Sin acceso a esta tarjeta' }, { status: g.status });
  const roMsg = readOnlyReason(user!.id);
  if (roMsg) return NextResponse.json({ error: roMsg }, { status: 403 });
  const body = await req.json();

  // Toda acción que recibe un id de checklist/ítem se valida contra la tarjeta
  if (body.checklist_id !== undefined && !checklistBelongsToCard(body.checklist_id, params.id))
    return NextResponse.json({ error: 'Checklist inválido' }, { status: 400 });
  if (body.item_id !== undefined && !itemBelongsToCard(body.item_id, params.id))
    return NextResponse.json({ error: 'Ítem inválido' }, { status: 400 });
  if (body.parent_item_id != null && !itemBelongsToCard(body.parent_item_id, params.id))
    return NextResponse.json({ error: 'Ítem padre inválido' }, { status: 400 });

  if (body.action === 'add_checklist') {
    // Nested checklists (hanging off an item) have no title; top-level ones do
    const title = body.parent_item_id ? (body.title || '') : (body.title || 'Checklist');
    const result = db.prepare('INSERT INTO checklists (card_id, title, parent_item_id) VALUES (?, ?, ?)')
      .run(params.id, title, body.parent_item_id ?? null);
    return NextResponse.json(db.prepare('SELECT * FROM checklists WHERE id = ?').get(result.lastInsertRowid), { status: 201 });
  }

  if (body.action === 'add_item') {
    const maxPos = (db.prepare('SELECT MAX(position) as m FROM checklist_items WHERE checklist_id = ?').get(body.checklist_id) as any)?.m ?? 0;
    const result = db.prepare("INSERT INTO checklist_items (checklist_id, text, position, created_by, created_at) VALUES (?, ?, ?, ?, datetime('now'))").run(body.checklist_id, body.text, maxPos + 1, user!.id);
    const item = db.prepare(`
      SELECT ci.*, u.display_name as assigned_user_name
      FROM checklist_items ci LEFT JOIN users u ON ci.assigned_user_id = u.id WHERE ci.id = ?
    `).get(result.lastInsertRowid);
    return NextResponse.json(item, { status: 201 });
  }

  if (body.action === 'toggle_item') {
    if (body.is_checked) {
      db.prepare("UPDATE checklist_items SET is_checked = 1, completed_by = ?, completed_at = datetime('now') WHERE id = ?").run(user!.id, body.item_id);
    } else {
      db.prepare('UPDATE checklist_items SET is_checked = 0, completed_by = NULL, completed_at = NULL WHERE id = ?').run(body.item_id);
    }
    return NextResponse.json({ ok: true });
  }

  if (body.action === 'update_item') {
    const fields: string[] = [];
    const values: any[] = [];
    if (body.due_date !== undefined) { fields.push('due_date = ?'); values.push(body.due_date); }
    if (body.assigned_user_id !== undefined) { fields.push('assigned_user_id = ?'); values.push(body.assigned_user_id); }
    if (fields.length > 0) {
      values.push(body.item_id);
      db.prepare(`UPDATE checklist_items SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    }
    const item = db.prepare(`
      SELECT ci.*, u.display_name as assigned_user_name
      FROM checklist_items ci LEFT JOIN users u ON ci.assigned_user_id = u.id WHERE ci.id = ?
    `).get(body.item_id) as any;

    const actorId = Number(user!.id);
    if (body.assigned_user_id && Number(body.assigned_user_id) !== actorId) {
      const card = db.prepare('SELECT title FROM cards WHERE id = ?').get(params.id) as any;
      notify(Number(body.assigned_user_id), 'assigned', `${user!.name || 'Alguien'} te asignó el ítem "${item?.text || ''}" en "${card?.title || ''}"`, boardIdOfCard(params.id), Number(params.id));
    }
    return NextResponse.json(item);
  }

  if (body.action === 'delete_item') {
    deleteItemDeep(body.item_id);
    return NextResponse.json({ ok: true });
  }

  if (body.action === 'delete_checklist') {
    deleteChecklistDeep(body.checklist_id);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}

// Nested checklists hang off items via parent_item_id, so deletes must recurse
function deleteItemDeep(itemId: number) {
  const children = db.prepare('SELECT id FROM checklists WHERE parent_item_id = ?').all(itemId) as any[];
  for (const cl of children) deleteChecklistDeep(cl.id);
  db.prepare('DELETE FROM checklist_items WHERE id = ?').run(itemId);
}

function deleteChecklistDeep(checklistId: number) {
  const items = db.prepare('SELECT id FROM checklist_items WHERE checklist_id = ?').all(checklistId) as any[];
  for (const it of items) deleteItemDeep(it.id);
  db.prepare('DELETE FROM checklists WHERE id = ?').run(checklistId);
}
