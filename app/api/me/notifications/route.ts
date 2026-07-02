import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import db from '@/lib/db';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = (session.user as any).id;

  const stored = db.prepare(`
    SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 100
  `).all(userId) as any[];

  // Due alerts computed on the fly: assigned cards/items due today, tomorrow, or overdue
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
  const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;

  const dueCards = db.prepare(`
    SELECT c.id as card_id, c.title, c.due_date, li.board_id
    FROM card_members cm JOIN cards c ON cm.card_id = c.id JOIN lists li ON c.list_id = li.id
    WHERE cm.user_id = ? AND c.due_date IS NOT NULL AND c.due_date <= ?
  `).all(userId, tomorrowStr) as any[];

  const dueItems = db.prepare(`
    SELECT ci.text, ci.due_date, c.id as card_id, c.title as card_title, li.board_id
    FROM checklist_items ci
    JOIN checklists cl ON ci.checklist_id = cl.id
    JOIN cards c ON cl.card_id = c.id
    JOIN lists li ON c.list_id = li.id
    WHERE ci.assigned_user_id = ? AND ci.is_checked = 0 AND ci.due_date IS NOT NULL AND ci.due_date <= ?
  `).all(userId, tomorrowStr) as any[];

  function dueLabel(d: string): string {
    if (d < todayStr) return 'está vencida';
    if (d === todayStr) return 'vence hoy';
    return 'vence mañana';
  }

  const dueAlerts = [
    ...dueCards.map(c => ({
      id: `due-card-${c.card_id}`,
      type: 'due',
      text: `La tarjeta "${c.title}" ${dueLabel(c.due_date)}`,
      board_id: c.board_id,
      card_id: c.card_id,
      is_read: 0,
      created_at: c.due_date,
    })),
    ...dueItems.map((i, idx) => ({
      id: `due-item-${i.card_id}-${idx}`,
      type: 'due',
      text: `El ítem "${i.text}" de "${i.card_title}" ${dueLabel(i.due_date)}`,
      board_id: i.board_id,
      card_id: i.card_id,
      is_read: 0,
      created_at: i.due_date,
    })),
  ];

  const unread = (db.prepare('SELECT COUNT(*) as n FROM notifications WHERE user_id = ? AND is_read = 0').get(userId) as any).n + dueAlerts.length;

  return NextResponse.json({ notifications: [...dueAlerts, ...stored], unread });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = (session.user as any).id;
  const body = await req.json().catch(() => ({}));

  if (body.id) {
    db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?').run(body.id, userId);
  } else {
    db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(userId);
  }
  return NextResponse.json({ ok: true });
}
