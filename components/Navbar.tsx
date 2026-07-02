'use client';
import Link from 'next/link';
import { useSession, signOut } from 'next-auth/react';
import { LogOut, Compass, Settings } from 'lucide-react';

export default function Navbar() {
  const { data: session } = useSession();
  const isAdmin = (session?.user as any)?.isAdmin;
  const name = session?.user?.name || '';

  return (
    <header className="h-12 bg-[#0f172a]/90 backdrop-blur border-b border-white/10 flex items-center px-4 gap-3 sticky top-0 z-50">
      <Link href="/boards" className="flex items-center gap-2 font-bold text-white hover:opacity-80 transition-opacity">
        <span className="w-7 h-7 rounded-lg bg-gradient-to-br from-teal-400 to-cyan-600 flex items-center justify-center">
          <Compass size={16} className="text-white" />
        </span>
        <span className="tracking-wide">TROCHI</span>
        <span className="hidden sm:inline text-[11px] font-normal text-slate-400 mt-0.5">Gestor de Proyectos Turísticos</span>
      </Link>
      <div className="flex-1" />
      {name && (
        <span className="hidden sm:flex items-center gap-1.5 text-xs text-slate-400">
          <span className="w-6 h-6 rounded-full bg-teal-600 flex items-center justify-center text-white text-xs font-bold">{name.charAt(0).toUpperCase()}</span>
          {name}
        </span>
      )}
      {isAdmin && (
        <Link href="/admin" className="flex items-center gap-1.5 text-sm text-slate-300 hover:text-white transition-colors px-2 py-1 rounded hover:bg-white/10">
          <Settings size={15} />
          Admin
        </Link>
      )}
      <button
        onClick={() => signOut({ callbackUrl: '/login' })}
        className="flex items-center gap-1.5 text-sm text-slate-300 hover:text-white transition-colors px-2 py-1 rounded hover:bg-white/10"
      >
        <LogOut size={15} />
        Salir
      </button>
    </header>
  );
}
