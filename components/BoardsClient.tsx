'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Plus, X, Globe, List, CreditCard, Users, LayoutGrid, Table2, Trello, Database } from 'lucide-react';
import { useRouter } from 'next/navigation';
import StickScene from './StickScene';

const BG_COLORS = [
  '#0079bf', '#d29034', '#519839', '#b04632', '#89609e', '#cd5a91', '#4bbf6b', '#00aecc', '#838c91',
  '#0d9488', '#6366f1', '#e11d48',
];

const BASE_ICONS = ['📊', '📁', '📌', '🗂️', '🧭', '🏔️', '🌿', '🎯', '🛒', '🏨', '✈️', '💼'];

interface Board {
  id: number; title: string; background: string; is_public?: number;
  list_count?: number; card_count?: number; member_count?: number;
}

interface Base {
  id: string; name: string; icon: string; color: string;
  ownerName?: string; table_count?: number; record_count?: number;
}

// Lighten/darken a hex color to build the tile gradient
function shade(hex: string, pct: number): string {
  const n = parseInt(hex.slice(1), 16);
  if (isNaN(n)) return hex;
  const amt = Math.round(255 * pct);
  const r = Math.min(255, Math.max(0, (n >> 16) + amt));
  const g = Math.min(255, Math.max(0, ((n >> 8) & 0xff) + amt));
  const b = Math.min(255, Math.max(0, (n & 0xff) + amt));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

function BoardTile({ board }: { board: Board }) {
  return (
    <Link
      href={`/boards/${board.id}`}
      className="group relative h-36 rounded-2xl p-4 flex flex-col overflow-hidden shadow-lg transition-all duration-200 hover:-translate-y-1 hover:shadow-2xl hover:ring-2 hover:ring-white/25"
      style={{ background: `linear-gradient(140deg, ${shade(board.background, 0.12)} 0%, ${board.background} 55%, ${shade(board.background, -0.18)} 100%)` }}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-white font-semibold text-[15px] leading-snug drop-shadow-sm line-clamp-2">{board.title}</h3>
        {board.is_public ? (
          <span className="flex items-center gap-1 bg-black/25 backdrop-blur text-white/90 text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0">
            <Globe size={9} /> Global
          </span>
        ) : null}
      </div>
      <div className="mt-auto flex items-center gap-1.5 flex-wrap">
        <span className="flex items-center gap-1 bg-black/25 backdrop-blur text-white/90 text-[11px] px-2 py-0.5 rounded-full">
          <List size={10} /> {board.list_count ?? 0}
        </span>
        <span className="flex items-center gap-1 bg-black/25 backdrop-blur text-white/90 text-[11px] px-2 py-0.5 rounded-full">
          <CreditCard size={10} /> {board.card_count ?? 0}
        </span>
        {(board.member_count ?? 0) > 0 && (
          <span className="flex items-center gap-1 bg-black/25 backdrop-blur text-white/90 text-[11px] px-2 py-0.5 rounded-full">
            <Users size={10} /> {board.member_count}
          </span>
        )}
      </div>
      <div className="absolute inset-0 bg-black/0 group-hover:bg-white/5 transition-colors pointer-events-none" />
    </Link>
  );
}

function BaseTile({ base }: { base: Base }) {
  return (
    <Link
      href={`/base/${base.id}`}
      className="group relative h-36 rounded-2xl p-4 flex flex-col overflow-hidden shadow-lg transition-all duration-200 hover:-translate-y-1 hover:shadow-2xl hover:ring-2 hover:ring-teal-300/30 border border-teal-500/20"
      style={{ background: 'linear-gradient(140deg, #134e4a 0%, #0f3733 55%, #0a2622 100%)' }}
    >
      <div className="flex items-start gap-2.5">
        <span className="text-2xl drop-shadow">{base.icon}</span>
        <h3 className="text-white font-semibold text-[15px] leading-snug drop-shadow-sm line-clamp-2">{base.name}</h3>
      </div>
      <div className="mt-auto flex items-center gap-1.5 flex-wrap">
        <span className="flex items-center gap-1 bg-black/25 backdrop-blur text-white/90 text-[11px] px-2 py-0.5 rounded-full">
          <Table2 size={10} /> {base.table_count ?? 0} tabla{(base.table_count ?? 0) === 1 ? '' : 's'}
        </span>
        <span className="flex items-center gap-1 bg-black/25 backdrop-blur text-white/90 text-[11px] px-2 py-0.5 rounded-full">
          <Database size={10} /> {base.record_count ?? 0}
        </span>
      </div>
      <span className="absolute right-3 top-3 rounded-full bg-teal-400/15 px-2 py-0.5 text-[10px] font-medium text-teal-200">
        Base
      </span>
      <div className="absolute inset-0 bg-black/0 group-hover:bg-white/5 transition-colors pointer-events-none" />
    </Link>
  );
}

export default function BoardsClient({
  boards: initial,
  bases = [],
  isAdmin,
  userName,
  readOnly = false,
}: {
  boards: Board[];
  bases?: Base[];
  isAdmin: boolean;
  userName?: string;
  readOnly?: boolean;
}) {
  const [boards, setBoards] = useState<Board[]>(initial);
  // choose | board | base | null
  const [mode, setMode] = useState<null | 'choose' | 'board' | 'base'>(null);
  const [title, setTitle] = useState('');
  const [bg, setBg] = useState(BG_COLORS[9]);
  const [baseName, setBaseName] = useState('');
  const [baseIcon, setBaseIcon] = useState('📊');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function createBoard(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setLoading(true);
    const res = await fetch('/api/boards', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: title.trim(), background: bg }) });
    const board = await res.json();
    setBoards(prev => [{ ...board, list_count: 0, card_count: 0, member_count: 1 }, ...prev]);
    setTitle(''); setMode(null); setLoading(false);
    router.refresh();
  }

  async function createBase(e: React.FormEvent) {
    e.preventDefault();
    if (!baseName.trim()) return;
    setLoading(true);
    const res = await fetch('/api/bases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: baseName.trim(), icon: baseIcon }),
    });
    setLoading(false);
    if (res.ok) {
      const d = await res.json();
      router.push(`/base/${d.id}`);
    }
  }

  const globalBoards = boards.filter(b => b.is_public);
  const ownBoards = boards.filter(b => !b.is_public);
  const firstName = (userName || '').split(' ')[0];
  const total = boards.length + bases.length;

  const grid = 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4';

  // Tile de creación: elegir entre Tablero (Trello) o Base (Airtable)
  let newTile: React.ReactNode;
  if (readOnly) {
    newTile = null;
  } else if (mode === 'choose') {
    newTile = (
      <div className="h-36 rounded-2xl bg-[#1e293b] border border-[#3b5068] p-3 flex flex-col gap-2 shadow-lg">
        <div className="flex items-center justify-between">
          <span className="text-slate-300 text-xs font-semibold uppercase tracking-wider">¿Qué querés crear?</span>
          <button onClick={() => setMode(null)} className="text-slate-400 hover:text-white p-0.5"><X size={14} /></button>
        </div>
        <button
          onClick={() => setMode('board')}
          className="flex-1 flex items-center gap-3 rounded-xl border border-sky-500/30 bg-sky-500/10 px-3 text-left hover:bg-sky-500/20 transition-colors"
        >
          <Trello size={20} className="text-sky-300 flex-shrink-0" />
          <span>
            <span className="block text-white text-sm font-medium">Tablero</span>
            <span className="block text-slate-400 text-[11px]">Listas y tarjetas, estilo Trello</span>
          </span>
        </button>
        <button
          onClick={() => setMode('base')}
          className="flex-1 flex items-center gap-3 rounded-xl border border-teal-500/30 bg-teal-500/10 px-3 text-left hover:bg-teal-500/20 transition-colors"
        >
          <Table2 size={20} className="text-teal-300 flex-shrink-0" />
          <span>
            <span className="block text-white text-sm font-medium">Base</span>
            <span className="block text-slate-400 text-[11px]">Tablas y vistas, estilo Airtable</span>
          </span>
        </button>
      </div>
    );
  } else if (mode === 'board') {
    newTile = (
      <div className="h-36 rounded-2xl bg-[#1e293b] border border-[#3b5068] p-3.5 flex flex-col gap-2 shadow-lg">
        <input
          autoFocus
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Título del tablero..."
          className="bg-[#0f172a] border border-[#3b5068] text-white text-sm rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-teal-400 w-full"
          onKeyDown={e => { if (e.key === 'Enter') createBoard(e as any); if (e.key === 'Escape') setMode(null); }}
        />
        <div className="flex gap-1 flex-wrap items-center">
          {BG_COLORS.map(c => (
            <button key={c} onClick={() => setBg(c)} className="w-5 h-5 rounded-full border-2 transition-transform hover:scale-110" style={{ background: c, borderColor: bg === c ? 'white' : 'transparent' }} />
          ))}
          <label className="cursor-pointer ml-0.5" title="Color propio">
            <input type="color" value={bg} onChange={e => setBg(e.target.value)} className="w-5 h-5 rounded-full cursor-pointer bg-transparent border border-white/30 p-0" />
          </label>
        </div>
        <div className="flex gap-2 mt-auto">
          <button onClick={createBoard} disabled={loading || !title.trim()} className="bg-teal-600 hover:bg-teal-500 disabled:opacity-40 text-white text-xs px-3.5 py-1.5 rounded-lg font-medium transition-colors">
            Crear tablero
          </button>
          <button onClick={() => setMode(null)} className="text-slate-400 hover:text-white p-1"><X size={16} /></button>
        </div>
      </div>
    );
  } else if (mode === 'base') {
    newTile = (
      <div className="h-36 rounded-2xl bg-[#1e293b] border border-[#3b5068] p-3.5 flex flex-col gap-2 shadow-lg">
        <input
          autoFocus
          value={baseName}
          onChange={e => setBaseName(e.target.value)}
          placeholder="Nombre de la base..."
          className="bg-[#0f172a] border border-[#3b5068] text-white text-sm rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-teal-400 w-full"
          onKeyDown={e => { if (e.key === 'Enter') createBase(e as any); if (e.key === 'Escape') setMode(null); }}
        />
        <div className="flex gap-0.5 flex-wrap items-center">
          {BASE_ICONS.map(i => (
            <button
              key={i}
              onClick={() => setBaseIcon(i)}
              className={`w-6 h-6 rounded text-sm flex items-center justify-center transition-transform hover:scale-110 ${baseIcon === i ? 'bg-teal-500/30 ring-1 ring-teal-400' : ''}`}
            >
              {i}
            </button>
          ))}
        </div>
        <div className="flex gap-2 mt-auto">
          <button onClick={createBase} disabled={loading || !baseName.trim()} className="bg-teal-600 hover:bg-teal-500 disabled:opacity-40 text-white text-xs px-3.5 py-1.5 rounded-lg font-medium transition-colors">
            Crear base
          </button>
          <button onClick={() => setMode(null)} className="text-slate-400 hover:text-white p-1"><X size={16} /></button>
        </div>
      </div>
    );
  } else {
    newTile = (
      <button
        onClick={() => setMode('choose')}
        className="h-36 rounded-2xl border-2 border-dashed border-[#3b5068] hover:border-teal-400 bg-white/[0.02] hover:bg-teal-400/5 transition-all flex flex-col items-center justify-center gap-2 text-slate-400 hover:text-teal-300 group"
      >
        <span className="w-10 h-10 rounded-full bg-white/5 group-hover:bg-teal-500/15 flex items-center justify-center transition-colors">
          <Plus size={20} />
        </span>
        <span className="text-sm font-medium">Nuevo</span>
        <span className="text-[11px] text-slate-500">Tablero o Base</span>
      </button>
    );
  }

  return (
    <div>
      {/* Greeting header + animación sutil a la derecha */}
      <div className="mb-7 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-white text-2xl font-bold">
            {firstName ? `Hola, ${firstName} 👋` : 'Mis proyectos'}
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            {total === 0
              ? 'Todavía no tenés proyectos. Creá un tablero o una base para empezar.'
              : `Tenés ${boards.length} tablero${boards.length === 1 ? '' : 's'} y ${bases.length} base${bases.length === 1 ? '' : 's'}.`}
          </p>
        </div>
        <StickScene />
      </div>

      {globalBoards.length > 0 && (
        <section className="mb-8">
          <h2 className="flex items-center gap-2 text-slate-300 text-xs font-semibold uppercase tracking-wider mb-3">
            <Globe size={13} className="text-sky-400" /> Tableros del equipo
          </h2>
          <div className={grid}>
            {globalBoards.map(b => <BoardTile key={b.id} board={b} />)}
          </div>
        </section>
      )}

      <section className="mb-8">
        <h2 className="flex items-center gap-2 text-slate-300 text-xs font-semibold uppercase tracking-wider mb-3">
          <LayoutGrid size={13} className="text-teal-400" /> Mis tableros
        </h2>
        <div className={grid}>
          {ownBoards.map(b => <BoardTile key={b.id} board={b} />)}
          {newTile}
        </div>
      </section>

      {bases.length > 0 && (
        <section>
          <h2 className="flex items-center gap-2 text-slate-300 text-xs font-semibold uppercase tracking-wider mb-3">
            <Table2 size={13} className="text-teal-400" /> Mis bases
          </h2>
          <div className={grid}>
            {bases.map(b => <BaseTile key={b.id} base={b} />)}
          </div>
        </section>
      )}
    </div>
  );
}
