'use client'

import { useState } from 'react'
import { Field, ViewConfig, CHOICE_COLOR_CLASSES } from '@/lib/fields'
import { Rec, cellValue } from './types'
import { rowColor } from './applyView'
import { CellCtx, CellValue } from './cells'
import { ROW_COLOR_CLASSES } from '@/lib/fields'

export default function KanbanView({
  rows,
  fields,
  config,
  ctx,
  canEdit,
  onPatchCell,
  onOpenRecord,
  onAddRecord,
  onConfigChange,
}: {
  rows: Rec[]
  fields: Field[]
  config: ViewConfig
  ctx: CellCtx
  canEdit: boolean
  onPatchCell: (recordId: string, fieldId: string, value: any) => void
  onOpenRecord: (id: string) => void
  onAddRecord: (initial?: any) => void
  onConfigChange: (c: ViewConfig) => void
}) {
  const selectFields = fields.filter((f) => f.type === 'select')
  const stackField = selectFields.find((f) => f.id === config.stackBy) || selectFields[0]
  const [dragId, setDragId] = useState<string | null>(null)
  const visibleFields = fields
    .filter((f, i) => i === 0 || !(config.hidden || []).includes(f.id))
    .slice(0, 4)

  if (!stackField) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-center text-slate-400">
        <div>
          <p className="mb-2 text-3xl">▤</p>
          <p>Para usar Kanban, la tabla necesita un campo de tipo “Selección única”.</p>
        </div>
      </div>
    )
  }

  const choices: any[] = stackField.options?.choices || []
  const columns = [
    ...choices.map((c) => ({ key: c.name, label: c.name, color: c.color })),
    { key: '', label: 'Sin categoría', color: 'gray' },
  ]

  function cardsFor(key: string) {
    return rows.filter((r) => String(cellValue(r, stackField!) ?? '') === key)
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {selectFields.length > 1 && (
        <div className="flex items-center gap-2 border-b border-slate-800 px-4 py-2 text-sm">
          <span className="text-slate-400">Apilar por</span>
          <select
            className="input w-auto py-1"
            value={stackField.id}
            onChange={(e) => onConfigChange({ ...config, stackBy: e.target.value })}
          >
            {selectFields.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="flex flex-1 gap-3 overflow-x-auto p-4">
        {columns.map((col) => {
          const cards = cardsFor(col.key)
          return (
            <div
              key={col.key || '__empty'}
              className="flex w-72 shrink-0 flex-col rounded-xl border border-slate-800 bg-slate-900/50"
              onDragOver={(e) => canEdit && e.preventDefault()}
              onDrop={() => {
                if (canEdit && dragId) {
                  onPatchCell(dragId, stackField!.id, col.key || null)
                  setDragId(null)
                }
              }}
            >
              <div className="flex items-center gap-2 px-3 py-2.5">
                <span
                  className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                    CHOICE_COLOR_CLASSES[col.color] || CHOICE_COLOR_CLASSES.gray
                  }`}
                >
                  {col.label}
                </span>
                <span className="text-xs text-slate-500">{cards.length}</span>
              </div>
              <div className="flex-1 space-y-2 overflow-y-auto px-2 pb-2">
                {cards.map((r) => {
                  const color = rowColor(r, fields, config)
                  const colorCls = color ? ROW_COLOR_CLASSES[color]?.row : ''
                  return (
                    <button
                      key={r.id}
                      draggable={canEdit}
                      onDragStart={() => setDragId(r.id)}
                      onClick={() => onOpenRecord(r.id)}
                      className={`w-full rounded-lg border border-slate-700/70 bg-slate-900 p-3 text-left shadow-sm transition-colors hover:border-teal-600/60 border-l-2 ${
                        colorCls || 'border-l-slate-700/70'
                      }`}
                    >
                      {visibleFields.map((f, i) => {
                        const v = cellValue(r, f)
                        if (i > 0 && (v === null || v === undefined || v === '')) return null
                        if (f.id === stackField!.id) return null
                        return (
                          <div key={f.id} className={i === 0 ? 'mb-1.5 text-sm font-medium' : 'mb-1 text-xs text-slate-300'}>
                            <CellValue field={f} value={v} ctx={ctx} />
                            {i === 0 && !v && <span className="text-slate-500">Sin nombre</span>}
                          </div>
                        )
                      })}
                    </button>
                  )
                })}
                {canEdit && (
                  <button
                    className="w-full rounded-lg border border-dashed border-slate-700 px-3 py-2 text-left text-xs text-slate-400 hover:bg-slate-800"
                    onClick={() => onAddRecord(col.key ? { [stackField!.id]: col.key } : {})}
                  >
                    + Agregar
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
