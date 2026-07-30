'use client';
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useSession, signOut } from 'next-auth/react';
import { LogOut, Settings, Trophy, UserCircle, ChevronDown, BarChart3 } from 'lucide-react';
import NotificationBell from './NotificationBell';
import Logo from './Logo';
import Avatar from './Avatar';

export default function Navbar() {
  const { data: session } = useSession();
  const isAdmin = (session?.user as any)?.isAdmin;
  const sessionUserId = Number((session?.user as any)?.id || 0);
  const [profile, setProfile] = useState<{ id: number; display_name: string; avatar?: string | null } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!session) return;
    fetch('/api/me/profile').then(r => r.ok ? r.json() : null).then(p => { if (p) setProfile(p); }).catch(() => {});
  }, [session]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, []);

  const name = profile?.display_name || session?.user?.name || '';

  return (
    <header className="sticky top-0 z-50 flex h-14 items-center gap-1 border-b border-line/80 bg-surface-base/80 px-3 backdrop-blur-xl sm:px-4">
      <Link href="/boards" className="group flex items-center gap-2.5 transition-opacity hover:opacity-90">
        <span className="flex h-9 w-9 items-center justify-center rounded-control border border-brand/20 bg-gradient-to-b from-surface-raised2 to-surface-sunken text-brand shadow-lift-1 transition-shadow group-hover:shadow-glow">
          <Logo size={21} />
        </span>
        <span className="flex flex-col leading-none">
          <span className="text-[1.02rem] font-light tracking-[0.3em] text-ink-hi">TROCHI</span>
          <span className="eyebrow mt-1 hidden text-[0.58rem] sm:block">Proyectos turísticos</span>
        </span>
      </Link>

      <div className="flex-1" />

      <nav className="flex items-center gap-0.5">
        <Link href="/rankings" title="Rankings" aria-label="Rankings" className="btn-icon hidden hover:text-[#f0c078] sm:inline-flex">
          <Trophy size={17} />
        </Link>

        {isAdmin && (
          <Link href="/analytics" title="Analytics" aria-label="Analytics" className="btn-icon hidden hover:text-brand-hi sm:inline-flex">
            <BarChart3 size={17} />
          </Link>
        )}

        <NotificationBell />

        {isAdmin && (
          <Link
            href="/admin"
            className="btn-icon hidden gap-1.5 px-2 text-meta sm:inline-flex"
            title="Administración"
            aria-label="Administración"
          >
            <Settings size={15} />
            <span className="hidden sm:inline">Admin</span>
          </Link>
        )}

        {session && (
          <div className="relative ml-1" ref={menuRef}>
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              aria-label="Menú de tu cuenta"
              aria-expanded={menuOpen}
              className="tap-row flex items-center gap-1 rounded-full py-1 pl-1 pr-1.5 transition-colors hover:bg-white/[0.07]"
            >
              <Avatar userId={profile?.id || sessionUserId} name={name} avatar={profile?.avatar} size={28} />
              <ChevronDown size={13} className={`text-ink-lo transition-transform ${menuOpen ? 'rotate-180' : ''}`} />
            </button>
            {menuOpen && (
              <div className="popover animate-pop absolute right-0 top-full z-[60] mt-2 w-56 overflow-hidden py-1.5">
                <div className="border-b border-line/70 px-3.5 pb-2.5 pt-1.5">
                  <p className="truncate text-sm font-medium text-ink-hi">{name}</p>
                  <p className="fineprint truncate">@{(session.user as any)?.username || ''}</p>
                </div>
                {/* En teléfono estos tres no caben en la barra: viven acá */}
                <Link
                  href="/rankings"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-ink-md transition-colors hover:bg-white/[0.06] hover:text-ink-hi sm:hidden"
                >
                  <Trophy size={15} /> Rankings
                </Link>
                {isAdmin && (
                  <Link
                    href="/analytics"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-ink-md transition-colors hover:bg-white/[0.06] hover:text-ink-hi sm:hidden"
                  >
                    <BarChart3 size={15} /> Analytics
                  </Link>
                )}
                {isAdmin && (
                  <Link
                    href="/admin"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-ink-md transition-colors hover:bg-white/[0.06] hover:text-ink-hi sm:hidden"
                  >
                    <Settings size={15} /> Administración
                  </Link>
                )}
                <Link
                  href="/profile"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-ink-md transition-colors hover:bg-white/[0.06] hover:text-ink-hi"
                >
                  <UserCircle size={15} /> Mi perfil
                </Link>
                <button
                  onClick={async () => { await signOut({ redirect: false }); window.location.href = '/login'; }}
                  className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm text-ink-md transition-colors hover:bg-white/[0.06] hover:text-ink-hi"
                >
                  <LogOut size={15} /> Salir
                </button>
              </div>
            )}
          </div>
        )}
      </nav>
    </header>
  );
}
