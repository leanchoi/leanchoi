import db, { uid, now } from '@/lib/db'
import { notify } from '@/lib/notify'
import { json, err, notFound } from '@/lib/api'

export const dynamic = 'force-dynamic'

// Formularios públicos: no requieren sesión
function findForm(token: string) {
  const views = db.prepare(`SELECT * FROM views WHERE type = 'form'`).all() as any[]
  for (const v of views) {
    const config = JSON.parse(v.config || '{}')
    if (config.form?.shareToken === token && config.form?.enabled) {
      return { view: v, config }
    }
  }
  return null
}

// Tipos de campo que un formulario público puede pedir
const PUBLIC_TYPES = [
  'text',
  'longtext',
  'number',
  'currency',
  'percent',
  'rating',
  'checkbox',
  'select',
  'multiselect',
  'date',
  'url',
  'email',
  'phone',
]

export async function GET(_req: Request, { params }: { params: { token: string } }) {
  const found = findForm(params.token)
  if (!found) return notFound()
  const allFields = (
    db
      .prepare('SELECT * FROM fields WHERE table_id = ? ORDER BY position')
      .all(found.view.table_id) as any[]
  ).map((f) => ({ ...f, options: JSON.parse(f.options || '{}') }))
  const included = (found.config.form.fields || [])
    .map((ff: any) => {
      const f = allFields.find((x) => x.id === ff.fieldId)
      if (!f || !PUBLIC_TYPES.includes(f.type)) return null
      return { ...f, required: !!ff.required, help: ff.help || '' }
    })
    .filter(Boolean)
  return json({
    title: found.config.form.title || found.view.name,
    description: found.config.form.description || '',
    fields: included,
  })
}

export async function POST(req: Request, { params }: { params: { token: string } }) {
  const found = findForm(params.token)
  if (!found) return notFound()
  const body = await req.json().catch(() => ({}))
  const submitted = body.data || {}
  const allFields = (
    db
      .prepare('SELECT * FROM fields WHERE table_id = ?')
      .all(found.view.table_id) as any[]
  ).map((f) => ({ ...f, options: JSON.parse(f.options || '{}') }))
  const allowed = new Set(
    (found.config.form.fields || []).map((ff: any) => ff.fieldId as string)
  )
  const data: any = {}
  for (const [k, v] of Object.entries(submitted)) {
    const f = allFields.find((x) => x.id === k)
    if (f && allowed.has(k) && PUBLIC_TYPES.includes(f.type)) data[k] = v
  }
  for (const ff of found.config.form.fields || []) {
    if (ff.required) {
      const v = data[ff.fieldId]
      if (v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0))
        return err('Faltan campos obligatorios')
    }
  }
  const max = db
    .prepare('SELECT COALESCE(MAX(position), -1) AS m FROM records WHERE table_id = ?')
    .get(found.view.table_id) as any
  const id = uid()
  db.prepare(
    'INSERT INTO records (id, table_id, data, position, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, NULL, ?, ?)'
  ).run(id, found.view.table_id, JSON.stringify(data), max.m + 1, now(), now())

  const t = db
    .prepare('SELECT t.name, b.owner_id, b.name AS base_name FROM tables t JOIN bases b ON b.id = t.base_id WHERE t.id = ?')
    .get(found.view.table_id) as any
  if (t?.owner_id) {
    notify({
      userId: t.owner_id,
      type: 'form',
      body: `Nueva respuesta del formulario "${found.config.form.title || found.view.name}" en "${t.base_name}"`,
      link: `/record/${id}`,
    })
  }
  return json({ ok: true })
}
