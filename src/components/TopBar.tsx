'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useSession, signOut } from 'next-auth/react'
import Logo from './Logo'
import Avatar from './Avatar'
import Popover from './Popover'
import NotificationBell from './NotificationBell'
import ThemeToggle from './ThemeToggle'

export default function TopBar() {
  const { data: session } = useSession()
  const user = session?.user as any
  const [menuOpen, setMenuOpen] = useState(false)
  const [navOpen, setNavOpen] = useState(false)

  async function handleLogout() {
    // redirect relativo al origin actual, nunca depender de NEXTAUTH_URL
    await signOut({ redirect: false })
    window.location.href = '/login'
  }

  const links = [
    { href: '/', label: 'Bases' },
    { href: '/agenda', label: 'Mi agenda' },
    ...(user?.role === 'admin' ? [{ href: '/admin', label: 'Usuarios' }] : []),
  ]

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-1.5 border-b border-slate-800/80 bg-slate-950/85 px-3 backdrop-blur-lg sm:px-5">
      {/* hamburguesa mobile */}
      <div className="relative sm:hidden">
        <button className="btn-ghost px-2 py-2" onClick={() => setNavOpen(!navOpen)} title="Menú">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <Popover open={navOpen} onClose={() => setNavOpen(false)} className="w-48 p-2">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setNavOpen(false)}
              className="block rounded-lg px-3 py-2.5 text-sm hover:bg-slate-800"
            >
              {l.label}
            </Link>
          ))}
        </Popover>
      </div>

      <Link href="/" className="flex shrink-0 items-center gap-2">
        <Logo size={30} />
        <span className="hidden text-base font-semibold tracking-tight md:block">
          Arrayán <span className="text-teal-400">Workflows</span>
        </span>
      </Link>

      <nav className="ml-1 hidden items-center gap-1 text-sm sm:flex md:ml-5">
        {links.map((l) => (
          <Link key={l.href} href={l.href} className="btn-ghost whitespace-nowrap px-3">
            {l.label}
          </Link>
        ))}
      </nav>

      <div className="ml-auto flex items-center gap-0.5">
        <ThemeToggle />
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
