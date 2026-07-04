import db, { uid } from '@/lib/db'
import { requireUser, baseRole, canView, canEdit, baseIdOfTable } from '@/lib/access'
import { json, err, unauthorized, forbidden, notFound } from '@/lib/api'

export const dynamic = 'force-dynamic'

export async function POST(req: Request, { params }: { params: { tableId: string } }) {
  const user = await requireUser()
  if (!user) return unauthorized()
  const baseId = baseIdOfTable(params.tableId)
  if (!baseId) return notFound()
  const role = baseRole(user.id, baseId, user.role)
  if (!canView(role)) return forbidden()
  const body = await req.json()
  const personal = body.personal ? 1 : 0
  // Las vistas compartidas requieren permiso de edición; las personales no
  if (!personal && !canEdit(role)) return forbidden()
  const name = String(body.name || '').trim()
  if (!name) return err('El nombre es obligatorio')
  const type = ['grid', 'kanban', 'calendar', 'gallery', 'form'].includes(body.type)
    ? body.type
    : 'grid'
  const config: any = {}
  if (type === 'form') {
    config.form = { title: name, description: '', fields: [], shareToken: uid() + uid(), enabled: true }
  }
  const max = db
    .prepare('SELECT COALESCE(MAX(position), -1) AS m FROM views WHERE table_id = ?')
    .get(params.tableId) as any
  const id = uid()
  db.prepare(
    'INSERT INTO views (id, table_id, name, type, config, position, created_by, personal) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(id, params.tableId, name, type, JSON.stringify(config), max.m + 1, user.id, personal)
  return json({ id })
}
