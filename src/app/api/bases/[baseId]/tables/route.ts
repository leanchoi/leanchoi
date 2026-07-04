import db, { uid } from '@/lib/db'
import { requireUser, baseRole, canEdit } from '@/lib/access'
import { json, err, unauthorized, forbidden } from '@/lib/api'

export const dynamic = 'force-dynamic'

export async function POST(req: Request, { params }: { params: { baseId: string } }) {
  const user = await requireUser()
  if (!user) return unauthorized()
  const role = baseRole(user.id, params.baseId, user.role)
  if (!canEdit(role)) return forbidden()
  const body = await req.json()
  const name = String(body.name || '').trim()
  if (!name) return err('El nombre es obligatorio')
  const max = db
    .prepare('SELECT COALESCE(MAX(position), -1) AS m FROM tables WHERE base_id = ?')
    .get(params.baseId) as any
  const tableId = uid()
  const viewId = uid()
  const tx = db.transaction(() => {
    db.prepare('INSERT INTO tables (id, base_id, name, position) VALUES (?, ?, ?, ?)').run(
      tableId,
      params.baseId,
      name,
      max.m + 1
    )
    db.prepare(
      `INSERT INTO fields (id, table_id, name, type, options, position) VALUES (?, ?, 'Nombre', 'text', '{}', 0)`
    ).run(uid(), tableId)
    db.prepare(
      `INSERT INTO views (id, table_id, name, type, config, position, created_by) VALUES (?, ?, 'Vista principal', 'grid', '{}', 0, ?)`
    ).run(viewId, tableId, user.id)
  })
  tx()
  return json({ id: tableId, viewId })
}
