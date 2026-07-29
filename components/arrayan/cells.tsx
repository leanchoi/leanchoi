'use client'

import { useRef, useState } from 'react'
import { Field, CHOICE_COLOR_CLASSES, cellToText } from '@/lib/fields'
import Avatar from './Avatar'
import { UserLite } from './types'

export type CellCtx = {
  users: UserLite[]
  linkedNames: Record<string, string>
  linkedOptions?: Record<string, { id: string; name: string }[]>
}

export function ChoicePill({ name, color }: { name: string; color?: string }) {
  const cls = CHOICE_COLOR_CLASSES[color || 'gray'] || CHOICE_COLOR_CLASSES.gray
  return (
    <span className={`inline-block max-w-full truncate rounded-full border px-2 py-0.5 text-xs ${cls}`}>
      {name}
    </span>
  )
}

function choiceColor(field: Field, name: string): string | undefined {
  return (field.options?.choices || []).find((c: any) => c.name === name)?.color
}

export function Stars({
  value,
  max = 5,
  onChange,
}: {
  value: number
  max?: number
  onChange?: (v: number) => void
}) {
  return (
    <span className="inline-flex">
      {Array.from({ length: max }).map((_, i) => (
        <button
          key={i}
          type="button"
          disabled={!onChange}
          onClick={(e) => {
            e.stopPropagation()
            onChange && onChange(value === i + 1 ? 0 : i + 1)
          }}
          className={`text-base leading-none ${
            i < value ? 'text-yellow-400 drop-shadow-[0_0_3px_rgba(250,204,21,0.5)]' : 'text-slate-700'
          } ${onChange ? 'hover:text-yellow-300' : ''}`}
        >
          ★
        </button>
      ))}
    </span>
  )
}

