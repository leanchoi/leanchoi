import db from '@/lib/db'
import { requireUser } from '@/lib/access'
import { json, unauthorized } from '@/lib/api'

export const dynamic = 'force-dynamic'

export async function GET() {
  const user = await requireUser()
  if (!user) return unauthorized()
  const notifications = db
    .prepare(
      `SELECT n.*, u.name AS actor_name, u.avatar AS actor_avatar
       FROM notifications n LEFT JOIN users u ON u.id = n.actor_id
       WHERE n.user_id = ? ORDER BY n.created_at DESC LIMIT 50`
    )
    .all(user.id)
  const unread = db
    .prepare('SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND read = 0')
    .get(user.id) as any
  return json({ notifications, unread: unread.c })
}

export async function PATCH(req: Request) {
  const user = await requireUser()
  if (!user) return unauthorized()
  const body = await req.json().catch(() => ({}))
  if (body.id) {
    db.prepare('UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?').run(
      body.id,
      user.id
    )
  } else {
    db.prepare('UPDATE notifications SET read = 1 WHERE user_id = ?').run(user.id)
  }
  return json({ ok: true })
}
