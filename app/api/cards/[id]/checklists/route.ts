import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import db, { notify, boardIdOfCard } from '@/lib/db';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json();

  if (body.action === 'add_checklist') {
    // Nested checklists (hanging off an item) have no title; top-level ones do
    const title = body.parent_item_id ? (body.title || '') : (body.title || 'Checklist');
    const result = db.prepare('INSERT INTO checklists (card_id, title, parent_item_id) VALUES (?, ?, ?)')
      .run(params.id, title, body.parent_item_id ?? null);
    return NextResponse.json(db.prepare('SELECT * FROM checklists WHERE id = ?').get(result.lastInsertRowid), { status: 201 });
  }

  if (body.action === 'add_item') {
    const maxPos = (db.prepare('SELECT MAX(position) as m FROM checklist_items WHERE checklist_id = ?').get(body.checklist_id) as any)?.m ?? 0;
    const result = db.prepare("INSERT INTO checklist_items (checklist_id, text, position, created_by, created_at) VALUES (?, ?, ?, ?, datetime('now'))").run(body.checklist_id, body.text, maxPos + 1, (session.user as any).id);
    const item = db.prepare(`
      SELECT ci.*, u.display_name as assigned_user_name
      FROM checklist_items ci LEFT JOIN users u ON ci.assigned_user_id = u.id WHERE ci.id = ?
    `).get(result.lastInsertRowid);
    return NextResponse.json(item, { status: 201 });
  }

  if (body.action === 'toggle_item') {
    if (body.is_checked) {
      db.prepare("UPDATE checklist_items SET is_checked = 1, completed_by = ?, completed_at = datetime('now') WHERE id = ?").run((session.user as any).id, body.item_id);
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

    const actorId = Number((session.user as any).id);
    if (body.assigned_user_id && Number(body.assigned_user_id) !== actorId) {
      const card = db.prepare('SELECT title FROM cards WHERE id = ?').get(params.id) as any;
      notify(Number(body.assigned_user_id), 'assigned', `${session.user?.name || 'Alguien'} te asignó el ítem "${item?.text || ''}" en "${card?.title || ''}"`, boardIdOfCard(params.id), Number(params.id));
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
