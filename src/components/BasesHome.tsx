'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Modal from './Modal'

const BASE_COLORS: Record<string, string> = {
  teal: 'from-teal-600/40 to-teal-900/40 border-teal-700/50',
  blue: 'from-blue-600/40 to-blue-900/40 border-blue-700/50',
  purple: 'from-purple-600/40 to-purple-900/40 border-purple-700/50',
  pink: 'from-pink-600/40 to-pink-900/40 border-pink-700/50',
  orange: 'from-orange-600/40 to-orange-900/40 border-orange-700/50',
  green: 'from-green-600/40 to-green-900/40 border-green-700/50',
}

const ICONS = ['📊', '📁', '📌', '🗂️', '🧭', '🏔️', '🌿', '🎯', '🛒', '🏨', '✈️', '💼']

type Base = {
  id: string
  name: string
  color: string
  icon: string
  ownerName: string
  mine: boolean
  tables: { id: string; name: string }[]
}

export default function BasesHome() {
  const router = useRouter()
  const [bases, setBases] = useState<Base[] | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [name, setName] = useState('')
  const [icon, setIcon] = useState('📊')
  const [color, setColor] = useState('teal')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function load() {
    const res = await fetch('/api/bases')
    if (res.ok) setBases((await res.json()).bases)
  }
  useEffect(() => {
    load()
  }, [])

  async function createBase(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    const res = await fetch('/api/bases', {
      method: 'POST',
      body: JSON.stringify({ name, icon, color }),
    })
    setSaving(false)
    const data = await res.json()
    if (!res.ok) {
      setError(data.error || 'Error al crear la base')
      return
    }
    router.push(`/base/${data.id}`)
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Mis bases</h1>
        <button className="btn-primary" onClick={() => setCreateOpen(true)}>
          + Nueva base
        </button>
      </div>

      {bases === null && <p className="text-slate-400">Cargando…</p>}

      {bases !== null && bases.length === 0 && (
        <div className="card p-10 text-center text-slate-400">
          <p className="mb-3 text-4xl">🌿</p>
          <p>Todavía no tenés bases. Creá la primera para empezar.</p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {bases?.map((b) => (
          <button
            key={b.id}
            onClick={() => router.push(`/base/${b.id}`)}
            className={`card border bg-gradient-to-br p-5 text-left transition-transform hover:scale-[1.02] ${
              BASE_COLORS[b.color] || BASE_COLORS.teal
            }`}
          >
            <div className="mb-2 flex items-center gap-3">
              <span className="text-3xl">{b.icon}</span>
              <div className="min-w-0">
                <div className="truncate font-semibold">{b.name}</div>
                <div className="text-xs text-slate-400">
                  {b.mine ? 'Tuya' : `De ${b.ownerName}`} · {b.tables.length} tabla
                  {b.tables.length === 1 ? '' : 's'}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {b.tables.slice(0, 4).map((t) => (
                <span
                  key={t.id}
                  className="rounded-md bg-slate-950/40 px-2 py-0.5 text-xs text-slate-300"
                >
                  {t.name}
                </span>
              ))}
            </div>
          </button>
        ))}
      </div>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Nueva base">
        <form onSubmit={createBase} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm text-slate-300">Nombre</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div>
            <label className="mb-1 block text-sm text-slate-300">Ícono</label>
            <div className="flex flex-wrap gap-1.5">
              {ICONS.map((i) => (
                <button
                  type="button"
                  key={i}
                  onClick={() => setIcon(i)}
                  className={`rounded-lg p-2 text-xl ${
                    icon === i ? 'bg-teal-600/40 ring-1 ring-teal-500' : 'hover:bg-slate-800'
                  }`}
                >
                  {i}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm text-slate-300">Color</label>
            <div className="flex gap-2">
              {Object.keys(BASE_COLORS).map((c) => (
                <button
                  type="button"
                  key={c}
                  onClick={() => setColor(c)}
                  className={`h-8 w-8 rounded-full bg-gradient-to-br ${BASE_COLORS[c]} border ${
                    color === c ? 'ring-2 ring-white/70' : ''
                  }`}
                />
              ))}
            </div>
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button type="submit" disabled={saving || !name.trim()} className="btn-primary w-full">
            {saving ? 'Creando…' : 'Crear base'}
          </button>
        </form>
      </Modal>
    </div>
  )
}
