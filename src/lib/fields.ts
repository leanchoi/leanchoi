// Definición compartida de tipos de campo (server + client)

export type FieldType =
  | 'text'
  | 'longtext'
  | 'number'
  | 'currency'
  | 'percent'
  | 'rating'
  | 'checkbox'
  | 'select'
  | 'multiselect'
  | 'date'
  | 'url'
  | 'email'
  | 'phone'
  | 'attachment'
  | 'user'
  | 'link'
  | 'createdtime'

export type Choice = { id: string; name: string; color: string }

export type Field = {
  id: string
  table_id: string
  name: string
  type: FieldType
  options: any
  position: number
}

export const FIELD_TYPES: { type: FieldType; label: string; icon: string }[] = [
  { type: 'text', label: 'Texto corto', icon: 'A' },
  { type: 'longtext', label: 'Texto largo', icon: '¶' },
  { type: 'number', label: 'Número', icon: '#' },
  { type: 'currency', label: 'Moneda', icon: '$' },
  { type: 'percent', label: 'Porcentaje', icon: '%' },
  { type: 'rating', label: 'Valoración', icon: '★' },
  { type: 'checkbox', label: 'Casilla', icon: '✓' },
  { type: 'select', label: 'Selección única', icon: '▾' },
  { type: 'multiselect', label: 'Selección múltiple', icon: '≡' },
  { type: 'date', label: 'Fecha', icon: '📅' },
  { type: 'url', label: 'URL', icon: '🔗' },
  { type: 'email', label: 'Email', icon: '@' },
  { type: 'phone', label: 'Teléfono', icon: '☎' },
  { type: 'attachment', label: 'Adjuntos', icon: '📎' },
  { type: 'user', label: 'Colaborador', icon: '👤' },
  { type: 'link', label: 'Vínculo a registros', icon: '⇄' },
  { type: 'createdtime', label: 'Fecha de creación', icon: '🕓' },
]

export const CHOICE_COLORS = [
  'teal',
  'blue',
  'purple',
  'pink',
  'red',
  'orange',
  'yellow',
  'green',
  'gray',
]

// Clases tailwind por color de choice (se listan explícitas para el JIT)
export const CHOICE_COLOR_CLASSES: Record<string, string> = {
  teal: 'bg-teal-500/25 text-teal-200 border-teal-500/40',
  blue: 'bg-blue-500/25 text-blue-200 border-blue-500/40',
  purple: 'bg-purple-500/25 text-purple-200 border-purple-500/40',
  pink: 'bg-pink-500/25 text-pink-200 border-pink-500/40',
  red: 'bg-red-500/25 text-red-200 border-red-500/40',
  orange: 'bg-orange-500/25 text-orange-200 border-orange-500/40',
  yellow: 'bg-yellow-500/25 text-yellow-200 border-yellow-500/40',
  green: 'bg-green-500/25 text-green-200 border-green-500/40',
  gray: 'bg-slate-500/25 text-slate-200 border-slate-500/40',
}

export const ROW_COLOR_CLASSES: Record<string, { row: string; dot: string }> = {
  teal: { row: 'bg-teal-500/10 border-l-teal-400', dot: 'bg-teal-400' },
  blue: { row: 'bg-blue-500/10 border-l-blue-400', dot: 'bg-blue-400' },
  purple: { row: 'bg-purple-500/10 border-l-purple-400', dot: 'bg-purple-400' },
  pink: { row: 'bg-pink-500/10 border-l-pink-400', dot: 'bg-pink-400' },
  red: { row: 'bg-red-500/10 border-l-red-400', dot: 'bg-red-400' },
  orange: { row: 'bg-orange-500/10 border-l-orange-400', dot: 'bg-orange-400' },
  yellow: { row: 'bg-yellow-500/10 border-l-yellow-400', dot: 'bg-yellow-400' },
  green: { row: 'bg-green-500/10 border-l-green-400', dot: 'bg-green-400' },
  gray: { row: 'bg-slate-500/10 border-l-slate-400', dot: 'bg-slate-400' },
}

export type FilterOp =
  | 'contains'
  | 'not_contains'
  | 'eq'
  | 'neq'
  | 'empty'
  | 'not_empty'
  | 'gt'
  | 'lt'
  | 'gte'
  | 'lte'

export type Filter = { fieldId: string; op: FilterOp; value?: any }
export type Sort = { fieldId: string; dir: 'asc' | 'desc' }
export type ColorRule = { color: string; fieldId: string; op: FilterOp; value?: any }

export type ViewConfig = {
  filters?: Filter[]
  conjunction?: 'and' | 'or'
  sorts?: Sort[]
  groupBy?: string | null
  hidden?: string[]
  colorRules?: ColorRule[]
  rowHeight?: 'short' | 'medium' | 'tall'
  stackBy?: string | null // kanban
  dateField?: string | null // calendario
  coverField?: string | null // galería
  startField?: string | null // gantt
  endField?: string | null // gantt
  form?: {
    title?: string
    description?: string
    fields?: { fieldId: string; required?: boolean; help?: string }[]
    shareToken?: string
    enabled?: boolean
  }
}

