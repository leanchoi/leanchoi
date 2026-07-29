'use client'

import { useMemo, useState } from 'react'
import { Field, ViewConfig, cellToText, ROW_COLOR_CLASSES, FIELD_TYPES } from '@/lib/fields'
import { Rec, cellValue } from './types'
import { rowColor } from './applyView'
import { CellCtx, CellValue, FieldInput } from './cells'
import Popover from './Popover'
import FieldEditor from './FieldEditor'
import { useToast } from '../Toast'

const ROW_H: Record<string, string> = {
  short: 'h-11',
  medium: 'h-16',
  tall: 'h-28',
}

export default function GridView({
  rows,
  fields,
  config,
  ctx,
  canEdit,
  tableId,
  baseTables,
  onPatchCell,
  onAddRecord,
  onReorderRecords,
  onOpenRecord,
  onDeleteRecord,
  onSchemaChange,
}: {
  rows: Rec[]
  fields: Field[]
  config: ViewConfig
  ctx: CellCtx
  canEdit: boolean
  tableId: string
  baseTables: { id: string; name: string }[]
  onPatchCell: (recordId: string, fieldId: string, value: any) => void
  onAddRecord: (initial?: any, position?: number) => void
  onReorderRecords: (draggedId: string, targetId: string) => void
  onOpenRecord: (id: string) => void
  onDeleteRecord: (id: string) => void
  onSchemaChange: () => void
}) {
  const toast = useToast()
  const visibleFields = fields.filter((f, i) => i === 0 || !(config.hidden || []).includes(f.id))
  const [editing, setEditing] = useState<{ recordId: string; fieldId: string } | null>(null)
  const [editValue, setEditValue] = useState<any>(null)
  const [fieldMenu, setFieldMenu] = useState<string | null>(null)
  const [addFieldOpen, setAddFieldOpen] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const rowH = ROW_H[config.rowHeight || 'short']

  const groups = useMemo(() => {
    if (!config.groupBy) return null
    const field = fields.find((f) => f.id === config.groupBy)
    if (!field) return null
    const map = new Map<string, Rec[]>()
    for (const r of rows) {
      const key =
        cellToText(field, cellValue(r, field), { users: ctx.users, linked: ctx.linkedNames }) ||
        '(vacío)'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(r)
    }
    return { field, entries: Array.from(map.entries()) }
  }, [rows, config.groupBy, fields, ctx])

  function startEdit(r: Rec, f: Field) {
    if (!canEdit || f.type === 'createdtime') return
    if (f.type === 'checkbox') {
      onPatchCell(r.id, f.id, !r.data[f.id])
      return
    }
    setEditing({ recordId: r.id, fieldId: f.id })
    setEditValue(r.data[f.id] ?? null)
  }

  function commitEdit() {
    if (editing) {
      onPatchCell(editing.recordId, editing.fieldId, editValue)
      setEditing(null)
    }
  }

  function renderRow(r: Rec, idx: number) {
    const color = rowColor(r, fields, config)
    const colorCls = color ? ROW_COLOR_CLASSES[color]?.row || '' : ''
    const bgClass = idx % 2 === 0 ? 'bg-[#0f172a]/35' : 'bg-[#1b253b]/15'
    return (
      <tr
        key={r.id}
        draggable={canEdit}
        onDragStart={(e) => {
          if (!canEdit) return
          setDraggedId(r.id)
          e.dataTransfer.effectAllowed = 'move'
        }}
        onDragEnd={() => {
          setDraggedId(null)
          setDragOverId(null)
        }}
        onDragOver={(e) => {
          if (!canEdit || !draggedId || draggedId === r.id) return
          e.preventDefault()
          setDragOverId(r.id)
        }}
        onDragLeave={() => {
          if (dragOverId === r.id) setDragOverId(null)
        }}
        onDrop={(e) => {
          if (!canEdit || draggedId === r.id || !draggedId) return
          e.preventDefault()
          onReorderRecords(draggedId, r.id)
          setDraggedId(null)
          setDragOverId(null)
        }}
        className={`group border-b border-slate-800/40 border-l-2 ${colorCls || 'border-l-transparent'} ${bgClass} ${
          dragOverId === r.id ? 'bg-teal-500/20 border-t-2 border-t-teal-400' : 'hover:bg-slate-800/35'
        } transition-all`}
      >
        <td
          className={`relative sticky left-0 z-10 w-16 min-w-16 ${bgClass} border-r border-slate-800/60 px-1 text-center text-xs text-slate-400 group-hover:bg-[#1a253c] transition-colors`}
        >
          <span className="group-hover:hidden">{idx + 1}</span>
          <span className="hidden items-center justify-center gap-1 group-hover:flex">
            {canEdit && (
              <span className="text-slate-500 text-xs cursor-grab active:cursor-grabbing px-0.5" title="Arrastrar para mover">
                ⋮
              </span>
            )}
            <button
              title="Expandir registro" aria-label="Expandir registro"
              className="flex h-6 w-6 items-center justify-center rounded-full bg-teal-500 text-slate-950 hover:bg-teal-400 shadow-md hover:scale-105 active:scale-95 transition-all text-xs font-bold font-mono"
              onClick={() => onOpenRecord(r.id)}
            >
              ⤢
            </button>
            {canEdit && (
              <button
                title="Borrar registro" aria-label="Borrar registro"
                className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-800/80 text-red-400 hover:bg-red-950/40 border border-slate-700/50 hover:border-red-500/30 transition-all text-xs"
                onClick={() => {
                  if (confirm('¿Borrar este registro?')) onDeleteRecord(r.id)
                }}
              >
                🗑
              </button>
            )}
          </span>

          {/* Plus buttons for inserting rows */}
          {canEdit && idx === 0 && (
            <button
              title="Insertar fila arriba" aria-label="Insertar fila arriba"
              className="absolute top-0 left-1/2 z-20 -translate-x-1/2 -translate-y-1/2 hidden group-hover:flex items-center justify-center w-4 h-4 bg-teal-500 hover:bg-teal-400 text-white rounded-full shadow-lg text-[9px] font-bold transition-transform hover:scale-110"
              onClick={(e) => {
                e.stopPropagation()
                onAddRecord({}, r.position)
              }}
            >
              +
            </button>
          )}
          {canEdit && (
            <button
              title="Insertar fila abajo" aria-label="Insertar fila abajo"
              className="absolute bottom-0 left-1/2 z-20 -translate-x-1/2 translate-y-1/2 hidden group-hover:flex items-center justify-center w-4 h-4 bg-teal-500 hover:bg-teal-400 text-white rounded-full shadow-lg text-[9px] font-bold transition-transform hover:scale-110"
              onClick={(e) => {
                e.stopPropagation()
                onAddRecord({}, r.position + 1)
              }}
            >
              +
            </button>
          )}
        </td>
        {visibleFields.map((f, fi) => {
          const isEditing = editing?.recordId === r.id && editing?.fieldId === f.id
          const inlineEditable = ['rating'].includes(f.type)
          return (
            <td
              key={f.id}
              className={`relative min-w-[160px] max-w-[320px] cursor-default border-r border-slate-800/40 px-3 py-1.5 align-middle text-sm ${rowH} ${
                fi === 0 ? 'font-semibold text-slate-200' : 'text-slate-300'
              } overflow-hidden hover:bg-slate-800/10 transition-colors`}
              onClick={() => !isEditing && !inlineEditable && startEdit(r, f)}
            >
              {inlineEditable && canEdit ? (
                <FieldInput
                  field={f}
                  value={cellValue(r, f)}
                  onChange={(v) => onPatchCell(r.id, f.id, v)}
                  ctx={ctx}
                />
              ) : (
                <div className={config.rowHeight === 'tall' ? 'max-h-full overflow-hidden' : 'truncate'}>
                  <CellValue field={f} value={cellValue(r, f)} ctx={ctx} />
                </div>
              )}
              {isEditing && (
                <Popover open onClose={commitEdit} className="w-72 p-2">
                  <p className="mb-1 px-1 text-xs font-medium text-slate-400">{f.name}</p>
                  <FieldInput
                    field={f}
                    value={editValue}
                    onChange={setEditValue}
                    ctx={ctx}
                    autoFocus
                    onCommit={commitEdit}
                  />
                </Popover>
              )}
            </td>
          )
        })}
        <td className="min-w-[60px]" />
      </tr>
    )
  }

  let bodyContent: React.ReactNode
  if (groups) {
    bodyContent = groups.entries.map(([key, groupRows]) => {
      const isCollapsed = collapsed.has(key)
      return (
        <GroupRows
          key={key}
          label={key}
          count={groupRows.length}
          collapsed={isCollapsed}
          colSpan={visibleFields.length + 2}
          onToggle={() => {
            const next = new Set(collapsed)
            if (isCollapsed) next.delete(key)
            else next.add(key)
            setCollapsed(next)
          }}
        >
          {!isCollapsed && groupRows.map((r, i) => renderRow(r, i))}
        </GroupRows>
      )
    })
  } else {
    bodyContent = rows.map((r, i) => renderRow(r, i))
  }

  return (
    <div className="flex-1 overflow-auto bg-[#0b1220] border border-slate-800/40 rounded-xl m-2 shadow-2xl relative">
      <table className="w-max min-w-full border-collapse text-slate-300">
        <thead className="sticky top-0 z-20">
          <tr className="bg-[#131d30] text-left text-xs uppercase tracking-wider text-slate-400 font-semibold shadow-sm border-b border-slate-800/80">
            <th className="sticky left-0 z-10 w-16 min-w-16 bg-[#131d30] border-b border-r border-slate-800/80" />
            {visibleFields.map((f) => {
              const typeMeta = FIELD_TYPES.find((t) => t.type === f.type)
              return (
                <th
                  key={f.id}
                  className="relative min-w-[160px] border-b border-r border-slate-800/80 px-2 py-2 font-medium"
                >
                  <button
                    className="flex w-full items-center gap-1.5 truncate px-2 py-1 rounded hover:bg-slate-800/60 hover:text-slate-200 disabled:cursor-default transition-colors text-slate-300"
                    disabled={!canEdit}
                    onClick={() => setFieldMenu(fieldMenu === f.id ? null : f.id)}
                  >
                    <span className="text-slate-400 text-xs font-mono select-none w-4 text-center mr-0.5" title={typeMeta?.label}>{typeMeta?.icon || '•'}</span>
                    <span className="truncate normal-case text-sm font-semibold">{f.name}</span>
                    {canEdit && <span className="ml-auto text-slate-500">▾</span>}
                  </button>
                <Popover open={fieldMenu === f.id} onClose={() => setFieldMenu(null)}>
                  <FieldEditor
                    tableId={tableId}
                    field={f}
                    baseTables={baseTables}
                    onDone={() => {
                      setFieldMenu(null)
                      onSchemaChange()
                    }}
                    onDelete={async () => {
                      if (!confirm(`¿Borrar el campo "${f.name}" y sus datos?`)) return
                      const res = await fetch(`/api/fields/${f.id}`, { method: 'DELETE' })
                      if (!res.ok) {
                        const d = await res.json().catch(() => ({}))
                        toast.error(d.error || 'No se pudo borrar')
                        return
                      }
                      setFieldMenu(null)
                      onSchemaChange()
                    }}
                  />
                </Popover>
                </th >
              )
            })}
            <th className="relative min-w-[60px] border-b border-slate-800 px-2">
              {canEdit && (
                <>
                  <button
                    title="Agregar campo" aria-label="Agregar campo"
                    className="rounded px-2 py-1 text-base text-slate-400 hover:bg-slate-800 hover:text-white"
                    onClick={() => setAddFieldOpen(true)}
                  >
                    +
                  </button>
                  <Popover open={addFieldOpen} onClose={() => setAddFieldOpen(false)} align="right">
                    <FieldEditor
                      tableId={tableId}
                      baseTables={baseTables}
                      onDone={() => {
                        setAddFieldOpen(false)
                        onSchemaChange()
                      }}
                    />
                  </Popover>
                </>
              )}
            </th>
          </tr>
        </thead>
        <tbody>
          {bodyContent}
          {canEdit && (
            <tr>
              <td className="sticky left-0 bg-slate-950" />
              <td colSpan={visibleFields.length + 1} className="px-2 py-1.5">
                <button
                  className="btn-ghost w-full justify-start text-slate-400"
                  onClick={onAddRecord}
                >
                  + Nuevo registro
                </button>
              </td>
            </tr>
          )}
          {rows.length === 0 && (
            <tr>
              <td />
              <td colSpan={visibleFields.length + 1} className="px-4 py-10 text-center text-sm text-slate-500">
                No hay registros que cumplan los filtros.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

function GroupRows({
  label,
  count,
  collapsed,
  colSpan,
  onToggle,
  children,
}: {
  label: string
  count: number
  collapsed: boolean
  colSpan: number
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <>
      <tr className="border-b border-slate-800 bg-slate-900/80">
        <td colSpan={colSpan} className="px-3 py-2">
          <button className="flex items-center gap-2 text-sm font-semibold" onClick={onToggle}>
            <span className="text-teal-400">{collapsed ? '▸' : '▾'}</span>
            {label}
            <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs font-normal text-slate-400">
              {count}
            </span>
          </button>
        </td>
      </tr>
      {children}
    </>
  )
}
