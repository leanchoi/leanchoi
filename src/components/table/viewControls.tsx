'use client'

import { Field, Filter, Sort, ColorRule, ViewConfig, OPS_BY_TYPE, ROW_COLOR_CLASSES } from '@/lib/fields'
import { UserLite } from './types'

function FilterValueInput({
  field,
  value,
  onChange,
  users,
}: {
  field: Field
  value: any
  onChange: (v: any) => void
  users: UserLite[]
}) {
  if (field.type === 'select' || field.type === 'multiselect') {
    return (
      <select className="input py-1" value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
        <option value="">Elegir…</option>
        {(field.options?.choices || []).map((c: any) => (
          <option key={c.id} value={c.name}>
            {c.name}
          </option>
        ))}
      </select>
    )
  }
  if (field.type === 'user') {
    return (
      <select className="input py-1" value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
        <option value="">Elegir…</option>
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name}
          </option>
        ))}
      </select>
    )
  }
  if (['number', 'currency', 'percent', 'rating'].includes(field.type)) {
    return (
      <input
        type="number"
        step="any"
        className="input py-1"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
      />
    )
  }
  if (field.type === 'date' || field.type === 'createdtime') {
    return (
      <input
        type="date"
        className="input py-1"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
      />
    )
  }
  return (
    <input className="input py-1" value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
  )
}

