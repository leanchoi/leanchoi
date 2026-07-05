'use client'

import { useMemo } from 'react'
import { Field, ViewConfig, ROW_COLOR_CLASSES } from '@/lib/fields'
import { Rec, cellValue } from './types'
import { rowColor } from './applyView'
import { CellCtx } from './cells'

const DAY_W = 30
const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

const BAR_COLORS: Record<string, string> = {
  teal: 'from-teal-500 to-teal-600',
  blue: 'from-blue-500 to-blue-600',
  purple: 'from-purple-500 to-purple-600',
  pink: 'from-pink-500 to-pink-600',
  red: 'from-red-500 to-red-600',
  orange: 'from-orange-500 to-orange-600',
  yellow: 'from-yellow-500 to-yellow-600',
  green: 'from-green-500 to-green-600',
  gray: 'from-slate-500 to-slate-600',
}

function toDate(s: string): Date {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d)
}
function addDays(d: Date, n: number) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
}
function diffDays(a: Date, b: Date) {
  return Math.round((b.getTime() - a.getTime()) / 86400000)
}
function fmt(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function GanttView({
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
  onAddRecord: (initial?: any) => void
  onConfigChange: (c: ViewConfig) => void
}) {
  const dateFields = fields.filter((f) => f.type === 'date')
  const startField = dateFields.find((f) => f.id === config.startField) || dateFields[0]
  const endField =
    dateFields.find((f) => f.id === config.endField) || dateFields[1] || startField
  const primary = fields[0]

  const data = useMemo(() => {
    if (!startField) return null
    const items = rows.map((r) => {
      const sRaw = cellValue(r, startField)
      const eRaw = endField ? cellValue(r, endField) : null
      let start = sRaw ? toDate(String(sRaw)) : null
      let end = eRaw ? toDate(String(eRaw)) : start
      if (!start && end) start = end
      if (start && end && end < start) [start, end] = [end, start]
      return { rec: r, start, end: end || start }
    })
    const dated = items.filter((i) => i.start)
    const today = new Date()
    const min = dated.length
      ? new Date(Math.min(...dated.map((i) => i.start!.getTime()), today.getTime()))
      : addDays(today, -7)
    const max = dated.length
      ? new Date(Math.max(...dated.map((i) => i.end!.getTime()), today.getTime()))
      : addDays(today, 21)
    const rangeStart = addDays(min, -4)
    const rangeEnd = addDays(max, 10)
    const totalDays = diffDays(rangeStart, rangeEnd) + 1
    const days: Date[] = []
    for (let i = 0; i < totalDays; i++) days.push(addDays(rangeStart, i))
    // agrupar días por mes para el header
    const monthSpans: { label: string; count: number }[] = []
    for (const d of days) {
      const label = `${MONTHS[d.getMonth()]} ${d.getFullYear()}`
      const last = monthSpans[monthSpans.length - 1]
      if (last && last.label === label) last.count++
      else monthSpans.push({ label, count: 1 })
    }
    return { items, rangeStart, days, monthSpans, todayStr: fmt(today) }
  }, [rows, startField, endField])

  if (!startField || !data) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-center text-slate-400">
        <div>
          <p className="mb-2 text-3xl">📊</p>
          <p>Para usar Gantt, la tabla necesita al menos un campo de tipo “Fecha”.</p>
          <p className="mt-1 text-sm text-slate-500">
            Ideal: dos campos (inicio y fin) para ver barras de duración.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 px-4 py-2 text-sm">
        <span className="text-slate-400">Inicio</span>
        <select
          className="input !w-auto py-1"
          value={startField.id}
          onChange={(e) => onConfigChange({ ...config, startField: e.target.value })}
        >
          {dateFields.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
        <span className="text-slate-400">Fin</span>
        <select
          className="input !w-auto py-1"
          value={endField?.id || startField.id}
          onChange={(e) => onConfigChange({ ...config, endField: e.target.value })}
        >
          {dateFields.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
        {canEdit && (
          <button className="btn-ghost ml-auto text-teal-300" onClick={() => onAddRecord()}>
            + Registro
          </button>
        )}
      </div>

      <div className="flex-1 overflow-auto">
        <div className="w-max min-w-full">
          {/* header: meses + días */}
          <div className="sticky top-0 z-20 bg-slate-950">
            <div className="flex">
              <div className="sticky left-0 z-10 w-44 shrink-0 border-b border-r border-slate-800 bg-slate-950 sm:w-56" />
              <div className="flex">
                {data.monthSpans.map((m, i) => (
                  <div
                    key={i}
                    style={{ width: m.count * DAY_W }}
                    className="border-b border-r border-slate-800 px-2 py-1 text-xs font-semibold text-slate-300"
                  >
                    {m.label}
                  </div>
                ))}
              </div>
            </div>
            <div className="flex">
              <div className="sticky left-0 z-10 w-44 shrink-0 border-b border-r border-slate-800 bg-slate-950 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-500 sm:w-56">
                Registro
              </div>
              <div className="flex">
                {data.days.map((d) => {
                  const weekend = d.getDay() === 0 || d.getDay() === 6
                  const isToday = fmt(d) === data.todayStr
                  return (
                    <div
                      key={d.getTime()}
                      style={{ width: DAY_W }}
                      className={`border-b border-r border-slate-800/60 py-1 text-center text-[10px] ${
                        isToday
                          ? 'bg-teal-500/20 font-bold text-teal-300'
                          : weekend
                            ? 'bg-slate-900/60 text-slate-600'
                            : 'text-slate-500'
                      }`}
                    >
                      {d.getDate()}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* filas */}
          {data.items.map(({ rec, start, end }) => {
            const color = rowColor(rec, fields, config) || 'teal'
            const title = String(rec.data[primary?.id] ?? '') || 'Sin nombre'
            const left = start ? diffDays(data.rangeStart, start) * DAY_W : 0
            const width = start && end ? (diffDays(start, end) + 1) * DAY_W - 6 : 0
            return (
              <div key={rec.id} className="flex hover:bg-slate-800/30">
                <button
                  onClick={() => onOpenRecord(rec.id)}
                  className="sticky left-0 z-10 w-44 shrink-0 truncate border-b border-r border-slate-800 bg-slate-950 px-3 py-2 text-left text-sm hover:text-teal-300 sm:w-56"
                >
                  {title}
                </button>
                <div
                  className="relative border-b border-slate-800/60"
                  style={{ width: data.days.length * DAY_W, minHeight: 36 }}
                >
                  {/* línea de hoy */}
                  <div
                    className="absolute bottom-0 top-0 w-px bg-teal-400/50"
                    style={{ left: (diffDays(data.rangeStart, toDate(data.todayStr)) + 0.5) * DAY_W }}
                  />
                  {start ? (
                    <button
                      onClick={() => onOpenRecord(rec.id)}
                      title={title}
                      className={`absolute top-1.5 h-6 rounded-lg bg-gradient-to-b shadow-md transition-transform hover:scale-y-110 ${
                        BAR_COLORS[color] || BAR_COLORS.teal
                      }`}
                      style={{ left: left + 3, width: Math.max(width, DAY_W - 6) }}
                    />
                  ) : (
                    <span className="absolute left-2 top-2 rounded-full bg-slate-800 px-2 py-0.5 text-[10px] text-slate-500">
                      sin fecha
                    </span>
                  )}
                </div>
              </div>
            )
          })}
          {data.items.length === 0 && (
            <p className="px-4 py-10 text-center text-sm text-slate-500">
              No hay registros que cumplan los filtros.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