// Valor de celda en modo lectura
export function CellValue({
  field,
  value,
  ctx,
  compact = true,
}: {
  field: Field
  value: any
  ctx: CellCtx
  compact?: boolean
}) {
  if (value === null || value === undefined || value === '') {
    if (field.type === 'checkbox') {
      return (
        <span className="inline-flex items-center justify-center w-4 h-4 rounded border border-slate-700 text-transparent text-[10px]">
          ✓
        </span>
      )
    }
    if (field.type === 'rating') return <Stars value={0} max={field.options?.max || 5} />
    return null
  }
  switch (field.type) {
    case 'checkbox':
      return (
        <span className="flex items-center">
          <span className={`inline-flex items-center justify-center w-4 h-4 rounded border text-[10px] font-bold transition-colors ${value ? 'bg-teal-500 border-teal-400 text-slate-950' : 'border-slate-700 text-transparent'}`}>
            ✓
          </span>
        </span>
      )
    case 'rating':
      return <Stars value={Number(value) || 0} max={field.options?.max || 5} />
    case 'select':
      return <ChoicePill name={String(value)} color={choiceColor(field, String(value))} />
    case 'multiselect': {
      const vals: string[] = Array.isArray(value) ? value : [value]
      return (
        <span className="flex flex-wrap gap-1">
          {vals.map((v) => (
            <ChoicePill key={v} name={v} color={choiceColor(field, v)} />
          ))}
        </span>
      )
    }
    case 'user': {
      const ids: any[] = Array.isArray(value) ? value : [value]
      return (
        <span className="flex flex-wrap items-center gap-1">
          {ids.map((id) => {
            const u = ctx.users.find((x) => String(x.id) === String(id))
            if (!u) return null
            return (
              <span key={id} className="flex items-center gap-1 rounded-full bg-slate-800/80 border border-slate-700/30 py-0.5 pl-0.5 pr-2 text-xs text-slate-200">
                <Avatar name={u.name} avatar={u.avatar} userId={u.id} size={18} />
                {u.name.split(' ')[0]}
              </span>
            )
          })}
        </span>
      )
    }
    case 'link': {
      const ids: string[] = Array.isArray(value) ? value : [value]
      return (
        <span className="flex flex-wrap gap-1">
          {ids.map((id) => (
            <span key={id} className="rounded-md border border-teal-500/20 bg-teal-500/10 px-2 py-0.5 text-xs text-teal-300 font-medium hover:bg-teal-500/20 transition-colors">
              {ctx.linkedNames[id] || 'Registro'}
            </span>
          ))}
        </span>
      )
    }
    case 'attachment': {
      const files: any[] = Array.isArray(value) ? value : []
      return (
        <span className="flex flex-wrap items-center gap-1">
          {files.map((f) => {
            const isImg = String(f.type || '').startsWith('image/')
            return isImg ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={f.id}
                src={f.url}
                alt={f.name}
                className={`rounded object-cover ${compact ? 'h-6 w-8' : 'h-16 w-20'}`}
              />
            ) : (
              <span key={f.id} className="rounded bg-slate-800 px-1.5 py-0.5 text-xs">
                📎 {compact ? '' : f.name}
              </span>
            )
          })}
        </span>
      )
    }
    case 'url':
      return (
        <a
          href={String(value).startsWith('http') ? String(value) : `https://${value}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="text-teal-400 underline decoration-teal-700 underline-offset-2 hover:text-teal-300"
        >
          {String(value)}
        </a>
      )
    default:
      return <span className={compact ? 'truncate' : 'whitespace-pre-wrap break-words'}>{cellToText(field, value, { users: ctx.users, linked: ctx.linkedNames })}</span>
  }
}

// Control editable por tipo de campo (usado en modal de registro, popover de celda y formularios)
export function FieldInput({
  field,
  value,
  onChange,
  ctx,
  autoFocus = false,
  onCommit,
}: {
  field: Field
  value: any
  onChange: (v: any) => void
  ctx: CellCtx
  autoFocus?: boolean
  onCommit?: () => void
}) {
  switch (field.type) {
    case 'longtext':
      return (
        <textarea
          className="input min-h-[90px]"
          value={value ?? ''}
          autoFocus={autoFocus}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onCommit}
        />
      )
    case 'number':
    case 'currency':
    case 'percent':
      return (
        <input
          type="number"
          step="any"
          className="input"
          value={value ?? ''}
          autoFocus={autoFocus}
          onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
          onBlur={onCommit}
          onKeyDown={(e) => e.key === 'Enter' && onCommit && onCommit()}
        />
      )
    case 'rating':
      return (
        <div className="py-1">
          <Stars
            value={Number(value) || 0}
            max={field.options?.max || 5}
            onChange={(v) => {
              onChange(v)
            }}
          />
        </div>
      )
    case 'checkbox':
      return (
        <button
          type="button"
          className="flex items-center justify-center p-1"
          onClick={() => onChange(!value)}
        >
          <span className={`inline-flex items-center justify-center w-5 h-5 rounded border text-xs font-bold transition-all ${value ? 'bg-teal-500 border-teal-400 text-slate-950' : 'border-slate-600 text-transparent hover:border-slate-500'}`}>
            ✓
          </span>
        </button>
      )
    case 'date':
      return (
        <input
          type={field.options?.includeTime ? 'datetime-local' : 'date'}
          className="input"
          value={value ?? ''}
          autoFocus={autoFocus}
          onChange={(e) => onChange(e.target.value || null)}
          onBlur={onCommit}
        />
      )
    case 'select': {
      const choices: any[] = field.options?.choices || []
      return (
        <div className="max-h-56 space-y-0.5 overflow-y-auto py-1">
          {choices.length === 0 && (
            <p className="px-1 py-2 text-xs text-slate-500">
              Sin opciones. Editá el campo para agregarlas.
            </p>
          )}
          {choices.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left hover:bg-slate-800 ${
                value === c.name ? 'bg-slate-800' : ''
              }`}
              onClick={() => {
                onChange(value === c.name ? null : c.name)
                onCommit && onCommit()
              }}
            >
              <ChoicePill name={c.name} color={c.color} />
              {value === c.name && <span className="text-teal-400">✓</span>}
            </button>
          ))}
          {value && (
            <button
              type="button"
              className="w-full rounded-lg px-2 py-1.5 text-left text-xs text-slate-400 hover:bg-slate-800"
              onClick={() => {
                onChange(null)
                onCommit && onCommit()
              }}
            >
              Limpiar
            </button>
          )}
        </div>
      )
    }
    case 'multiselect': {
      const choices: any[] = field.options?.choices || []
      const vals: string[] = Array.isArray(value) ? value : []
      return (
        <div className="max-h-56 space-y-0.5 overflow-y-auto py-1">
          {choices.length === 0 && (
            <p className="px-1 py-2 text-xs text-slate-500">
              Sin opciones. Editá el campo para agregarlas.
            </p>
          )}
          {choices.map((c) => {
            const on = vals.includes(c.name)
            return (
              <button
                key={c.id}
                type="button"
                className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left hover:bg-slate-800"
                onClick={() =>
                  onChange(on ? vals.filter((v) => v !== c.name) : [...vals, c.name])
                }
              >
                <ChoicePill name={c.name} color={c.color} />
                {on && <span className="text-teal-400">✓</span>}
              </button>
            )
          })}
        </div>
      )
    }
    case 'user': {
      const multiple = field.options?.multiple !== false
      const vals: any[] = Array.isArray(value) ? value : []
      return (
        <div className="max-h-56 space-y-0.5 overflow-y-auto py-1">
          {ctx.users.map((u) => {
            const on = vals.includes(u.id)
            return (
              <button
                key={u.id}
                type="button"
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-slate-800"
                onClick={() => {
                  if (on) onChange(vals.filter((v) => v !== u.id))
                  else onChange(multiple ? [...vals, u.id] : [u.id])
                }}
              >
                <Avatar name={u.name} avatar={u.avatar} userId={u.id} size={22} />
                <span className="flex-1 truncate text-sm">{u.name}</span>
                {on && <span className="text-teal-400">✓</span>}
              </button>
            )
          })}
        </div>
      )
    }
    case 'link': {
      return <LinkEditor field={field} value={value} onChange={onChange} ctx={ctx} />
    }
    case 'attachment': {
      return <AttachmentEditor value={value} onChange={onChange} />
    }
    case 'createdtime':
      return <p className="px-1 py-1 text-sm text-slate-400">Se completa automáticamente</p>
    default:
      return (
        <input
          type={field.type === 'email' ? 'email' : 'text'}
          className="input"
          value={value ?? ''}
          autoFocus={autoFocus}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onCommit}
          onKeyDown={(e) => e.key === 'Enter' && onCommit && onCommit()}
        />
      )
  }
}

