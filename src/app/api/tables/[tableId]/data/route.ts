import db from '@/lib/db'
import { requireUser, baseRole, canView, baseIdOfTable } from '@/lib/access'
import { json, unauthorized, forbidden, notFound } from '@/lib/api'

export const dynamic = 'force-dynamic'

// Devuelve todo lo que la UI de una tabla necesita en un solo fetch
export async function GET(_req: Request, { params }: { params: { tableId: string } }) {
  const user = await requireUser()
  if (!user) {
    console.log(`[tabla ${params.tableId}] 401: pedido sin sesión válida`)
    return unauthorized()
  }
  const baseId = baseIdOfTable(params.tableId)
  if (!baseId) {
    console.log(`[tabla ${params.tableId}] 404: la tabla no existe (usuario ${user.username})`)
    return notFound()
  }
  const role = baseRole(user.id, baseId, user.role)
  if (!canView(role)) {
    console.log(
      `[tabla ${params.tableId}] 403: usuario ${user.username} (id ${user.id}, rol ${user.role}) sin acceso a la base ${baseId}`
    )
    return forbidden()
  }

  const table = db.prepare('SELECT * FROM tables WHERE id = ?').get(params.tableId) as any
  const base = db.prepare('SELECT * FROM bases WHERE id = ?').get(baseId) as any
  const fields = (
    db.prepare('SELECT * FROM fields WHERE table_id = ? ORDER BY position').all(params.tableId) as any[]
  ).map((f) => ({ ...f, options: JSON.parse(f.options || '{}') }))
  const records = (
    db
      .prepare('SELECT * FROM records WHERE table_id = ? ORDER BY position, created_at')
      .all(params.tableId) as any[]
  ).map((r) => ({ ...r, data: JSON.parse(r.data || '{}') }))
  const views = (
    db.prepare('SELECT * FROM views WHERE table_id = ? ORDER BY position').all(params.tableId) as any[]
  )
    .filter((v) => !v.personal || v.created_by === user.id)
    .map((v) => ({ ...v, config: JSON.parse(v.config || '{}') }))

  const users = db.prepare('SELECT id, username, name, avatar FROM users ORDER BY name').all()

  // Registros vinculables por campo link (nombre = campo primario de la tabla destino)
  const linkedNames: Record<string, string> = {}
  const linkedTables: Record<string, { id: string; name: string }> = {}
  const linkedOptions: Record<string, { id: string; name: string }[]> = {}
  for (const f of fields) {
    if (f.type !== 'link' || !f.options?.tableId) continue
    const lt = db.prepare('SELECT id, name FROM tables WHERE id = ?').get(f.options.tableId) as any
    if (!lt) continue
    linkedTables[f.id] = lt
    const firstField = db
      .prepare('SELECT id FROM fields WHERE table_id = ? ORDER BY position LIMIT 1')
      .get(lt.id) as any
    const lrecs = db
      .prepare('SELECT id, data FROM records WHERE table_id = ? ORDER BY position, created_at')
      .all(lt.id) as any[]
    linkedOptions[f.id] = []
    for (const lr of lrecs) {
      const data = JSON.parse(lr.data || '{}')
      const name = firstField ? String(data[firstField.id] ?? '') || 'Sin nombre' : 'Registro'
      linkedNames[lr.id] = name
      linkedOptions[f.id].push({ id: lr.id, name })
    }
  }

  // Otras tablas de la base (para crear campos de vínculo)
  const baseTables = db
    .prepare('SELECT id, name FROM tables WHERE base_id = ? ORDER BY position')
    .all(baseId)

  return json({
    table,
    base,
    myRole: role,
    fields,
    records,
    views,
    users,
    linkedNames,
    linkedTables,
    linkedOptions,
    baseTables,
  })
}
