'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useSession, signOut } from 'next-auth/react'
import Logo from './Logo'
import Avatar from './Avatar'
import Popover from './Popover'
import NotificationBell from './NotificationBell'

export default function TopBar() {
  const { data: session } = useSession()
  const user = session?.user as any
  const [menuOpen, setMenuOpen] = useState(false)

  async function handleLogout() {
    // redirect relativo al origin actual, nunca depender de NEXTAUTH_URL
    await signOut({ redirect: false })
    window.location.href = '/login'
  }

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-slate-800 bg-slate-950/90 px-3 backdrop-blur sm:px-5">
      <Link href="/" className="flex items-center gap-2 shrink-0">
        <Logo size={30} />
        <span className="hidden text-base font-semibold tracking-tight sm:block">
          Arrayán <span className="text-teal-400">Workflows</span>
        </span>
      </Link>
      <nav className="ml-2 flex items-center gap-1 text-sm sm:ml-6">
        <Link href="/" className="btn-ghost px-2 sm:px-3">
          Bases
        </Link>
        <Link href="/agenda" className="btn-ghost px-2 sm:px-3">
          Mi agenda
        </Link>
        {user?.role === 'admin' && (
          <Link href="/admin" className="btn-ghost px-2 sm:px-3">
            Usuarios
          </Link>
        )}
      </nav>
      <div className="ml-auto flex items-center gap-1">
        <NotificationBell />
        {user && (
          <div className="relative">
            <button onClick={() => setMenuOpen(!menuOpen)} className="flex items-center rounded-full p-1 hover:bg-slate-800">
              <Avatar name={user.name || ''} avatar={user.avatar} size={30} />
            </button>
            <Popover open={menuOpen} onClose={() => setMenuOpen(false)} align="right" className="w-56 p-2">
              <div className="border-b border-slate-800 px-3 py-2">
                <div className="font-medium">{user.name}</div>
                <div className="text-xs text-slate-400">@{user.username}</div>
              </div>
              <Link
                href="/profile"
                onClick={() => setMenuOpen(false)}
                className="mt-1 block rounded-lg px-3 py-2 text-sm hover:bg-slate-800"
              >
                Mi perfil
              </Link>
              <button
                onClick={handleLogout}
                className="block w-full rounded-lg px-3 py-2 text-left text-sm text-red-400 hover:bg-slate-800"
              >
                Cerrar sesión
              </button>
            </Popover>
          </div>
        )}
      </div>
    </header>
  )
}
