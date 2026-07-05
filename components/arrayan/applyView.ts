import { Field, ViewConfig, matchesFilter, cellToText } from '@/lib/fields'
import { Rec, cellValue, UserLite } from './types'

// Aplica filtros y orden de la vista sobre los registros (client-side)
export function applyView(
  records: Rec[],
  fields: Field[],
  config: ViewConfig,
  ctx: { users: UserLite[]; linked: Record<string, string> }
): Rec[] {
  let rows = records

  const filters = config.filters || []
  if (filters.length > 0) {
    const conj = config.conjunction || 'and'
    rows = rows.filter((r) => {
      const results = filters.map((f) => {
        const field = fields.find((x) => x.id === f.fieldId)
        return matchesFilter(field, field ? cellValue(r, field) : undefined, f)
      })
      return conj === 'and' ? results.every(Boolean) : results.some(Boolean)
    })
  }

  const sorts = config.sorts || []
  if (sorts.length > 0) {
    rows = [...rows].sort((a, b) => {
      for (const s of sorts) {
        const field = fields.find((x) => x.id === s.fieldId)
        if (!field) continue
        const cmp = compare(field, cellValue(a, field), cellValue(b, field), ctx)
        if (cmp !== 0) return s.dir === 'desc' ? -cmp : cmp
      }
      return a.position - b.position
    })
  }
  return rows
}

function compare(field: Field, a: any, b: any, ctx: { users: UserLite[]; linked: Record<string, string> }): number {
  const aEmpty = a === null || a === undefined || a === '' || (Array.isArray(a) && !a.length)
  const bEmpty = b === null || b === undefined || b === '' || (Array.isArray(b) && !b.length)
  if (aEmpty && bEmpty) return 0
  if (aEmpty) return 1
  if (bEmpty) return -1
  if (['number', 'currency', 'percent', 'rating'].includes(field.type)) {
    return Number(a) - Number(b)
  }
  if (field.type === 'checkbox') {
    return (a ? 1 : 0) - (b ? 1 : 0)
  }
  if (field.type === 'date' || field.type === 'createdtime') {
    return String(a).localeCompare(String(b))
  }
  if (field.type === 'select') {
    // ordenar por posición de la opción, como Airtable
    const choices: any[] = field.options?.choices || []
    const ia = choices.findIndex((c) => c.name === a)
    const ib = choices.findIndex((c) => c.name === b)
    if (ia !== -1 && ib !== -1) return ia - ib
  }
  const ta = cellToText(field, a, { users: ctx.users, linked: ctx.linked })
  const tb = cellToText(field, b, { users: ctx.users, linked: ctx.linked })
  return ta.localeCompare(tb, 'es')
}

// Color de fila según las reglas de la vista (primera que matchea)
export function rowColor(record: Rec, fields: Field[], config: ViewConfig): string | null {
  for (const rule of config.colorRules || []) {
    const field = fields.find((x) => x.id === rule.fieldId)
    if (!field) continue
    if (matchesFilter(field, cellValue(record, field), rule)) return rule.color
  }
  return null
}
