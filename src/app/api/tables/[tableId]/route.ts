import db from '@/lib/db'
import { requireUser, baseRole, canEdit, baseIdOfTable } from '@/lib/access'
import { json, err, unauthorized, forbidden, notFound } from '@/lib/api'

export const dynamic = 'force-dynamic'

export async function PATCH(req: Request, { params }: { params: { tableId: string } }) {
  const user = await requireUser()
  if (!user) return unauthorized()
  const baseId = baseIdOfTable(params.tableId)
  if (!baseId) return notFound()
  const role = baseRole(user.id, baseId, user.role)
  if (!canEdit(role)) return forbidden()
  const body = await req.json()
  const name = String(body.name || '').trim()
  if (!name) return err('El nombre es obligatorio')
  db.prepare('UPDATE tables SET name = ? WHERE id = ?').run(name, params.tableId)
  return json({ ok: true })
}

export async function DELETE(_req: Request, { params }: { params: { tableId: string } }) {
  const user = await requireUser()
  if (!user) return unauthorized()
  const baseId = baseIdOfTable(params.tableId)
  if (!baseId) return notFound()
  const role = baseRole(user.id, baseId, user.role)
  if (!canEdit(role)) return forbidden()
  const count = db
    .prepare('SELECT COUNT(*) AS c FROM tables WHERE base_id = ?')
    .get(baseId) as any
  if (count.c <= 1) return err('No podés borrar la única tabla de la base')
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM fields WHERE table_id = ?').run(params.tableId)
    db.prepare('DELETE FROM views WHERE table_id = ?').run(params.tableId)
    db.prepare('DELETE FROM comments WHERE table_id = ?').run(params.tableId)
    db.prepare('DELETE FROM records WHERE table_id = ?').run(params.tableId)
    db.prepare('DELETE FROM tables WHERE id = ?').run(params.tableId)
  })
  tx()
  return json({ ok: true })
}
