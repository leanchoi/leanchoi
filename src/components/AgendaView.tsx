'use client'

import { useEffect, useState } from 'react'

type Item = {
  recordId: string
  date: string
  title: string
  tableName: string
  baseName: string
  baseIcon: string
  fieldName: string
  assigned: boolean
  link: string
}

const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

function fmtDay(day: string) {
  const [y, m, d] = day.split('-')
  return `${d}/${m}/${y}`
}

export default function AgendaView() {
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [items, setItems] = useState<Item[] | null>(null)

  const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`

  useEffect(() => {
    setItems(null)
    fetch(`/api/agenda?month=${monthStr}`)
      .then((r) => r.json())
      .then((d) => setItems(d.items))
      .catch(() => setItems([]))
  }, [monthStr])

  const byDay = new Map<string, Item[]>()
  for (const it of items || []) {
    if (!byDay.has(it.date)) byDay.set(it.date, [])
    byDay.get(it.date)!.push(it)
  }
  const days = Array.from(byDay.keys()).sort()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

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
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">Mi agenda</h1>
        <div className="ml-auto flex items-center gap-1">
          <button className="btn-ghost px-2" onClick={prev}>←</button>
          <span className="min-w-36 text-center font-medium">
            {MONTHS[month]} {year}
          </span>
          <button className="btn-ghost px-2" onClick={next}>→</button>
        </div>
      </div>
      <p className="mb-5 text-sm text-slate-400">
        Registros con fecha de este mes que creaste o te asignaron, en todas tus bases.
      </p>

      {items === null && <p className="text-slate-400">Cargando…</p>}
      {items !== null && days.length === 0 && (
        <div className="card p-10 text-center text-slate-400">
          <p className="mb-2 text-3xl">🗓️</p>
          <p>Nada agendado para este mes.</p>
        </div>
      )}

      <div className="space-y-4">
        {days.map((day) => (
          <div key={day} className="card overflow-hidden">
            <div
              className={`border-b border-slate-800 px-4 py-2 text-sm font-semibold ${
                day === todayStr ? 'bg-teal-900/30 text-teal-300' : 'bg-slate-900 text-slate-300'
              }`}
            >
              {fmtDay(day)} {day === todayStr && '· Hoy'}
            </div>
            <div className="divide-y divide-slate-800/70">
              {byDay.get(day)!.map((it, i) => (
                <a
                  key={`${it.recordId}-${i}`}
                  href={it.link}
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-800/50"
                >
                  <span className="text-lg">{it.baseIcon}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{it.title}</span>
                    <span className="block text-xs text-slate-400">
                      {it.baseName} · {it.tableName} · {it.fieldName}
                    </span>
                  </span>
                  {it.assigned && (
                    <span className="rounded-full bg-teal-900/60 px-2 py-0.5 text-xs text-teal-300">
                      Asignado
                    </span>
                  )}
                </a>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
