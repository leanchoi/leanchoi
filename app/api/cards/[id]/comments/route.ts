import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/access';
import { guardCard } from '@/lib/boardAccess';
import { readOnlyReason } from '@/lib/tenant';
import db, { notify, boardIdOfCard, UPLOADS_DIR } from '@/lib/db';
import path from 'path';
import fs from 'fs';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const g = guardCard(user, params.id, 'edit');
  if (!g.ok) return NextResponse.json({ error: 'Sin acceso a esta tarjeta' }, { status: g.status });
  const roMsg = readOnlyReason(user!.id);
  if (roMsg) return NextResponse.json({ error: roMsg }, { status: 403 });
  const userId = user!.id;
  const { text } = await req.json();
  if (!text?.trim()) return NextResponse.json({ error: 'Text required' }, { status: 400 });
  const result = db.prepare('INSERT INTO comments (card_id, user_id, text) VALUES (?, ?, ?)').run(params.id, userId, text.trim());
  const comment = db.prepare(`
    SELECT c.*, u.display_name as author_name FROM comments c JOIN users u ON c.user_id = u.id WHERE c.id = ?
  `).get(result.lastInsertRowid) as any;

  // Notifications: mentions + card members
  const card = db.prepare('SELECT title FROM cards WHERE id = ?').get(params.id) as any;
  const boardId = boardIdOfCard(params.id);
  const authorName = comment.author_name;
  const notified = new Set<number>([Number(userId)]);

  const mentioned = (text.match(/@([a-zA-Z0-9_.-]+)/g) || []).map((m: string) => m.slice(1));
  for (const uname of mentioned) {
    // Sólo se notifica a gente de la misma rama (igual que lib/notify.ts)
    const u = db
      .prepare('SELECT id FROM users WHERE username = ? COLLATE NOCASE AND tenant_id = ?')
      .get(uname, user!.tenantId) as any;
    if (u && !notified.has(u.id)) {
      notified.add(u.id);
      notify(u.id, 'mention', `${authorName} te mencionó en "${card?.title || 'una tarjeta'}"`, boardId, Number(params.id));
    }
  }

  const members = db.prepare('SELECT user_id FROM card_members WHERE card_id = ?').all(params.id) as any[];
  for (const m of members) {
    if (!notified.has(m.user_id)) {
      notified.add(m.user_id);
      notify(m.user_id, 'comment', `${authorName} comentó en "${card?.title || 'una tarjeta'}"`, boardId, Number(params.id));
    }
  }

  return NextResponse.json(comment, { status: 201 });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const g = guardCard(user, params.id, 'edit');
  if (!g.ok) return NextResponse.json({ error: 'Sin acceso a esta tarjeta' }, { status: g.status });
  const roMsg = readOnlyReason(user!.id);
  if (roMsg) return NextResponse.json({ error: roMsg }, { status: 403 });
  const { commentId } = await req.json();
  // El comentario tiene que ser de ESTA tarjeta: si no, con un id ajeno se
  // borraría el comentario de otro tablero.
  const comment = db.prepare('SELECT * FROM comments WHERE id = ? AND card_id = ?').get(commentId, params.id) as any;
  if (!comment) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  // Lo borra su autor, o un admin del tablero
  if (g.role !== 'admin' && comment.user_id !== user!.id)
    return NextResponse.json({ error: 'Solo podés borrar tus propios comentarios' }, { status: 403 });
  // Remove files attached to this comment
  const atts = db.prepare('SELECT * FROM attachments WHERE comment_id = ?').all(commentId) as any[];
  for (const att of atts) {
    try { fs.unlinkSync(path.join(UPLOADS_DIR, att.stored_name)); } catch {}
    db.prepare('DELETE FROM attachments WHERE id = ?').run(att.id);
  }
  db.prepare('DELETE FROM comments WHERE id = ?').run(commentId);
  return NextResponse.json({ ok: true });
}
