import db from '@/lib/db'
import { requireUser, baseRole, canEdit, baseIdOfTable } from '@/lib/access'
import { json, err, unauthorized, forbidden, notFound } from '@/lib/api'

export const dynamic = 'force-dynamic'

function fieldBase(fieldId: string) {
  const f = db.prepare('SELECT * FROM fields WHERE id = ?').get(fieldId) as any
  if (!f) return null
  const baseId = baseIdOfTable(f.table_id)
  if (!baseId) return null
  return { field: f, baseId }
}

export async function PATCH(req: Request, { params }: { params: { fieldId: string } }) {
  const user = await requireUser()
  if (!user) return unauthorized()
  const fb = fieldBase(params.fieldId)
  if (!fb) return notFound()
  const role = baseRole(user.id, fb.baseId, user.role)
  if (!canEdit(role)) return forbidden()
  const body = await req.json()
  const name = body.name !== undefined ? String(body.name).trim() : fb.field.name
  if (!name) return err('El nombre es obligatorio')
  const type = body.type ?? fb.field.type
  const options =
    body.options !== undefined ? JSON.stringify(body.options) : fb.field.options
  const position = body.position !== undefined ? body.position : fb.field.position
  db.prepare('UPDATE fields SET name = ?, type = ?, options = ?, position = ? WHERE id = ?').run(
    name,
    type,
    options,
    position,
    params.fieldId
  )
  return json({ ok: true })
}

export async function DELETE(_req: Request, { params }: { params: { fieldId: string } }) {
  const user = await requireUser()
  if (!user) return unauthorized()
  const fb = fieldBase(params.fieldId)
  if (!fb) return notFound()
  const role = baseRole(user.id, fb.baseId, user.role)
  if (!canEdit(role)) return forbidden()
  const count = db
    .prepare('SELECT COUNT(*) AS c FROM fields WHERE table_id = ?')
    .get(fb.field.table_id) as any
  if (count.c <= 1) return err('No podés borrar el único campo de la tabla')
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM fields WHERE id = ?').run(params.fieldId)
    // limpiar el dato de todos los registros de la tabla
    const records = db
      .prepare('SELECT id, data FROM records WHERE table_id = ?')
      .all(fb.field.table_id) as any[]
    const upd = db.prepare('UPDATE records SET data = ? WHERE id = ?')
    for (const r of records) {
      const data = JSON.parse(r.data || '{}')
      if (params.fieldId in data) {
        delete data[params.fieldId]
        upd.run(JSON.stringify(data), r.id)
      }
    }
  })
  tx()
  return json({ ok: true })
}
