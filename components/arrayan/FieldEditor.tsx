'use client'

import { useState } from 'react'
import { Field, FIELD_TYPES, FieldType, CHOICE_COLORS, CHOICE_COLOR_CLASSES } from '@/lib/fields'

const SOLID_COLOR_CLASSES: Record<string, string> = {
  red: 'bg-red-500 border-red-400',
  orange: 'bg-orange-500 border-orange-400',
  amber: 'bg-amber-500 border-amber-400',
  yellow: 'bg-yellow-500 border-yellow-400',
  lime: 'bg-lime-500 border-lime-400',
  green: 'bg-green-500 border-green-400',
  emerald: 'bg-emerald-500 border-emerald-400',
  teal: 'bg-teal-500 border-teal-400',
  cyan: 'bg-cyan-500 border-cyan-400',
  sky: 'bg-sky-500 border-sky-400',
  blue: 'bg-blue-500 border-blue-400',
  indigo: 'bg-indigo-500 border-indigo-400',
  violet: 'bg-violet-500 border-violet-400',
  purple: 'bg-purple-500 border-purple-400',
  fuchsia: 'bg-fuchsia-500 border-fuchsia-400',
  pink: 'bg-pink-500 border-pink-400',
  rose: 'bg-rose-500 border-rose-400',
  slate: 'bg-slate-500 border-slate-400',
  stone: 'bg-stone-500 border-stone-400',
  zinc: 'bg-zinc-500 border-zinc-400',
  neutral: 'bg-neutral-500 border-neutral-400',
  gray: 'bg-slate-500 border-slate-400',
}

function newChoiceId() {
  return Math.random().toString(36).slice(2, 10)
}

