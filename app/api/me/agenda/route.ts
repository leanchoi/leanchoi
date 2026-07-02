import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import db from '@/lib/db';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = (session.user as any).id;

  const cards = db.prepare(`
    SELECT c.id, c.title, c.due_date, li.title as list_title,
           b.id as board_id, b.title as board_title, b.background as board_background
    FROM card_members cm
    JOIN cards c ON cm.card_id = c.id
    JOIN lists li ON c.list_id = li.id
    JOIN boards b ON li.board_id = b.id
    WHERE cm.user_id = ?
    ORDER BY c.due_date IS NULL, c.due_date ASC
  `).all(userId);

  const items = db.prepare(`
    SELECT ci.id, ci.text, ci.due_date, ci.is_checked,
           c.id as card_id, c.title as card_title,
           b.id as board_id, b.title as board_title, b.background as board_background
    FROM checklist_items ci
    JOIN checklists cl ON ci.checklist_id = cl.id
    JOIN cards c ON cl.card_id = c.id
    JOIN lists li ON c.list_id = li.id
    JOIN boards b ON li.board_id = b.id
    WHERE ci.assigned_user_id = ?
    ORDER BY ci.due_date IS NULL, ci.due_date ASC
  `).all(userId);

  return NextResponse.json({ cards, items });
}