function LinkEditor({
  field,
  value,
  onChange,
  ctx,
}: {
  field: Field
  value: any
  onChange: (v: any) => void
  ctx: CellCtx
}) {
  const [search, setSearch] = useState('')
  const options = ctx.linkedOptions?.[field.id] || []
  const vals: string[] = Array.isArray(value) ? value : []
  const filtered = options.filter((o) =>
    o.name.toLowerCase().includes(search.toLowerCase())
  )
  return (
    <div className="py-1">
      <input
        className="input mb-1"
        placeholder="Buscar registro…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div className="max-h-48 space-y-0.5 overflow-y-auto">
        {filtered.length === 0 && (
          <p className="px-1 py-2 text-xs text-slate-500">No hay registros para vincular</p>
        )}
        {filtered.map((o) => {
          const on = vals.includes(o.id)
          return (
            <button
              key={o.id}
              type="button"
              className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-sm hover:bg-slate-800"
              onClick={() => onChange(on ? vals.filter((v) => v !== o.id) : [...vals, o.id])}
            >
              <span className="truncate">{o.name}</span>
              {on && <span className="text-teal-400">✓</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function AttachmentEditor({ value, onChange }: { value: any; onChange: (v: any) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState('')
  const files: any[] = Array.isArray(value) ? value : []

  async function upload(list: FileList | null) {
    if (!list || list.length === 0) return
    setError('')
    setUploading(true)
    const added: any[] = []
    for (const f of Array.from(list)) {
      if (f.size > 50 * 1024 * 1024) {
        setError(`"${f.name}" supera el límite de 50MB`)
        continue
      }
      const fd = new FormData()
      fd.append('file', f)
      const res = await fetch('/api/upload', { method: 'POST', body: fd })
      const data = await res.json()
      if (res.ok) added.push(data)
      else setError(data.error || 'Error al subir')
    }
    setUploading(false)
    if (added.length) onChange([...files, ...added])
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(true)
  }

  const handleDragLeave = () => {
    setDragOver(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer.files) {
      upload(e.dataTransfer.files)
    }
  }

  return (
    <div className="space-y-3 py-1">
      {files.length > 0 && (
        <div className="flex flex-col gap-3">
          {files.map((f) => {
            const isImg = String(f.type || '').startsWith('image/')
            return (
              <div key={f.id} className="group relative rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden flex flex-col hover:border-slate-700 transition-colors shadow-md">
                <div className="relative w-full bg-slate-950 flex items-center justify-center overflow-hidden min-h-[140px] max-h-80">
                  {isImg ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={f.url} alt={f.name} className="w-full h-full max-h-80 object-contain group-hover:scale-[1.01] transition-transform duration-250" />
                  ) : (
                    <span className="text-4xl py-6">📄</span>
                  )}
                  <button
                    type="button"
                    title="Eliminar archivo"
                    className="absolute top-2 right-2 h-7 w-7 flex items-center justify-center rounded-full bg-slate-950/85 hover:bg-red-600 text-white opacity-0 group-hover:opacity-100 transition-opacity shadow-lg text-sm font-bold"
                    onClick={(e) => {
                      e.stopPropagation();
                      onChange(files.filter((x) => x.id !== f.id));
                    }}
                  >
                    ✕
                  </button>
                </div>
                <div className="p-2 min-w-0 border-t border-slate-800 bg-slate-900/40 flex items-center justify-between gap-2">
                  <a
                    href={f.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block truncate text-xs text-slate-300 hover:text-white font-medium hover:underline flex-1"
                    title={f.name}
                  >
                    {f.name}
                  </a>
                  <a
                    href={f.url}
                    download
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] text-slate-500 hover:text-teal-400 font-semibold transition-colors whitespace-nowrap px-1"
                  >
                    Descargar ⇩
                  </a>
                </div>
              </div>
            )
          })}
        </div>
      )}
      
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => upload(e.target.files)}
      />
      
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-1.5 min-h-[110px] ${
          dragOver ? 'border-teal-400 bg-teal-950/20' : 'border-slate-800 bg-slate-900/30 hover:border-slate-700 hover:bg-slate-900/50'
        }`}
      >
        <span className="text-2xl text-slate-400">📤</span>
        <span className="text-xs text-slate-200 font-semibold">
          {uploading ? 'Subiendo archivos...' : 'Arrastrá tus archivos acá o hacé clic para subir'}
        </span>
        <span className="text-[10px] text-slate-500">Máximo 50MB por archivo</span>
      </div>
      
      {error && <p className="text-xs text-red-400 font-medium">{error}</p>}
    </div>
  )
}
