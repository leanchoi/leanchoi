'use client'

import { useEffect, useState, useCallback } from 'react'
import Popover from './Popover'
import Avatar from './Avatar'

type Notif = {
  id: string
  type: string
  body: string
  link: string | null
  read: number
  created_at: string
  actor_name: string | null
  actor_avatar: string | null
}

function timeAgo(iso: string) {
  const d = new Date(iso.includes('T') ? iso : iso + 'Z')
  const s = Math.floor((Date.now() - d.getTime()) / 1000)
  if (s < 60) return 'recién'
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`
  return `hace ${Math.floor(s / 86400)} d`
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<Notif[]>([])
  const [unread, setUnread] = useState(0)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications')
      if (!res.ok) return
      const data = await res.json()
      setItems(data.notifications)
      setUnread(data.unread)
    } catch {}
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(load, 30000)
    return () => clearInterval(t)
  }, [load])

  async function markAllRead() {
    await fetch('/api/notifications', { method: 'PATCH', body: JSON.stringify({}) })
    load()
  }

  async function openNotif(n: Notif) {
    await fetch('/api/notifications', { method: 'PATCH', body: JSON.stringify({ id: n.id }) })
    setOpen(false)
    if (n.link) window.location.href = n.link
    else load()
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="btn-ghost relative px-2 py-2"
        title="Notificaciones"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-teal-500 px-1 text-[10px] font-bold text-slate-950">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      <Popover open={open} onClose={() => setOpen(false)} align="right" className="w-80 sm:w-96">
        <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
          <span className="font-semibold">Notificaciones</span>
          {unread > 0 && (
            <button onClick={markAllRead} className="text-xs text-teal-400 hover:underline">
              Marcar todas leídas
            </button>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {items.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-slate-500">
              No tenés notificaciones
            </div>
          )}
          {items.map((n) => (
            <button
              key={n.id}
              onClick={() => openNotif(n)}
              className={`flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-slate-800/60 ${
                n.read ? 'opacity-60' : ''
              }`}
            >
              <Avatar name={n.actor_name || 'Sistema'} avatar={n.actor_avatar} size={30} />
              <span className="flex-1 text-sm">
                {n.body}
                <span className="mt-0.5 block text-xs text-slate-500">{timeAgo(n.created_at)}</span>
              </span>
              {!n.read && <span className="mt-1.5 h-2 w-2 rounded-full bg-teal-400" />}
            </button>
          ))}
        </div>
      </Popover>
    </div>
  )
}
