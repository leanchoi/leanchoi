import db, { uid } from '@/lib/db'
import { requireUser, baseRole, isOwner } from '@/lib/access'
import { notify } from '@/lib/notify'
import { json, err, unauthorized, forbidden } from '@/lib/api'

export const dynamic = 'force-dynamic'

export async function POST(req: Request, { params }: { params: { baseId: string } }) {
  const user = await requireUser()
  if (!user) return unauthorized()
  const role = baseRole(user.id, params.baseId, user.role)
  if (!isOwner(role)) return forbidden()
  const body = await req.json()
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(body.userId) as any
  if (!target) return err('Usuario no encontrado')
  const base = db.prepare('SELECT * FROM bases WHERE id = ?').get(params.baseId) as any
  if (target.id === base.owner_id) return err('Ese usuario ya es el dueño de la base')
  const collabRole = ['editor', 'commenter', 'viewer'].includes(body.role) ? body.role : 'editor'
  db.prepare(
    `INSERT INTO collaborators (id, base_id, user_id, role) VALUES (?, ?, ?, ?)
     ON CONFLICT(base_id, user_id) DO UPDATE SET role = excluded.role`
  ).run(uid(), params.baseId, target.id, collabRole)
  notify({
    userId: target.id,
    actorId: user.id,
    type: 'share',
    body: `${user.name} te compartió la base "${base.name}"`,
    link: `/base/${params.baseId}`,
  })
  return json({ ok: true })
}

export async function DELETE(req: Request, { params }: { params: { baseId: string } }) {
  const user = await requireUser()
  if (!user) return unauthorized()
  const role = baseRole(user.id, params.baseId, user.role)
  if (!isOwner(role)) return forbidden()
  const { userId } = await req.json()
  db.prepare('DELETE FROM collaborators WHERE base_id = ? AND user_id = ?').run(
    params.baseId,
    userId
  )
  return json({ ok: true })
}
