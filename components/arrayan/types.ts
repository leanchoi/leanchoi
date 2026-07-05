import type { Field, ViewConfig } from '@/lib/fields'

export type Rec = {
  id: string
  data: any
  position: number
  created_by: number | null
  created_at: string
  updated_at: string
}

export type ViewT = {
  id: string
  table_id: string
  name: string
  type: 'grid' | 'kanban' | 'calendar' | 'gallery' | 'gantt' | 'form'
  config: ViewConfig
  position: number
  created_by: number | null
  personal: number
}

export type UserLite = { id: number; username: string; name: string; avatar: string | null }

export type TableData = {
  table: { id: string; name: string; base_id: string }
  base: { id: string; name: string; icon: string; color: string; owner_id: string }
  myRole: 'owner' | 'editor' | 'commenter' | 'viewer'
  fields: Field[]
  records: Rec[]
  views: ViewT[]
  users: UserLite[]
  linkedNames: Record<string, string>
  linkedTables: Record<string, { id: string; name: string }>
  linkedOptions: Record<string, { id: string; name: string }[]>
  baseTables: { id: string; name: string }[]
}

export function cellValue(record: Rec, field: Field): any {
  if (field.type === 'createdtime') return record.created_at
  return record.data[field.id]
}

export const VIEW_TYPE_META: Record<string, { label: string; icon: string }> = {
  grid: { label: 'Grilla', icon: '▦' },
  kanban: { label: 'Kanban', icon: '▤' },
  calendar: { label: 'Calendario', icon: '📅' },
  gallery: { label: 'Galería', icon: '🖼' },
  gantt: { label: 'Gantt', icon: '📊' },
  form: { label: 'Formulario', icon: '📝' },
}
