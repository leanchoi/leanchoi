'use client'

import { useState } from 'react'
import { Field, ViewConfig } from '@/lib/fields'

const PUBLIC_TYPES = [
  'text', 'longtext', 'number', 'currency', 'percent', 'rating', 'checkbox',
  'select', 'multiselect', 'date', 'url', 'email', 'phone',
]

export default function FormDesigner({
  fields,
  config,
  canEdit,
  onConfigChange,
}: {
  fields: Field[]
  config: ViewConfig
  canEdit: boolean
  onConfigChange: (c: ViewConfig) => void
}) {
  const form = config.form || { title: '', description: '', fields: [], shareToken: '', enabled: false }
  const [copied, setCopied] = useState(false)
  const eligible = fields.filter((f) => PUBLIC_TYPES.includes(f.type))
  const included = form.fields || []

  function setForm(patch: any) {
    onConfigChange({ ...config, form: { ...form, ...patch } })
  }

  function toggleField(fieldId: string) {
    const exists = included.find((x) => x.fieldId === fieldId)
    setForm({
      fields: exists
        ? included.filter((x) => x.fieldId !== fieldId)
        : [...included, { fieldId, required: false }],
    })
  }

  const shareUrl =
    typeof window !== 'undefined' && form.shareToken
      ? `${window.location.origin}/form/${form.shareToken}`
      : ''

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4 lg:flex-row">
      <div className="card w-full shrink-0 p-4 lg:w-80">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Campos del formulario
        </p>
        <div className="space-y-1">
          {eligible.map((f) => {
            const inc = included.find((x) => x.fieldId === f.id)
            return (
              <div key={f.id} className="rounded-lg border border-slate-800 px-2 py-1.5">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    disabled={!canEdit}
                    checked={!!inc}
                    onChange={() => toggleField(f.id)}
                  />
                  <span className="flex-1 truncate">{f.name}</span>
                </label>
                {inc && (
                  <label className="mt-1 flex items-center gap-2 pl-6 text-xs text-slate-400">
                    <input
                      type="checkbox"
                      disabled={!canEdit}
                      checked={!!inc.required}
                      onChange={(e) =>
                        setForm({
                          fields: included.map((x) =>
                            x.fieldId === f.id ? { ...x, required: e.target.checked } : x
                          ),
                        })
                      }
                    />
                    Obligatorio
                  </label>
                )}
              </div>
            )
          })}
          {eligible.length === 0 && (
            <p className="text-sm text-slate-500">No hay campos compatibles con formularios.</p>
          )}
        </div>

        <div className="mt-4 border-t border-slate-800 pt-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              disabled={!canEdit}
              checked={!!form.enabled}
              onChange={(e) => setForm({ enabled: e.target.checked })}
            />
            Formulario público activo
          </label>
          {form.enabled && shareUrl && (
            <div className="mt-2">
              <p className="mb-1 text-xs text-slate-400">Link para compartir:</p>
              <div className="flex gap-1.5">
                <input className="input flex-1 py-1 text-xs" readOnly value={shareUrl} />
                <button
                  className="btn-primary px-2 py-1 text-xs"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(shareUrl)
                      setCopied(true)
                      setTimeout(() => setCopied(false), 1500)
                    } catch {}
                  }}
                >
                  {copied ? '✓' : 'Copiar'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="card mx-auto w-full max-w-xl flex-1 p-6">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Vista previa
        </p>
        <input
          className="mb-2 w-full bg-transparent text-2xl font-bold outline-none placeholder-slate-600"
          placeholder="Título del formulario"
          readOnly={!canEdit}
          value={form.title || ''}
          onChange={(e) => setForm({ title: e.target.value })}
        />
        <textarea
          className="mb-4 w-full resize-none bg-transparent text-sm text-slate-300 outline-none placeholder-slate-600"
          placeholder="Descripción (opcional)"
          readOnly={!canEdit}
          value={form.description || ''}
          onChange={(e) => setForm({ description: e.target.value })}
        />
        <div className="space-y-4">
          {included.map((inc) => {
            const f = fields.find((x) => x.id === inc.fieldId)
            if (!f) return null
            return (
              <div key={f.id}>
                <p className="mb-1 text-sm font-medium">
                  {f.name} {inc.required && <span className="text-red-400">*</span>}
                </p>
                <div className="input pointer-events-none h-9 opacity-60" />
              </div>
            )
          })}
          {included.length === 0 && (
            <p className="text-sm text-slate-500">
              Marcá campos a la izquierda para armar el formulario.
            </p>
          )}
        </div>
        <button className="btn-primary pointer-events-none mt-5 opacity-60">Enviar</button>
      </div>
    </div>
  )
}