export function FilterPanel({
  fields,
  config,
  onChange,
  users,
}: {
  fields: Field[]
  config: ViewConfig
  onChange: (c: ViewConfig) => void
  users: UserLite[]
}) {
  const filters = config.filters || []
  function update(filters: Filter[]) {
    onChange({ ...config, filters })
  }
  return (
    <div className="w-[340px] max-w-[90vw] p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Filtros</p>
      {filters.length === 0 && (
        <p className="mb-2 text-sm text-slate-500">Sin filtros: se muestran todos los registros.</p>
      )}
      {filters.length > 1 && (
        <div className="mb-2 flex items-center gap-2 text-sm">
          <span className="text-slate-400">Cumplir</span>
          <select
            className="input w-auto py-1"
            value={config.conjunction || 'and'}
            onChange={(e) => onChange({ ...config, conjunction: e.target.value as any })}
          >
            <option value="and">todas las condiciones</option>
            <option value="or">alguna condición</option>
          </select>
        </div>
      )}
      <div className="space-y-2">
        {filters.map((f, i) => {
          const field = fields.find((x) => x.id === f.fieldId)
          const ops = field ? OPS_BY_TYPE[field.type] || [] : []
          const opMeta = ops.find((o) => o.op === f.op)
          return (
            <div key={i} className="space-y-1 rounded-lg border border-slate-800 p-2">
              <div className="flex items-center gap-1.5">
                <select
                  className="input flex-1 py-1"
                  value={f.fieldId}
                  onChange={(e) => {
                    const nf = fields.find((x) => x.id === e.target.value)
                    const next = [...filters]
                    next[i] = {
                      fieldId: e.target.value,
                      op: nf ? (OPS_BY_TYPE[nf.type] || [])[0]?.op || 'eq' : 'eq',
                      value: '',
                    }
                    update(next)
                  }}
                >
                  {fields.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
                </select>
                <button
                  className="btn-ghost px-1.5 py-1 text-red-400"
                  onClick={() => update(filters.filter((_, j) => j !== i))}
                >
                  ✕
                </button>
              </div>
              <div className="flex items-center gap-1.5">
                <select
                  className="input flex-1 py-1"
                  value={f.op}
                  onChange={(e) => {
                    const next = [...filters]
                    next[i] = { ...f, op: e.target.value as any }
                    update(next)
                  }}
                >
                  {ops.map((o) => (
                    <option key={o.op} value={o.op}>
                      {o.label}
                    </option>
                  ))}
                </select>
                {field && opMeta?.needsValue && (
                  <div className="flex-1">
                    <FilterValueInput
                      field={field}
                      value={f.value}
                      onChange={(v) => {
                        const next = [...filters]
                        next[i] = { ...f, value: v }
                        update(next)
                      }}
                      users={users}
                    />
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
      <button
        className="btn-ghost mt-2 w-full border border-dashed border-slate-700 py-1.5 text-sm"
        onClick={() => {
          const first = fields[0]
          if (!first) return
          update([
            ...filters,
            { fieldId: first.id, op: (OPS_BY_TYPE[first.type] || [])[0]?.op || 'eq', value: '' },
          ])
        }}
      >
        + Agregar filtro
      </button>
    </div>
  )
}

export function SortPanel({
  fields,
  config,
  onChange,
}: {
  fields: Field[]
  config: ViewConfig
  onChange: (c: ViewConfig) => void
}) {
  const sorts = config.sorts || []
  function update(sorts: Sort[]) {
    onChange({ ...config, sorts })
  }
  return (
    <div className="w-72 p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Orden</p>
      {sorts.length === 0 && <p className="mb-2 text-sm text-slate-500">Sin orden definido.</p>}
      <div className="space-y-1.5">
        {sorts.map((s, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <select
              className="input flex-1 py-1"
              value={s.fieldId}
              onChange={(e) => {
                const next = [...sorts]
                next[i] = { ...s, fieldId: e.target.value }
                update(next)
              }}
            >
              {fields.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
            <select
              className="input w-24 py-1"
              value={s.dir}
              onChange={(e) => {
                const next = [...sorts]
                next[i] = { ...s, dir: e.target.value as any }
                update(next)
              }}
            >
              <option value="asc">A → Z</option>
              <option value="desc">Z → A</option>
            </select>
            <button
              className="btn-ghost px-1.5 py-1 text-red-400"
              onClick={() => update(sorts.filter((_, j) => j !== i))}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
      <button
        className="btn-ghost mt-2 w-full border border-dashed border-slate-700 py-1.5 text-sm"
        onClick={() => fields[0] && update([...sorts, { fieldId: fields[0].id, dir: 'asc' }])}
      >
        + Agregar orden
      </button>
    </div>
  )
}

export function HidePanel({
  fields,
  config,
  onChange,
}: {
  fields: Field[]
  config: ViewConfig
  onChange: (c: ViewConfig) => void
}) {
  const hidden = config.hidden || []
  return (
    <div className="w-64 p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
        Campos visibles
      </p>
      <div className="max-h-64 space-y-0.5 overflow-y-auto">
        {fields.map((f, i) => {
          const isHidden = hidden.includes(f.id)
          return (
            <button
              key={f.id}
              disabled={i === 0}
              className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-sm hover:bg-slate-800 disabled:opacity-50"
              onClick={() =>
                onChange({
                  ...config,
                  hidden: isHidden ? hidden.filter((h) => h !== f.id) : [...hidden, f.id],
                })
              }
            >
              <span className="truncate">{f.name}</span>
              <span className={isHidden ? 'text-slate-600' : 'text-teal-400'}>
                {isHidden ? '○' : '●'}
              </span>
            </button>
          )
        })}
      </div>
      <p className="mt-2 text-xs text-slate-500">El primer campo siempre es visible.</p>
    </div>
  )
}

export function GroupPanel({
  fields,
  config,
  onChange,
}: {
  fields: Field[]
  config: ViewConfig
  onChange: (c: ViewConfig) => void
}) {
  const groupable = fields.filter((f) =>
    ['select', 'user', 'checkbox', 'text', 'multiselect'].includes(f.type)
  )
  return (
    <div className="w-64 p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
        Agrupar por
      </p>
      <select
        className="input"
        value={config.groupBy ?? ''}
        onChange={(e) => onChange({ ...config, groupBy: e.target.value || null })}
      >
        <option value="">Sin agrupar</option>
        {groupable.map((f) => (
          <option key={f.id} value={f.id}>
            {f.name}
          </option>
        ))}
      </select>
    </div>
  )
}

export function ColorPanel({
  fields,
  config,
  onChange,
  users,
}: {
  fields: Field[]
  config: ViewConfig
  onChange: (c: ViewConfig) => void
  users: UserLite[]
}) {
  const rules = config.colorRules || []
  function update(colorRules: ColorRule[]) {
    onChange({ ...config, colorRules })
  }
  return (
    <div className="w-[340px] max-w-[90vw] p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
        Color de registros
      </p>
      <p className="mb-2 text-xs text-slate-500">
        Cada registro toma el color de la primera regla que cumple.
      </p>
      <div className="space-y-2">
        {rules.map((r, i) => {
          const field = fields.find((x) => x.id === r.fieldId)
          const ops = field ? OPS_BY_TYPE[field.type] || [] : []
          const opMeta = ops.find((o) => o.op === r.op)
          return (
            <div key={i} className="space-y-1 rounded-lg border border-slate-800 p-2">
              <div className="flex items-center gap-1.5">
                <div className="flex gap-1">
                  {Object.keys(ROW_COLOR_CLASSES).map((c) => (
                    <button
                      key={c}
                      title={c}
                      className={`h-4 w-4 rounded-full ${ROW_COLOR_CLASSES[c].dot} ${
                        r.color === c ? 'ring-2 ring-white/80' : 'opacity-60 hover:opacity-100'
                      }`}
                      onClick={() => {
                        const next = [...rules]
                        next[i] = { ...r, color: c }
                        update(next)
                      }}
                    />
                  ))}
                </div>
                <button
                  className="btn-ghost ml-auto px-1.5 py-1 text-red-400"
                  onClick={() => update(rules.filter((_, j) => j !== i))}
                >
                  ✕
                </button>
              </div>
              <div className="flex items-center gap-1.5">
                <select
                  className="input flex-1 py-1"
                  value={r.fieldId}
                  onChange={(e) => {
                    const nf = fields.find((x) => x.id === e.target.value)
                    const next = [...rules]
                    next[i] = {
                      ...r,
                      fieldId: e.target.value,
                      op: nf ? (OPS_BY_TYPE[nf.type] || [])[0]?.op || 'eq' : 'eq',
                      value: '',
                    }
                    update(next)
                  }}
                >
                  {fields.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
                </select>
                <select
                  className="input flex-1 py-1"
                  value={r.op}
                  onChange={(e) => {
                    const next = [...rules]
                    next[i] = { ...r, op: e.target.value as any }
                    update(next)
                  }}
                >
                  {ops.map((o) => (
                    <option key={o.op} value={o.op}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              {field && opMeta?.needsValue && (
                <FilterValueInput
                  field={field}
                  value={r.value}
                  onChange={(v) => {
                    const next = [...rules]
                    next[i] = { ...r, value: v }
                    update(next)
                  }}
                  users={users}
                />
              )}
            </div>
          )
        })}
      </div>
      <button
        className="btn-ghost mt-2 w-full border border-dashed border-slate-700 py-1.5 text-sm"
        onClick={() => {
          const first = fields[0]
          if (!first) return
          update([
            ...rules,
            {
              color: 'teal',
              fieldId: first.id,
              op: (OPS_BY_TYPE[first.type] || [])[0]?.op || 'eq',
              value: '',
            },
          ])
        }}
      >
        + Agregar regla
      </button>
    </div>
  )
}
