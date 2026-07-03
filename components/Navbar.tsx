'use client';
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useSession, signOut } from 'next-auth/react';
import { LogOut, Settings, Trophy, UserCircle, ChevronDown } from 'lucide-react';
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
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const name = profile?.display_name || session?.user?.name || '';

  return (
    <header className="h-12 bg-[#0f172a]/90 backdrop-blur border-b border-white/10 flex items-center px-4 gap-2 sticky top-0 z-50">
      <Link href="/boards" className="flex items-center gap-2.5 text-white hover:opacity-80 transition-opacity">
        <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-teal-400 to-cyan-700 flex items-center justify-center text-white shadow-md shadow-teal-950/50">
          <Logo size={20} />
        </span>
        <span className="flex flex-col leading-none">
          <span className="font-light text-[17px] tracking-[0.32em]">TROCHI</span>
          <span className="hidden sm:block text-[8.5px] font-normal tracking-[0.14em] uppercase text-slate-400 mt-1">Gestor de Proyectos Turísticos</span>
        </span>
      </Link>
      <div className="flex-1" />

      <Link href="/rankings" title="Rankings" className="relative flex items-center text-slate-300 hover:text-amber-300 transition-colors p-1.5 rounded hover:bg-white/10">
        <Trophy size={17} />
      </Link>

      <NotificationBell />

      {isAdmin && (
        <Link href="/admin" className="flex items-center gap-1.5 text-sm text-slate-300 hover:text-white transition-colors px-2 py-1 rounded hover:bg-white/10">
          <Settings size={15} />
          <span className="hidden sm:inline">Admin</span>
        </Link>
      )}

      {session && (
        <div className="relative" ref={menuRef}>
          <button onClick={() => setMenuOpen(!menuOpen)} className="flex items-center gap-1.5 pl-1 pr-1.5 py-1 rounded-full hover:bg-white/10 transition-colors">
            <Avatar userId={profile?.id || sessionUserId} name={name} avatar={profile?.avatar} size={26} />
            <ChevronDown size={13} className="text-slate-400" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full mt-2 w-52 bg-[#1e293b] border border-[#3b5068] rounded-xl shadow-2xl z-[60] py-1.5 overflow-hidden">
              <div className="px-3.5 py-2 border-b border-white/10">
                <p className="text-white text-sm font-medium truncate">{name}</p>
              </div>
              <Link href="/profile" onClick={() => setMenuOpen(false)} className="flex items-center gap-2.5 px-3.5 py-2 text-sm text-slate-300 hover:text-white hover:bg-white/5 transition-colors">
                <UserCircle size={15} /> Mi perfil
              </Link>
              <button onClick={async () => { await signOut({ redirect: false }); window.location.href = '/login'; }} className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-slate-300 hover:text-white hover:bg-white/5 transition-colors text-left">
                <LogOut size={15} /> Salir
              </button>
            </div>
          )}
        </div>
      )}
    </header>
  );
}
