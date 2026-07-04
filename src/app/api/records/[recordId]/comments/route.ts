import db, { uid } from '@/lib/db'
import { requireUser, baseRole, canComment, canView, baseIdOfRecord } from '@/lib/access'
import { notifyMentions, notify } from '@/lib/notify'
import { json, err, unauthorized, forbidden, notFound } from '@/lib/api'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: { recordId: string } }) {
  const user = await requireUser()
  if (!user) return unauthorized()
  const loc = baseIdOfRecord(params.recordId)
  if (!loc) return notFound()
  const role = baseRole(user.id, loc.baseId, user.role)
  if (!canView(role)) return forbidden()
  const comments = db
    .prepare(
      `SELECT c.*, u.name AS user_name, u.avatar AS user_avatar
       FROM comments c JOIN users u ON u.id = c.user_id
       WHERE c.record_id = ? ORDER BY c.created_at`
    )
    .all(params.recordId)
  return json({ comments })
}

export async function POST(req: Request, { params }: { params: { recordId: string } }) {
  const user = await requireUser()
  if (!user) return unauthorized()
  const loc = baseIdOfRecord(params.recordId)
  if (!loc) return notFound()
  const role = baseRole(user.id, loc.baseId, user.role)
  if (!canComment(role)) return forbidden()
  const body = await req.json()
  const text = String(body.body || '').trim()
  if (!text) return err('El comentario no puede estar vacío')
  const id = uid()
  db.prepare(
    'INSERT INTO comments (id, record_id, table_id, user_id, body) VALUES (?, ?, ?, ?, ?)'
  ).run(id, params.recordId, loc.tableId, user.id, text)

  const table = db.prepare('SELECT name FROM tables WHERE id = ?').get(loc.tableId) as any
  notifyMentions({
    text,
    actorId: user.id,
    actorName: user.name,
    context: `un comentario en "${table?.name || 'una tabla'}"`,
    link: `/record/${params.recordId}`,
  })
  // Notificar al creador del registro
  const rec = db.prepare('SELECT created_by FROM records WHERE id = ?').get(params.recordId) as any
  if (rec?.created_by) {
    notify({
      userId: rec.created_by,
      actorId: user.id,
      type: 'comment',
      body: `${user.name} comentó en un registro tuyo de "${table?.name || 'una tabla'}"`,
      link: `/record/${params.recordId}`,
    })
  }
  return json({ id })
}
