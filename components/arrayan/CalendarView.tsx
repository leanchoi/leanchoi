'use client'

import { useState } from 'react'
import { Field, ViewConfig, ROW_COLOR_CLASSES } from '@/lib/fields'
import { Rec, cellValue } from './types'
import { rowColor } from './applyView'
import { CellCtx } from './cells'

const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]
const DAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

export function monthMatrix(year: number, month: number) {
  const first = new Date(year, month, 1)
  const startOffset = (first.getDay() + 6) % 7 // lunes = 0
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: (string | null)[] = []
  for (let i = 0; i < startOffset; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(`${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
  }
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

export default function CalendarView({
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
  const dateField = dateFields.find((f) => f.id === config.dateField) || dateFields[0]
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const primary = fields[0]

  if (!dateField) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-center text-slate-400">
        <div>
          <p className="mb-2 text-3xl">📅</p>
          <p>Para usar el calendario, la tabla necesita un campo de tipo “Fecha”.</p>
        </div>
      </div>
    )
  }

  const cells = monthMatrix(year, month)
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
    today.getDate()
  ).padStart(2, '0')}`

  function recordsOn(day: string) {
    return rows.filter((r) => String(cellValue(r, dateField!) ?? '').slice(0, 10) === day)
  }

  function prev() {
    if (month === 0) {
      setMonth(11)
      setYear(year - 1)
    } else setMonth(month - 1)
  }
  function next() {
    if (month === 11) {
      setMonth(0)
      setYear(year + 1)
    } else setMonth(month + 1)
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 px-4 py-2">
        <button className="btn-ghost px-2" onClick={prev}>
          ←
        </button>
        <span className="min-w-40 text-center font-semibold">
          {MONTHS[month]} {year}
        </span>
        <button className="btn-ghost px-2" onClick={next}>
          →
        </button>
        <button
          className="btn-ghost text-teal-400"
          onClick={() => {
            setYear(today.getFullYear())
            setMonth(today.getMonth())
          }}
        >
          Hoy
        </button>
        {dateFields.length > 1 && (
          <select
            className="input ml-auto !w-auto py-1 text-sm"
            value={dateField.id}
            onChange={(e) => onConfigChange({ ...config, dateField: e.target.value })}
          >
            {dateFields.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        )}
      </div>
      <div className="flex-1 overflow-auto p-2 sm:p-4">
        <div className="grid min-w-[640px] grid-cols-7 gap-px overflow-hidden rounded-xl border border-slate-800 bg-slate-800">
          {DAYS.map((d) => (
            <div key={d} className="bg-slate-900 px-2 py-1.5 text-center text-xs font-semibold uppercase text-slate-400">
              {d}
            </div>
          ))}
          {cells.map((day, i) => (
            <div
              key={i}
              className={`group min-h-24 bg-slate-950 p-1 ${day ? '' : 'opacity-40'}`}
            >
              {day && (
                <>
                  <div className="flex items-center justify-between px-1">
                    <span
                      className={`text-xs ${
                        day === todayStr
                          ? 'flex h-5 w-5 items-center justify-center rounded-full bg-teal-500 font-bold text-slate-950'
                          : 'text-slate-500'
                      }`}
                    >
                      {Number(day.slice(8))}
                    </span>
                    {canEdit && (
                      <button
                        title="Crear registro este día" aria-label="Crear registro este día"
                        className="hidden rounded px-1 text-xs text-teal-400 hover:bg-slate-800 group-hover:block"
                        onClick={() => onAddRecord({ [dateField!.id]: day })}
                      >
                        +
                      </button>
                    )}
                  </div>
                  <div className="mt-0.5 space-y-0.5">
                    {recordsOn(day).map((r) => {
                      const color = rowColor(r, fields, config) || 'teal'
                      return (
                        <button
                          key={r.id}
                          onClick={() => onOpenRecord(r.id)}
                          className={`block w-full truncate rounded px-1.5 py-0.5 text-left text-xs ${
                            ROW_COLOR_CLASSES[color]?.row || ''
                          } border-l-2 hover:brightness-125`}
                        >
                          {String(r.data[primary?.id] ?? '') || 'Sin nombre'}
                        </button>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
