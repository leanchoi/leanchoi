'use client'

import { Field, ViewConfig } from '@/lib/fields'
import { Rec, cellValue } from './types'
import { CellCtx, CellValue } from './cells'

export default function GalleryView({
  rows,
  fields,
  config,
  ctx,
  canEdit,
  onOpenRecord,
  onAddRecord,
  onConfigChange,
}: {
  rows: Rec[]
  fields: Field[]
  config: ViewConfig
  ctx: CellCtx
  canEdit: boolean
  onOpenRecord: (id: string) => void
  onAddRecord: () => void
  onConfigChange: (c: ViewConfig) => void
}) {
  const attachFields = fields.filter((f) => f.type === 'attachment')
  const coverField = attachFields.find((f) => f.id === config.coverField) || attachFields[0]
  const visibleFields = fields
    .filter((f, i) => i === 0 || !(config.hidden || []).includes(f.id))
    .slice(0, 5)
  const primary = fields[0]

  return (
    <div className="flex-1 overflow-y-auto p-4">
      {attachFields.length > 1 && (
        <div className="mb-3 flex items-center gap-2 text-sm">
          <span className="text-slate-400">Portada</span>
          <select
            className="input !w-auto py-1"
            value={coverField?.id || ''}
            onChange={(e) => onConfigChange({ ...config, coverField: e.target.value })}
          >
            {attachFields.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {rows.map((r) => {
          const files: any[] = coverField ? cellValue(r, coverField) || [] : []
          const img = Array.isArray(files)
            ? files.find((f) => String(f.type || '').startsWith('image/'))
            : null
          return (
            <button
              key={r.id}
              onClick={() => onOpenRecord(r.id)}
              className="card overflow-hidden text-left transition-transform hover:scale-[1.02]"
            >
              <div className="flex h-36 items-center justify-center bg-slate-800/60">
                {img ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={img.url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-4xl opacity-30">🖼</span>
                )}
              </div>
              <div className="space-y-1.5 p-3">
                <div className="truncate font-medium">
                  {String(r.data[primary?.id] ?? '') || 'Sin nombre'}
                </div>
                {visibleFields.slice(1).map((f) => {
                  const v = cellValue(r, f)
                  if (v === null || v === undefined || v === '' || f.id === coverField?.id)
                    return null
                  return (
                    <div key={f.id} className="text-xs text-slate-400">
                      <span className="mr-1 text-slate-500">{f.name}:</span>
                      <CellValue field={f} value={v} ctx={ctx} />
                    </div>
                  )
                })}
              </div>
            </button>
          )
        })}
        {canEdit && (
          <button
            onClick={onAddRecord}
            className="flex min-h-52 items-center justify-center rounded-xl border border-dashed border-slate-700 text-slate-400 hover:bg-slate-900"
          >
            + Nuevo registro
          </button>
        )}
      </div>
      {rows.length === 0 && !canEdit && (
        <p className="py-10 text-center text-sm text-slate-500">No hay registros.</p>
      )}
    </div>
  )
}