// Editor de campo: crear o modificar nombre, tipo y opciones
export default function FieldEditor({
  tableId,
  field,
  baseTables,
  onDone,
  onDelete,
}: {
  tableId: string
  field?: Field // undefined = crear
  baseTables: { id: string; name: string }[]
  onDone: () => void
  onDelete?: () => void
}) {
  const [name, setName] = useState(field?.name || '')
  const [type, setType] = useState<FieldType>(field?.type || 'text')
  const [options, setOptions] = useState<any>(field?.options ? { ...field.options } : {})
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [typeOpen, setTypeOpen] = useState(!field)

  const typeMeta = FIELD_TYPES.find((t) => t.type === type)

  async function save() {
    setError('')
    if (!name.trim()) {
      setError('Poné un nombre al campo')
      return
    }
    if (type === 'link' && !options.tableId) {
      setError('Elegí la tabla a vincular')
      return
    }
    setSaving(true)
    const res = field
      ? await fetch(`/api/fields/${field.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ name, type, options }),
        })
      : await fetch(`/api/tables/${tableId}/fields`, {
          method: 'POST',
          body: JSON.stringify({ name, type, options }),
        })
    setSaving(false)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error || 'Error al guardar')
      return
    }
    onDone()
  }

  function setChoices(choices: any[]) {
    setOptions({ ...options, choices })
  }
  const choices: any[] = options.choices || []

  return (
    <div className="w-72 p-3">
      <input
        className="input mb-2"
        placeholder="Nombre del campo"
        value={name}
        autoFocus
        onChange={(e) => setName(e.target.value)}
      />

      <button
        type="button"
        className="mb-2 flex w-full items-center justify-between rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm hover:border-slate-600"
        onClick={() => setTypeOpen(!typeOpen)}
      >
        <span>
          <span className="mr-2 inline-block w-4 text-center text-teal-400">{typeMeta?.icon}</span>
          {typeMeta?.label}
        </span>
        <span className="text-slate-500">▾</span>
      </button>

      {typeOpen && (
        <div className="mb-2 max-h-52 overflow-y-auto rounded-lg border border-slate-800 bg-slate-950/60 p-1">
          {FIELD_TYPES.map((t) => (
            <button
              key={t.type}
              type="button"
              className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-slate-800 ${
                t.type === type ? 'bg-slate-800 text-teal-300' : ''
              }`}
              onClick={() => {
                setType(t.type)
                setTypeOpen(false)
                if ((t.type === 'select' || t.type === 'multiselect') && !options.choices) {
                  setOptions({ ...options, choices: [] })
                }
              }}
            >
              <span className="inline-block w-4 text-center text-teal-400">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>
      )}

      {(type === 'select' || type === 'multiselect') && (
        <div className="mb-2 space-y-1">
          <p className="text-xs font-medium text-slate-400">Opciones</p>
          {choices.map((c, i) => (
            <div key={c.id} className="flex items-center gap-1.5">
              <button
                type="button"
                title="Cambiar color" aria-label="Cambiar color"
                className={`h-5 w-5 shrink-0 rounded-full border ${SOLID_COLOR_CLASSES[c.color] || 'bg-slate-500 border-slate-400'}`}
                onClick={() => {
                  const next = [...choices]
                  const idx = CHOICE_COLORS.indexOf(c.color)
                  next[i] = { ...c, color: CHOICE_COLORS[(idx + 1) % CHOICE_COLORS.length] }
                  setChoices(next)
                }}
              />
              <input
                className="input py-1"
                value={c.name}
                onChange={(e) => {
                  const next = [...choices]
                  next[i] = { ...c, name: e.target.value }
                  setChoices(next)
                }}
              />
              <button
                type="button"
                className="btn-ghost px-1.5 py-1 text-red-400"
                onClick={() => setChoices(choices.filter((x) => x.id !== c.id))}
              >
                ✕
              </button>
            </div>
          ))}
          <button
            type="button"
            className="btn-ghost w-full border border-dashed border-slate-700 py-1 text-xs"
            onClick={() =>
              setChoices([
                ...choices,
                {
                  id: newChoiceId(),
                  name: `Opción ${choices.length + 1}`,
                  color: CHOICE_COLORS[choices.length % CHOICE_COLORS.length],
                },
              ])
            }
          >
            + Agregar opción
          </button>
        </div>
      )}

      {type === 'currency' && (
        <div className="mb-2">
          <p className="mb-1 text-xs font-medium text-slate-400">Símbolo</p>
          <input
            className="input"
            value={options.symbol ?? '$'}
            onChange={(e) => setOptions({ ...options, symbol: e.target.value })}
          />
        </div>
      )}

      {type === 'rating' && (
        <div className="mb-2">
          <p className="mb-1 text-xs font-medium text-slate-400">Máximo de estrellas</p>
          <select
            className="input"
            value={options.max ?? 5}
            onChange={(e) => setOptions({ ...options, max: Number(e.target.value) })}
          >
            {[3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
      )}

      {type === 'date' && (
        <label className="mb-2 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={!!options.includeTime}
            onChange={(e) => setOptions({ ...options, includeTime: e.target.checked })}
          />
          Incluir hora
        </label>
      )}

      {type === 'user' && (
        <label className="mb-2 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={options.multiple !== false}
            onChange={(e) => setOptions({ ...options, multiple: e.target.checked })}
          />
          Permitir varias personas
        </label>
      )}

      {type === 'link' && (
        <div className="mb-2">
          <p className="mb-1 text-xs font-medium text-slate-400">Tabla a vincular</p>
          <select
            className="input"
            value={options.tableId ?? ''}
            onChange={(e) => setOptions({ ...options, tableId: e.target.value })}
          >
            <option value="">Elegir tabla…</option>
            {baseTables.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {error && <p className="mb-2 text-xs text-red-400">{error}</p>}
      <div className="flex gap-2">
        {field && onDelete && (
          <button type="button" className="btn-ghost text-red-400" onClick={onDelete}>
            Borrar
          </button>
        )}
        <button type="button" className="btn-primary ml-auto" disabled={saving} onClick={save}>
          {saving ? 'Guardando…' : field ? 'Guardar' : 'Crear campo'}
        </button>
      </div>
    </div>
  )
}
