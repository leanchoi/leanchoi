'use client'

import { useMemo, useState } from 'react'
import { Field, ViewConfig, cellToText, ROW_COLOR_CLASSES } from '@/lib/fields'
import { Rec, cellValue } from './types'
import { rowColor } from './applyView'
import { CellCtx, CellValue, FieldInput } from './cells'
import Popover from './Popover'
import FieldEditor from './FieldEditor'

const ROW_H: Record<string, string> = {
  short: 'h-9',
  medium: 'h-14',
  tall: 'h-24',
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
  onAddRecord: () => void
  onOpenRecord: (id: string) => void
  onDeleteRecord: (id: string) => void
  onSchemaChange: () => void
}) {
  const visibleFields = fields.filter((f, i) => i === 0 || !(config.hidden || []).includes(f.id))
  const [editing, setEditing] = useState<{ recordId: string; fieldId: string } | null>(null)
  const [editValue, setEditValue] = useState<any>(null)
  const [fieldMenu, setFieldMenu] = useState<string | null>(null)
  const [addFieldOpen, setAddFieldOpen] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
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
    return (
      <tr key={r.id} className={`group border-b border-slate-800/80 border-l-2 ${colorCls || 'border-l-transparent'} hover:bg-slate-800/40`}>
        <td className="sticky left-0 z-10 w-16 min-w-16 bg-slate-950 px-1 text-center text-xs text-slate-500 group-hover:bg-slate-900">
          <span className="group-hover:hidden">{idx + 1}</span>
          <span className="hidden items-center justify-center gap-0.5 group-hover:flex">
            <button
              title="Expandir registro"
              className="rounded p-1 text-teal-400 hover:bg-slate-700"
              onClick={() => onOpenRecord(r.id)}
            >
              ⤢
            </button>
            {canEdit && (
              <button
                title="Borrar registro"
                className="rounded p-1 text-red-400 hover:bg-slate-700"
                onClick={() => {
                  if (confirm('¿Borrar este registro?')) onDeleteRecord(r.id)
                }}
              >
                🗑
              </button>
            )}
          </span>
        </td>
        {visibleFields.map((f, fi) => {
          const isEditing = editing?.recordId === r.id && editing?.fieldId === f.id
          const inlineEditable = ['rating'].includes(f.type)
          return (
            <td
              key={f.id}
              className={`relative min-w-[160px] max-w-[320px] cursor-default border-r border-slate-800/60 px-2 py-1 align-middle text-sm ${rowH} ${
                fi === 0 ? 'font-medium' : ''
              } overflow-hidden`}
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
    <div className="flex-1 overflow-auto">
      <table className="w-max min-w-full border-collapse">
        <thead className="sticky top-0 z-20">
          <tr className="bg-slate-900 text-left text-xs uppercase tracking-wide text-slate-400">
            <th className="sticky left-0 z-10 w-16 min-w-16 bg-slate-900 border-b border-r border-slate-800" />
            {visibleFields.map((f) => (
              <th
                key={f.id}
                className="relative min-w-[160px] border-b border-r border-slate-800 px-2 py-2 font-medium"
              >
                <button
                  className="flex w-full items-center gap-1.5 truncate hover:text-slate-200 disabled:cursor-default"
                  disabled={!canEdit}
                  onClick={() => setFieldMenu(fieldMenu === f.id ? null : f.id)}
                >
                  <span className="truncate normal-case text-sm">{f.name}</span>
                  {canEdit && <span className="ml-auto text-slate-600">▾</span>}
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
                        alert(d.error || 'No se pudo borrar')
                        return
                      }
                      setFieldMenu(null)
                      onSchemaChange()
                    }}
                  />
                </Popover>
              </th>
            ))}
            <th className="relative min-w-[60px] border-b border-slate-800 px-2">
              {canEdit && (
                <>
                  <button
                    title="Agregar campo"
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
