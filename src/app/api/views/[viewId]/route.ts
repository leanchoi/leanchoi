import db from '@/lib/db'
import { requireUser, baseRole, canEdit, canView, baseIdOfTable } from '@/lib/access'
import { json, err, unauthorized, forbidden, notFound } from '@/lib/api'

export const dynamic = 'force-dynamic'

function viewBase(viewId: string) {
  const v = db.prepare('SELECT * FROM views WHERE id = ?').get(viewId) as any
  if (!v) return null
  const baseId = baseIdOfTable(v.table_id)
  if (!baseId) return null
  return { view: v, baseId }
}

export async function PATCH(req: Request, { params }: { params: { viewId: string } }) {
  const user = await requireUser()
  if (!user) return unauthorized()
  const vb = viewBase(params.viewId)
  if (!vb) return notFound()
  const role = baseRole(user.id, vb.baseId, user.role)
  // vistas personales: las edita su creador; compartidas: quien pueda editar la base
  const isMine = vb.view.personal === 1 && vb.view.created_by === user.id
  const allowed = isMine || (vb.view.personal === 0 && canEdit(role))
  if (!canView(role) || !allowed) return forbidden()
  const body = await req.json()
  const name = body.name !== undefined ? String(body.name).trim() : vb.view.name
  if (!name) return err('El nombre es obligatorio')
  const config =
    body.config !== undefined ? JSON.stringify(body.config) : vb.view.config
  db.prepare('UPDATE views SET name = ?, config = ? WHERE id = ?').run(
    name,
    config,
    params.viewId
  )
  return json({ ok: true })
}

export async function DELETE(_req: Request, { params }: { params: { viewId: string } }) {
  const user = await requireUser()
  if (!user) return unauthorized()
  const vb = viewBase(params.viewId)
  if (!vb) return notFound()
  const role = baseRole(user.id, vb.baseId, user.role)
  const isMine = vb.view.personal && vb.view.created_by === user.id
  if (!isMine && !canEdit(role)) return forbidden()
  const count = db
    .prepare('SELECT COUNT(*) AS c FROM views WHERE table_id = ? AND personal = 0')
    .get(vb.view.table_id) as any
  if (!vb.view.personal && count.c <= 1) return err('No podés borrar la única vista compartida')
  db.prepare('DELETE FROM views WHERE id = ?').run(params.viewId)
  return json({ ok: true })
}
