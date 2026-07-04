import db from '@/lib/db'
import { requireUser, accessibleBases } from '@/lib/access'
import { json, unauthorized } from '@/lib/api'

export const dynamic = 'force-dynamic'

// Agenda personal: registros con fecha, en bases accesibles, que me asignaron
// (campo tipo "user") o que creé yo.
export async function GET(req: Request) {
  const user = await requireUser()
  if (!user) return unauthorized()
  const url = new URL(req.url)
  const month = url.searchParams.get('month') || new Date().toISOString().slice(0, 7)

  const items: any[] = []
  for (const base of accessibleBases(user)) {
    const tables = db
      .prepare('SELECT * FROM tables WHERE base_id = ?')
      .all(base.id) as any[]
    for (const t of tables) {
      const fields = (
        db.prepare('SELECT * FROM fields WHERE table_id = ? ORDER BY position').all(t.id) as any[]
      ).map((f) => ({ ...f, options: JSON.parse(f.options || '{}') }))
      const dateFields = fields.filter((f) => f.type === 'date')
      if (dateFields.length === 0) continue
      const userFields = fields.filter((f) => f.type === 'user')
      const primary = fields[0]
      const view = db
        .prepare('SELECT id FROM views WHERE table_id = ? ORDER BY position LIMIT 1')
        .get(t.id) as any
      const records = db
        .prepare('SELECT * FROM records WHERE table_id = ?')
        .all(t.id) as any[]
      for (const r of records) {
        const data = JSON.parse(r.data || '{}')
        const assignedToMe = userFields.some(
          (f) => Array.isArray(data[f.id]) && data[f.id].includes(user.id)
        )
        const mine = r.created_by === user.id
        if (!assignedToMe && !mine) continue
        for (const df of dateFields) {
          const v = data[df.id]
          if (!v) continue
          const day = String(v).slice(0, 10)
          if (!day.startsWith(month)) continue
          items.push({
            recordId: r.id,
            date: day,
            title: String(data[primary?.id] ?? '') || 'Sin nombre',
            tableName: t.name,
            baseName: base.name,
            baseIcon: base.icon,
            fieldName: df.name,
            assigned: assignedToMe,
            link: view ? `/base/${base.id}/table/${t.id}/view/${view.id}?record=${r.id}` : `/record/${r.id}`,
          })
        }
      }
    }
  }
  items.sort((a, b) => a.date.localeCompare(b.date))
  return json({ items, month })
}
