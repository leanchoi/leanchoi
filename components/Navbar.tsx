'use client';
import Link from 'next/link';
import { useSession, signOut } from 'next-auth/react';
import { LogOut, LayoutDashboard, Settings } from 'lucide-react';

export default function Navbar() {
  const { data: session } = useSession();
  const isAdmin = (session?.user as any)?.isAdmin;

  return (
    <header className="h-12 bg-[#1d2125]/90 backdrop-blur border-b border-white/10 flex items-center px-4 gap-3 sticky top-0 z-50">
      <Link href="/boards" className="flex items-center gap-2 font-bold text-white hover:text-blue-400 transition-colors">
        <LayoutDashboard size={18} />
        LeanBoard
      </Link>
      <div className="flex-1" />
      {isAdmin && (
        <Link href="/admin" className="flex items-center gap-1.5 text-sm text-[#b6c2cf] hover:text-white transition-colors px-2 py-1 rounded hover:bg-white/10">
          <Settings size={15} />
          Admin
        </Link>
      )}
      <button
        onClick={() => signOut({ callbackUrl: '/login' })}
        className="flex items-center gap-1.5 text-sm text-[#b6c2cf] hover:text-white transition-colors px-2 py-1 rounded hover:bg-white/10"
      >
        <LogOut size={15} />
        Salir
      </button>
    </header>
  );
}
