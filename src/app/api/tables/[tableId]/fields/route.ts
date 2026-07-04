import db, { uid } from '@/lib/db'
import { requireUser, baseRole, canEdit, baseIdOfTable } from '@/lib/access'
import { json, err, unauthorized, forbidden, notFound } from '@/lib/api'

export const dynamic = 'force-dynamic'

export async function POST(req: Request, { params }: { params: { tableId: string } }) {
  const user = await requireUser()
  if (!user) return unauthorized()
  const baseId = baseIdOfTable(params.tableId)
  if (!baseId) return notFound()
  const role = baseRole(user.id, baseId, user.role)
  if (!canEdit(role)) return forbidden()
  const body = await req.json()
  const name = String(body.name || '').trim()
  if (!name) return err('El nombre es obligatorio')
  const max = db
    .prepare('SELECT COALESCE(MAX(position), -1) AS m FROM fields WHERE table_id = ?')
    .get(params.tableId) as any
  const id = uid()
  db.prepare(
    'INSERT INTO fields (id, table_id, name, type, options, position) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(id, params.tableId, name, body.type || 'text', JSON.stringify(body.options || {}), max.m + 1)
  return json({ id })
}
