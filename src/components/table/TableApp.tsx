'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { ViewConfig, cellToText } from '@/lib/fields'
import { TableData, ViewT, VIEW_TYPE_META, cellValue } from './types'
import { applyView } from './applyView'
import { CellCtx } from './cells'
import { FilterPanel, SortPanel, HidePanel, GroupPanel, ColorPanel } from './viewControls'
import GridView from './GridView'
import KanbanView from './KanbanView'
import CalendarView from './CalendarView'
import GalleryView from './GalleryView'
import FormDesigner from './FormDesigner'
import RecordModal from './RecordModal'
import TopBar from '../TopBar'
import Popover from '../Popover'
import Modal from '../Modal'
import Avatar from '../Avatar'

export default function TableApp({
  baseId,
  tableId,
  viewId,
}: {
  baseId: string
  tableId: string
  viewId: string
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [data, setData] = useState<TableData | null>(null)
  const [error, setError] = useState('')
  const [openRecordId, setOpenRecordId] = useState<string | null>(searchParams.get('record'))
  const [viewsOpen, setViewsOpen] = useState(false)
  const [toolOpen, setToolOpen] = useState<string | null>(null)
  const [shareOpen, setShareOpen] = useState(false)
  const [newTableOpen, setNewTableOpen] = useState(false)
  const [newViewOpen, setNewViewOpen] = useState(false)
  const [tableMenuOpen, setTableMenuOpen] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await fetch(`/api/tables/${tableId}/data`, { cache: 'no-store' })
    if (res.status === 401) {
      // sesión vencida o inválida: volver a loguear
      window.location.href = '/login'
      return
    }
    if (!res.ok) {
      const d = await res.json().catch(() => ({} as any))
      setError(`No se pudo cargar la tabla (error ${res.status}${d.error ? `: ${d.error}` : ''})`)
      return
    }
    setData(await res.json())
  }, [tableId])

  useEffect(() => {
    load()
  }, [load])

  const view = data?.views.find((v) => v.id === viewId) || data?.views[0]
  const canEdit = data ? ['owner', 'editor'].includes(data.myRole) : false
  const canComment = data ? data.myRole !== 'viewer' : false
  const canConfig = canEdit || (view ? view.personal === 1 : false)
  const isOwner = data?.myRole === 'owner'

  const config: ViewConfig = view?.config || {}

  const ctx: CellCtx = useMemo(
    () => ({
      users: data?.users || [],
      linkedNames: data?.linkedNames || {},
      linkedOptions: data?.linkedOptions || {},
    }),
    [data]
  )

  const rows = useMemo(() => {
    if (!data) return []
    return applyView(data.records, data.fields, config, {
      users: data.users,
      linked: data.linkedNames,
    })
  }, [data, config])

  function openRecord(id: string | null) {
    setOpenRecordId(id)
    const url = new URL(window.location.href)
    if (id) url.searchParams.set('record', id)
    else url.searchParams.delete('record')
    window.history.replaceState(null, '', url.toString())
  }

  async function updateConfig(c: ViewConfig) {
    if (!view || !data) return
    // optimista
    setData({
      ...data,
      views: data.views.map((v) => (v.id === view.id ? { ...v, config: c } : v)),
    })
    await fetch(`/api/views/${view.id}`, { method: 'PATCH', body: JSON.stringify({ config: c }) })
  }

  async function patchCell(recordId: string, fieldId: string, value: any) {
    if (!data) return
    setData({
      ...data,
      records: data.records.map((r) =>
        r.id === recordId ? { ...r, data: { ...r.data, [fieldId]: value } } : r
      ),
    })
    await fetch(`/api/records/${recordId}`, {
      method: 'PATCH',
      body: JSON.stringify({ data: { [fieldId]: value } }),
    })
    // recargar por si cambian vínculos/notificaciones
    load()
  }

  async function addRecord(initial: any = {}) {
    const res = await fetch(`/api/tables/${tableId}/records`, {
      method: 'POST',
      body: JSON.stringify({ data: initial }),
    })
    if (res.ok) {
      const d = await res.json()
      await load()
      openRecord(d.id)
    }
  }

  async function deleteRecord(id: string) {
    await fetch(`/api/records/${id}`, { method: 'DELETE' })
    if (openRecordId === id) openRecord(null)
    load()
  }

  function exportCSV() {
    if (!data) return
    const visibleFields = data.fields.filter(
      (f, i) => i === 0 || !(config.hidden || []).includes(f.id)
    )
    const esc = (s: string) => `"${String(s).replace(/"/g, '""')}"`
    const lines = [visibleFields.map((f) => esc(f.name)).join(',')]
    for (const r of rows) {
      lines.push(
        visibleFields
          .map((f) =>
            esc(cellToText(f, cellValue(r, f), { users: data.users, linked: data.linkedNames }))
          )
          .join(',')
      )
    }
    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${data.table.name}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  if (error) {
    return (
      <div className="flex min-h-screen flex-col">
        <TopBar />
        <div className="flex flex-1 items-center justify-center text-slate-400">{error}</div>
      </div>
    )
  }

  if (!data || !view) {
    return (
      <div className="flex min-h-screen flex-col">
        <TopBar />
        <div className="flex flex-1 items-center justify-center text-slate-400">Cargando…</div>
      </div>
    )
  }

  const openRecordObj = openRecordId ? data.records.find((r) => r.id === openRecordId) : null

  const tools: { key: string; label: string; show: boolean }[] = [
    { key: 'hide', label: '👁 Campos', show: view.type !== 'form' },
    { key: 'filter', label: `⚲ Filtros${(config.filters || []).length ? ` (${config.filters!.length})` : ''}`, show: view.type !== 'form' },
    { key: 'group', label: '▤ Agrupar', show: view.type === 'grid' },
    { key: 'sort', label: `⇅ Orden${(config.sorts || []).length ? ` (${config.sorts!.length})` : ''}`, show: view.type !== 'form' },
    { key: 'color', label: '🎨 Color', show: view.type !== 'form' },
    { key: 'height', label: '☰ Alto', show: view.type === 'grid' },
  ]

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <TopBar />

      {/* Barra de la base: nombre + tablas */}
      <div className="flex items-center gap-1 overflow-x-auto border-b border-slate-800 bg-slate-900/60 px-3 py-0">
        <Link href="/" className="btn-ghost shrink-0 px-2 text-slate-400" title="Volver a bases">
          ‹
        </Link>
        <span className="mr-2 flex shrink-0 items-center gap-1.5 font-semibold">
          <span>{data.base.icon}</span>
          <span className="max-w-40 truncate">{data.base.name}</span>
        </span>
        {data.baseTables.map((t) => (
          <div key={t.id} className="relative shrink-0">
            <button
              className={`border-b-2 px-3 py-2.5 text-sm ${
                t.id === tableId
                  ? 'border-teal-400 font-medium text-white'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
              onClick={() => {
                if (t.id === tableId) {
                  if (canEdit) setTableMenuOpen(tableMenuOpen === t.id ? null : t.id)
                } else {
                  router.push(`/base/${baseId}/table/${t.id}/view/first`)
                }
              }}
            >
              {t.name}
              {t.id === tableId && canEdit && <span className="ml-1 text-slate-600">▾</span>}
            </button>
            <Popover open={tableMenuOpen === t.id} onClose={() => setTableMenuOpen(null)} className="w-56 p-2">
              <TableMenu
                tableId={t.id}
                name={t.name}
                onDone={() => {
                  setTableMenuOpen(null)
                  load()
                }}
                onDeleted={() => {
                  setTableMenuOpen(null)
                  router.push(`/base/${baseId}`)
                }}
              />
            </Popover>
          </div>
        ))}
        {canEdit && (
          <div className="relative shrink-0">
            <button className="btn-ghost px-2 text-slate-400" onClick={() => setNewTableOpen(true)}>
              +
            </button>
            <Popover open={newTableOpen} onClose={() => setNewTableOpen(false)} className="w-64 p-3">
              <NameForm
                label="Nueva tabla"
                onSubmit={async (name) => {
                  const res = await fetch(`/api/bases/${baseId}/tables`, {
                    method: 'POST',
                    body: JSON.stringify({ name }),
                  })
                  if (res.ok) {
                    const d = await res.json()
                    setNewTableOpen(false)
                    router.push(`/base/${baseId}/table/${d.id}/view/${d.viewId}`)
                  }
                }}
              />
            </Popover>
          </div>
        )}
        <div className="ml-auto shrink-0">
          <button className="btn-ghost text-sm text-teal-300" onClick={() => setShareOpen(true)}>
            👥 Compartir
          </button>
        </div>
      </div>

      {/* Barra de vista: selector + herramientas */}
      <div className="flex items-center gap-1 overflow-x-auto border-b border-slate-800 bg-slate-950 px-3 py-1.5">
        <div className="relative shrink-0">
          <button
            className="btn-ghost gap-1.5 border border-slate-800 bg-slate-900 text-sm font-medium"
            onClick={() => setViewsOpen(!viewsOpen)}
          >
            <span className="text-teal-400">{VIEW_TYPE_META[view.type]?.icon}</span>
            {view.name}
            {view.personal === 1 && <span className="text-xs text-slate-500">(personal)</span>}
            <span className="text-slate-600">▾</span>
          </button>
          <Popover open={viewsOpen} onClose={() => setViewsOpen(false)} className="w-72 p-2">
            <p className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Vistas
            </p>
            {data.views.map((v) => (
              <div key={v.id} className="group flex items-center">
                <button
                  className={`flex flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-slate-800 ${
                    v.id === view.id ? 'bg-slate-800 text-teal-300' : ''
                  }`}
                  onClick={() => {
                    setViewsOpen(false)
                    router.push(`/base/${baseId}/table/${tableId}/view/${v.id}`)
                  }}
                >
                  <span>{VIEW_TYPE_META[v.type]?.icon}</span>
                  <span className="flex-1 truncate">{v.name}</span>
                  {v.personal === 1 && <span className="text-xs text-slate-500">personal</span>}
                </button>
                {(canEdit || v.personal === 1) && data.views.length > 1 && (
                  <button
                    className="hidden px-1.5 text-red-400 group-hover:block"
                    title="Borrar vista"
                    onClick={async () => {
                      if (!confirm(`¿Borrar la vista "${v.name}"?`)) return
                      const res = await fetch(`/api/views/${v.id}`, { method: 'DELETE' })
                      if (!res.ok) {
                        const d = await res.json().catch(() => ({}))
                        alert(d.error || 'No se pudo borrar')
                        return
                      }
                      if (v.id === view.id) router.push(`/base/${baseId}/table/${tableId}/view/first`)
                      else load()
                    }}
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
            <div className="mt-1 border-t border-slate-800 pt-1">
              <button
                className="w-full rounded-lg px-2 py-1.5 text-left text-sm text-teal-300 hover:bg-slate-800"
                onClick={() => {
                  setViewsOpen(false)
                  setNewViewOpen(true)
                }}
              >
                + Crear vista
              </button>
            </div>
          </Popover>
        </div>

        {canConfig &&
          tools
            .filter((t) => t.show)
            .map((t) => (
              <div key={t.key} className="relative shrink-0">
                <button
                  className={`btn-ghost px-2.5 py-1.5 text-sm ${
                    toolOpen === t.key ? 'bg-slate-800 text-white' : ''
                  }`}
                  onClick={() => setToolOpen(toolOpen === t.key ? null : t.key)}
                >
                  {t.label}
                </button>
                <Popover open={toolOpen === t.key} onClose={() => setToolOpen(null)}>
                  <ToolPanel
                    tool={t.key}
                    data={data}
                    config={config}
                    onChange={updateConfig}
                  />
                </Popover>
              </div>
            ))}

        <button className="btn-ghost shrink-0 px-2.5 py-1.5 text-sm" onClick={exportCSV} title="Exportar CSV">
          ⇩ CSV
        </button>
        <span className="ml-auto shrink-0 text-xs text-slate-500">
          {rows.length} registro{rows.length === 1 ? '' : 's'}
        </span>
      </div>

      {/* Vista */}
      {view.type === 'grid' && (
        <GridView
          rows={rows}
          fields={data.fields}
          config={config}
          ctx={ctx}
          canEdit={canEdit}
          tableId={tableId}
          baseTables={data.baseTables}
          onPatchCell={patchCell}
          onAddRecord={() => addRecord()}
          onOpenRecord={openRecord}
          onDeleteRecord={deleteRecord}
          onSchemaChange={load}
        />
      )}
      {view.type === 'kanban' && (
        <KanbanView
          rows={rows}
          fields={data.fields}
          config={config}
          ctx={ctx}
          canEdit={canEdit}
          onPatchCell={patchCell}
          onOpenRecord={openRecord}
          onAddRecord={addRecord}
          onConfigChange={updateConfig}
        />
      )}
      {view.type === 'calendar' && (
        <CalendarView
          rows={rows}
          fields={data.fields}
          config={config}
          ctx={ctx}
          canEdit={canEdit}
          onOpenRecord={openRecord}
          onAddRecord={addRecord}
          onConfigChange={updateConfig}
        />
      )}
      {view.type === 'gallery' && (
        <GalleryView
          rows={rows}
          fields={data.fields}
          config={config}
          ctx={ctx}
          canEdit={canEdit}
          onOpenRecord={openRecord}
          onAddRecord={() => addRecord()}
          onConfigChange={updateConfig}
        />
      )}
      {view.type === 'form' && (
        <FormDesigner
          fields={data.fields}
          config={config}
          canEdit={canConfig}
          onConfigChange={updateConfig}
        />
      )}

      {/* Modal registro expandido */}
      {openRecordObj && (
        <RecordModal
          record={openRecordObj}
          fields={data.fields}
          ctx={ctx}
          canEdit={canEdit}
          canComment={canComment}
          users={data.users}
          onClose={() => openRecord(null)}
          onPatch={(fieldId, value) => patchCell(openRecordObj.id, fieldId, value)}
          onDelete={() => deleteRecord(openRecordObj.id)}
        />
      )}

      {/* Crear vista */}
      <Modal open={newViewOpen} onClose={() => setNewViewOpen(false)} title="Crear vista">
        <NewViewForm
          canEdit={canEdit}
          onSubmit={async (name, type, personal) => {
            const res = await fetch(`/api/tables/${tableId}/views`, {
              method: 'POST',
              body: JSON.stringify({ name, type, personal }),
            })
            if (res.ok) {
              const d = await res.json()
              setNewViewOpen(false)
              router.push(`/base/${baseId}/table/${tableId}/view/${d.id}`)
            } else {
              const d = await res.json().catch(() => ({}))
              alert(d.error || 'No se pudo crear la vista')
            }
          }}
        />
      </Modal>

      {/* Compartir base */}
      <ShareModal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        baseId={baseId}
        isOwner={isOwner}
        onChanged={load}
      />
    </div>
  )
}

function ToolPanel({
  tool,
  data,
  config,
  onChange,
}: {
  tool: string
  data: TableData
  config: ViewConfig
  onChange: (c: ViewConfig) => void
}) {
  switch (tool) {
    case 'filter':
      return <FilterPanel fields={data.fields} config={config} onChange={onChange} users={data.users} />
    case 'sort':
      return <SortPanel fields={data.fields} config={config} onChange={onChange} />
    case 'hide':
      return <HidePanel fields={data.fields} config={config} onChange={onChange} />
    case 'group':
      return <GroupPanel fields={data.fields} config={config} onChange={onChange} />
    case 'color':
      return <ColorPanel fields={data.fields} config={config} onChange={onChange} users={data.users} />
    case 'height':
      return (
        <div className="w-48 p-2">
          {(['short', 'medium', 'tall'] as const).map((h) => (
            <button
              key={h}
              className={`w-full rounded-lg px-2 py-1.5 text-left text-sm hover:bg-slate-800 ${
                (config.rowHeight || 'short') === h ? 'text-teal-300' : ''
              }`}
              onClick={() => onChange({ ...config, rowHeight: h })}
            >
              {h === 'short' ? 'Bajo' : h === 'medium' ? 'Medio' : 'Alto'}
            </button>
          ))}
        </div>
      )
    default:
      return null
  }
}

function NameForm({ label, onSubmit }: { label: string; onSubmit: (name: string) => void }) {
  const [name, setName] = useState('')
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (name.trim()) onSubmit(name.trim())
      }}
    >
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <input className="input mb-2" value={name} autoFocus onChange={(e) => setName(e.target.value)} />
      <button type="submit" className="btn-primary w-full py-1.5" disabled={!name.trim()}>
        Crear
      </button>
    </form>
  )
}

function TableMenu({
  tableId,
  name,
  onDone,
  onDeleted,
}: {
  tableId: string
  name: string
  onDone: () => void
  onDeleted: () => void
}) {
  const [newName, setNewName] = useState(name)
  return (
    <div>
      <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
        Tabla
      </p>
      <form
        className="mb-1 flex gap-1.5"
        onSubmit={async (e) => {
          e.preventDefault()
          await fetch(`/api/tables/${tableId}`, {
            method: 'PATCH',
            body: JSON.stringify({ name: newName }),
          })
          onDone()
        }}
      >
        <input className="input py-1" value={newName} onChange={(e) => setNewName(e.target.value)} />
        <button type="submit" className="btn-primary px-2 py-1 text-xs">
          OK
        </button>
      </form>
      <button
        className="w-full rounded-lg px-2 py-1.5 text-left text-sm text-red-400 hover:bg-slate-800"
        onClick={async () => {
          if (!confirm(`¿Borrar la tabla "${name}" con todos sus datos?`)) return
          const res = await fetch(`/api/tables/${tableId}`, { method: 'DELETE' })
          if (!res.ok) {
            const d = await res.json().catch(() => ({}))
            alert(d.error || 'No se pudo borrar')
            return
          }
          onDeleted()
        }}
      >
        Borrar tabla
      </button>
    </div>
  )
}

function NewViewForm({
  canEdit,
  onSubmit,
}: {
  canEdit: boolean
  onSubmit: (name: string, type: string, personal: boolean) => void
}) {
  const [name, setName] = useState('')
  const [type, setType] = useState('grid')
  const [personal, setPersonal] = useState(!canEdit)
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        if (name.trim()) onSubmit(name.trim(), type, personal)
      }}
    >
      <input
        className="input"
        placeholder="Nombre de la vista"
        value={name}
        autoFocus
        onChange={(e) => setName(e.target.value)}
      />
      <div className="grid grid-cols-2 gap-1.5">
        {Object.entries(VIEW_TYPE_META).map(([t, meta]) => (
          <button
            key={t}
            type="button"
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
              type === t
                ? 'border-teal-500 bg-teal-900/30 text-teal-200'
                : 'border-slate-700 hover:bg-slate-800'
            }`}
            onClick={() => setType(t)}
          >
            <span>{meta.icon}</span>
            {meta.label}
          </button>
        ))}
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-300">
        <input
          type="checkbox"
          checked={personal}
          disabled={!canEdit}
          onChange={(e) => setPersonal(e.target.checked)}
        />
        Vista personal (solo la ves vos)
      </label>
      <button type="submit" className="btn-primary w-full" disabled={!name.trim()}>
        Crear vista
      </button>
    </form>
  )
}