export const OPS_BY_TYPE: Record<string, { op: FilterOp; label: string; needsValue: boolean }[]> = (() => {
  const base: { op: FilterOp; label: string; needsValue: boolean }[] = [
    { op: 'empty', label: 'está vacío', needsValue: false },
    { op: 'not_empty', label: 'no está vacío', needsValue: false },
  ]
  const textOps: { op: FilterOp; label: string; needsValue: boolean }[] = [
    { op: 'contains', label: 'contiene', needsValue: true },
    { op: 'not_contains', label: 'no contiene', needsValue: true },
    { op: 'eq', label: 'es igual a', needsValue: true },
    { op: 'neq', label: 'no es igual a', needsValue: true },
    ...base,
  ]
  const numOps: { op: FilterOp; label: string; needsValue: boolean }[] = [
    { op: 'eq', label: '=', needsValue: true },
    { op: 'neq', label: '≠', needsValue: true },
    { op: 'gt', label: '>', needsValue: true },
    { op: 'gte', label: '≥', needsValue: true },
    { op: 'lt', label: '<', needsValue: true },
    { op: 'lte', label: '≤', needsValue: true },
    ...base,
  ]
  const dateOps: { op: FilterOp; label: string; needsValue: boolean }[] = [
    { op: 'eq', label: 'es', needsValue: true },
    { op: 'gt', label: 'es después de', needsValue: true },
    { op: 'lt', label: 'es antes de', needsValue: true },
    ...base,
  ]
  const selOps: { op: FilterOp; label: string; needsValue: boolean }[] = [
    { op: 'eq', label: 'es', needsValue: true },
    { op: 'neq', label: 'no es', needsValue: true },
    ...base,
  ]
  return {
    text: textOps,
    longtext: textOps,
    url: textOps,
    email: textOps,
    phone: textOps,
    number: numOps,
    currency: numOps,
    percent: numOps,
    rating: numOps,
    checkbox: [
      { op: 'eq', label: 'está marcado', needsValue: false },
      { op: 'neq', label: 'no está marcado', needsValue: false },
    ],
    select: selOps,
    multiselect: [
      { op: 'contains', label: 'incluye', needsValue: true },
      { op: 'not_contains', label: 'no incluye', needsValue: true },
      ...base,
    ],
    user: [
      { op: 'contains', label: 'incluye', needsValue: true },
      { op: 'not_contains', label: 'no incluye', needsValue: true },
      ...base,
    ],
    date: dateOps,
    createdtime: dateOps,
    attachment: base,
    link: base,
  }
})()

// Valor "plano" de una celda para filtrar/ordenar/mostrar
export function cellToText(field: Field, value: any, ctx?: { users?: any[]; linked?: Record<string, string> }): string {
  if (value === null || value === undefined || value === '') return ''
  switch (field.type) {
    case 'checkbox':
      return value ? 'sí' : 'no'
    case 'multiselect':
      return Array.isArray(value) ? value.join(', ') : String(value)
    case 'user': {
      const ids: string[] = Array.isArray(value) ? value : [value]
      if (!ctx?.users) return ids.join(', ')
      return ids
        .map((id) => ctx.users!.find((u) => u.id === id)?.name || '¿?')
        .join(', ')
    }
    case 'link': {
      const ids: string[] = Array.isArray(value) ? value : [value]
      if (!ctx?.linked) return `${ids.length} registro(s)`
      return ids.map((id) => ctx.linked![id] || 'Registro').join(', ')
    }
    case 'attachment':
      return Array.isArray(value) ? value.map((a: any) => a.name).join(', ') : ''
    case 'currency': {
      const sym = field.options?.symbol || '$'
      return `${sym} ${Number(value).toLocaleString('es-AR')}`
    }
    case 'percent':
      return `${value}%`
    case 'date': {
      const s = String(value)
      if (field.options?.includeTime && s.includes('T')) {
        const d = new Date(s)
        return d.toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })
      }
      const [y, m, d] = s.slice(0, 10).split('-')
      if (!y || !m || !d) return s
      return `${d}/${m}/${y}`
    }
    default:
      return String(value)
  }
}

export function isEmptyValue(v: any): boolean {
  return (
    v === null ||
    v === undefined ||
    v === '' ||
    (Array.isArray(v) && v.length === 0) ||
    v === false
  )
}

export function matchesFilter(field: Field | undefined, raw: any, f: Filter): boolean {
  if (!field) return true
  let v = raw
  if (field.type === 'createdtime') v = raw // ya viene resuelto
  const empty = isEmptyValue(v)
  switch (f.op) {
    case 'empty':
      return empty
    case 'not_empty':
      return !empty
  }
  if (field.type === 'checkbox') {
    return f.op === 'eq' ? !!v : !v
  }
  const isNum = ['number', 'currency', 'percent', 'rating'].includes(field.type)
  if (isNum) {
    if (empty) return false
    const a = Number(v)
    const b = Number(f.value)
    if (isNaN(b)) return true
    switch (f.op) {
      case 'eq':
        return a === b
      case 'neq':
        return a !== b
      case 'gt':
        return a > b
      case 'gte':
        return a >= b
      case 'lt':
        return a < b
      case 'lte':
        return a <= b
      default:
        return true
    }
  }
  if (field.type === 'date' || field.type === 'createdtime') {
    if (empty) return false
    const a = String(v).slice(0, 10)
    const b = String(f.value || '').slice(0, 10)
    if (!b) return true
    switch (f.op) {
      case 'eq':
        return a === b
      case 'neq':
        return a !== b
      case 'gt':
        return a > b
      case 'lt':
        return a < b
      default:
        return true
    }
  }
  if (Array.isArray(v)) {
    const list = v.map((x) => String(x).toLowerCase())
    const needle = String(f.value ?? '').toLowerCase()
    switch (f.op) {
      case 'contains':
        return list.some((x) => x.includes(needle))
      case 'not_contains':
        return !list.some((x) => x.includes(needle))
      case 'eq':
        return list.join(',') === needle
      case 'neq':
        return list.join(',') !== needle
      default:
        return true
    }
  }
  const a = String(v ?? '').toLowerCase()
  const b = String(f.value ?? '').toLowerCase()
  switch (f.op) {
    case 'contains':
      return a.includes(b)
    case 'not_contains':
      return !a.includes(b)
    case 'eq':
      return a === b
    case 'neq':
      return a !== b
    default:
      return true
  }
}
