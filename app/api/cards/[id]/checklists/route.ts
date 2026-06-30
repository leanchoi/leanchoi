import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import db from '@/lib/db';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json();

  if (body.action === 'add_checklist') {
    const result = db.prepare('INSERT INTO checklists (card_id, title) VALUES (?, ?)').run(params.id, body.title || 'Checklist');
    return NextResponse.json(db.prepare('SELECT * FROM checklists WHERE id = ?').get(result.lastInsertRowid), { status: 201 });
  }

  if (body.action === 'add_item') {
    const maxPos = (db.prepare('SELECT MAX(position) as m FROM checklist_items WHERE checklist_id = ?').get(body.checklist_id) as any)?.m ?? 0;
    const result = db.prepare('INSERT INTO checklist_items (checklist_id, text, position) VALUES (?, ?, ?)').run(body.checklist_id, body.text, maxPos + 1);
    return NextResponse.json(db.prepare('SELECT * FROM checklist_items WHERE id = ?').get(result.lastInsertRowid), { status: 201 });
  }

  if (body.action === 'toggle_item') {
    db.prepare('UPDATE checklist_items SET is_checked = ? WHERE id = ?').run(body.is_checked ? 1 : 0, body.item_id);
    return NextResponse.json({ ok: true });
  }

  if (body.action === 'delete_item') {
    db.prepare('DELETE FROM checklist_items WHERE id = ?').run(body.item_id);
    return NextResponse.json({ ok: true });
  }

  if (body.action === 'delete_checklist') {
    db.prepare('DELETE FROM checklists WHERE id = ?').run(body.checklist_id);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