function ShareModal({
  open,
  onClose,
  baseId,
  isOwner,
  onChanged,
}: {
  open: boolean
  onClose: () => void
  baseId: string
  isOwner: boolean
  onChanged: () => void
}) {
  const [collabs, setCollabs] = useState<any[]>([])
  const [users, setUsers] = useState<any[]>([])
  const [ownerId, setOwnerId] = useState('')
  const [selUser, setSelUser] = useState('')
  const [selRole, setSelRole] = useState('editor')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const res = await fetch(`/api/bases/${baseId}`)
    if (res.ok) {
      const d = await res.json()
      setCollabs(d.collaborators)
      setOwnerId(d.base.owner_id)
    }
    const ur = await fetch('/api/users')
    if (ur.ok) setUsers((await ur.json()).users)
  }, [baseId])

  useEffect(() => {
    if (open) load()
  }, [open, load])

  const available = users.filter(
    (u) => u.id !== ownerId && !collabs.some((c) => c.user_id === u.id)
  )
  const ownerUser = users.find((u) => u.id === ownerId)

  const ROLES: Record<string, string> = {
    editor: 'Editor',
    commenter: 'Comentarista',
    viewer: 'Lector',
  }

  return (
    <Modal open={open} onClose={onClose} title="Compartir base">
      <div className="space-y-2">
        {ownerUser && (
          <div className="flex items-center gap-2 rounded-lg border border-slate-800 px-3 py-2">
            <Avatar name={ownerUser.name} avatar={ownerUser.avatar} size={28} />
            <span className="flex-1 text-sm">{ownerUser.name}</span>
            <span className="text-xs text-teal-400">Dueño</span>
          </div>
        )}
        {collabs.map((c) => (
          <div key={c.id} className="flex items-center gap-2 rounded-lg border border-slate-800 px-3 py-2">
            <Avatar name={c.name} avatar={c.avatar} size={28} />
            <span className="min-w-0 flex-1 truncate text-sm">{c.name}</span>
            {isOwner ? (
              <>
                <select
                  className="input w-auto py-1 text-xs"
                  value={c.role}
                  onChange={async (e) => {
                    await fetch(`/api/bases/${baseId}/collaborators`, {
                      method: 'POST',
                      body: JSON.stringify({ userId: c.user_id, role: e.target.value }),
                    })
                    load()
                    onChanged()
                  }}
                >
                  {Object.entries(ROLES).map(([r, label]) => (
                    <option key={r} value={r}>
                      {label}
                    </option>
                  ))}
                </select>
                <button
                  className="text-red-400 hover:text-red-300"
                  onClick={async () => {
                    await fetch(`/api/bases/${baseId}/collaborators`, {
                      method: 'DELETE',
                      body: JSON.stringify({ userId: c.user_id }),
                    })
                    load()
                    onChanged()
                  }}
                >
                  ✕
                </button>
              </>
            ) : (
              <span className="text-xs text-slate-400">{ROLES[c.role]}</span>
            )}
          </div>
        ))}
        {collabs.length === 0 && (
          <p className="py-2 text-center text-sm text-slate-500">
            Todavía no compartiste esta base.
          </p>
        )}
      </div>
      {isOwner && (
        <div className="mt-4 border-t border-slate-800 pt-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Agregar persona
          </p>
          <div className="flex gap-1.5">
            <select className="input flex-1" value={selUser} onChange={(e) => setSelUser(e.target.value)}>
              <option value="">Elegir usuario…</option>
              {available.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} (@{u.username})
                </option>
              ))}
            </select>
            <select className="input w-36" value={selRole} onChange={(e) => setSelRole(e.target.value)}>
              {Object.entries(ROLES).map(([r, label]) => (
                <option key={r} value={r}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
          <button
            className="btn-primary mt-2 w-full"
            disabled={!selUser}
            onClick={async () => {
              setError('')
              const res = await fetch(`/api/bases/${baseId}/collaborators`, {
                method: 'POST',
                body: JSON.stringify({ userId: selUser, role: selRole }),
              })
              if (!res.ok) {
                const d = await res.json().catch(() => ({}))
                setError(d.error || 'No se pudo compartir')
                return
              }
              setSelUser('')
              load()
              onChanged()
            }}
          >
            Compartir
          </button>
        </div>
      )}
    </Modal>
  )
}
