import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import db from '@/lib/db';

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const card = db.prepare('SELECT * FROM cards WHERE id = ?').get(params.id) as any;
  if (!card) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const labels = db.prepare('SELECT * FROM labels WHERE card_id = ?').all(params.id);
  const members = db.prepare(`
    SELECT u.id as user_id, u.display_name, u.avatar FROM card_members cm
    JOIN users u ON cm.user_id = u.id WHERE cm.card_id = ?
  `).all(params.id);
  const allChecklists = db.prepare('SELECT * FROM checklists WHERE card_id = ?').all(params.id) as any[];
  const allItems = db.prepare(`
    SELECT ci.*, u.display_name as assigned_user_name
    FROM checklist_items ci
    JOIN checklists cl ON ci.checklist_id = cl.id
    LEFT JOIN users u ON ci.assigned_user_id = u.id
    WHERE cl.card_id = ? ORDER BY ci.position ASC
  `).all(params.id) as any[];

  // Assemble the nested tree: checklists can hang off items via parent_item_id
  function buildChecklist(cl: any): any {
    return {
      ...cl,
      items: allItems.filter(it => it.checklist_id === cl.id).map(it => ({
        ...it,
        checklists: allChecklists.filter(sub => sub.parent_item_id === it.id).map(buildChecklist),
      })),
    };
  }
  const checklistsWithItems = allChecklists.filter(cl => !cl.parent_item_id).map(buildChecklist);
  const rawComments = db.prepare(`
    SELECT c.*, u.display_name as author_name, u.avatar as author_avatar
    FROM comments c JOIN users u ON c.user_id = u.id
    WHERE c.card_id = ? ORDER BY c.created_at ASC
  `).all(params.id) as any[];
  const allAttachments = db.prepare('SELECT * FROM attachments WHERE card_id = ? ORDER BY created_at DESC').all(params.id) as any[];

  // Card-level attachments vs. files attached to specific comments
  const attachments = allAttachments.filter(a => !a.comment_id);
  const comments = rawComments.map(c => ({
    ...c,
    attachments: allAttachments.filter(a => a.comment_id === c.id),
  }));

  return NextResponse.json({ ...card, labels, members, checklists: checklistsWithItems, comments, attachments });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json();

  const fields: string[] = [];
  const values: any[] = [];
  if (body.title !== undefined) { fields.push('title = ?'); values.push(body.title); }
  if (body.description !== undefined) { fields.push('description = ?'); values.push(body.description); }
  if (body.due_date !== undefined) { fields.push('due_date = ?'); values.push(body.due_date); }
  if (body.list_id !== undefined) { fields.push('list_id = ?'); values.push(body.list_id); }
  if (body.position !== undefined) { fields.push('position = ?'); values.push(body.position); }

  if (fields.length > 0) {
    values.push(params.id);
    db.prepare(`UPDATE cards SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  }

  return NextResponse.json(db.prepare('SELECT * FROM cards WHERE id = ?').get(params.id));
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  db.prepare('DELETE FROM cards WHERE id = ?').run(params.id);
  return NextResponse.json({ ok: true });
}
