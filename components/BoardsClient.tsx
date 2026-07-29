'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Plus, X, Globe, List, CreditCard, Users, LayoutGrid, Table2, Trello, Database, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import StickScene from './StickScene';
import { useToast, apiCall } from './Toast';

const BG_COLORS = [
  '#0079bf', '#d29034', '#519839', '#b04632', '#89609e', '#cd5a91', '#4bbf6b', '#00aecc', '#838c91',
  '#0d9488', '#6366f1', '#e11d48',
];

const BASE_ICONS = ['📊', '📁', '📌', '🗂️', '🧭', '🏔️', '🌿', '🎯', '🛒', '🏨', '✈️', '💼'];

interface Board {
  id: number; title: string; background: string; is_public?: number;
  list_count?: number; card_count?: number; member_count?: number; can_delete?: boolean;
}

interface Base {
  id: string; name: string; icon: string; color: string;
  ownerName?: string; table_count?: number; record_count?: number; can_delete?: boolean;
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

function BoardTile({ board, onDelete }: { board: Board; onDelete: (b: Board) => void }) {
  return (
    <Link
      href={`/boards/${board.id}`}
      className="group relative flex h-[9.5rem] flex-col overflow-hidden rounded-surface p-4 shadow-lift-2 ring-1 ring-inset ring-white/[0.09] transition-all duration-200 ease-out hover:-translate-y-1 hover:shadow-lift-3 hover:ring-white/25"
      style={{ background: `linear-gradient(152deg, ${shade(board.background, 0.16)} 0%, ${board.background} 52%, ${shade(board.background, -0.26)} 100%)` }}
    >
      {/* Brillo superior: da volumen al tile en lugar de dejarlo plano */}
      <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-white/[0.14] to-transparent" />
      <div className="relative flex items-start justify-between gap-2">
        <h3 className="line-clamp-2 text-[0.95rem] font-semibold leading-snug tracking-tight text-white drop-shadow-sm">{board.title}</h3>
        {board.is_public ? (
          <span className="flex flex-shrink-0 items-center gap-1 rounded-chip bg-black/30 px-1.5 py-0.5 text-[0.62rem] font-medium text-white/90 backdrop-blur">
            <Globe size={9} /> Global
          </span>
        ) : null}
      </div>
      {board.can_delete && (
        <button
          title="Eliminar tablero" aria-label="Eliminar tablero"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete(board); }}
          className="absolute right-2 top-2 hidden rounded-chip bg-black/35 p-1.5 text-white/80 backdrop-blur transition-colors hover:bg-state-crit hover:text-white group-hover:block"
        >
          <Trash2 size={13} />
        </button>
      )}
      <div className="relative mt-auto flex flex-wrap items-center gap-1.5">
        <span className="tnum flex items-center gap-1 rounded-chip bg-black/28 px-1.5 py-0.5 text-[0.68rem] font-medium text-white/90 backdrop-blur" title="Listas">
          <List size={10} /> {board.list_count ?? 0}
        </span>
        <span className="tnum flex items-center gap-1 rounded-chip bg-black/28 px-1.5 py-0.5 text-[0.68rem] font-medium text-white/90 backdrop-blur" title="Tarjetas">
          <CreditCard size={10} /> {board.card_count ?? 0}
        </span>
        {(board.member_count ?? 0) > 0 && (
          <span className="tnum flex items-center gap-1 rounded-chip bg-black/28 px-1.5 py-0.5 text-[0.68rem] font-medium text-white/90 backdrop-blur" title="Integrantes">
            <Users size={10} /> {board.member_count}
          </span>
        )}
      </div>
    </Link>
  );
}

function BaseTile({ base, onDelete }: { base: Base; onDelete: (b: Base) => void }) {
  return (
    <Link
      href={`/base/${base.id}`}
      className="group relative flex h-[9.5rem] flex-col overflow-hidden rounded-surface border border-brand/20 p-4 shadow-lift-2 transition-all duration-200 ease-out hover:-translate-y-1 hover:border-brand/40 hover:shadow-lift-3"
      style={{ background: 'linear-gradient(152deg, #16544e 0%, #0e3733 52%, #071d1a 100%)' }}
    >
      <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-white/[0.09] to-transparent" />
      <div className="relative flex items-start gap-2.5">
        <span className="text-2xl drop-shadow">{base.icon}</span>
        <h3 className="line-clamp-2 text-[0.95rem] font-semibold leading-snug tracking-tight text-white drop-shadow-sm">{base.name}</h3>
      </div>
      {base.can_delete && (
        <button
          title="Eliminar base" aria-label="Eliminar base"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete(base); }}
          className="absolute right-2 top-2 hidden rounded-chip bg-black/35 p-1.5 text-white/80 backdrop-blur transition-colors hover:bg-state-crit hover:text-white group-hover:block"
        >
          <Trash2 size={13} />
        </button>
      )}
      <div className="relative mt-auto flex flex-wrap items-center gap-1.5">
        <span className="tnum flex items-center gap-1 rounded-chip bg-black/28 px-1.5 py-0.5 text-[0.68rem] font-medium text-white/90 backdrop-blur">
          <Table2 size={10} /> {base.table_count ?? 0} tabla{(base.table_count ?? 0) === 1 ? '' : 's'}
        </span>
        <span className="tnum flex items-center gap-1 rounded-chip bg-black/28 px-1.5 py-0.5 text-[0.68rem] font-medium text-white/90 backdrop-blur" title="Registros">
          <Database size={10} /> {base.record_count ?? 0}
        </span>
      </div>
      <span className="absolute right-3 top-3 rounded-chip bg-brand/15 px-1.5 py-0.5 text-[0.62rem] font-medium text-brand-hi transition-opacity group-hover:opacity-0">
        Base
      </span>
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
  const [baseList, setBaseList] = useState<Base[]>(bases);
  // choose | board | base | null
  const [mode, setMode] = useState<null | 'choose' | 'board' | 'base'>(null);
  const [title, setTitle] = useState('');
  const [bg, setBg] = useState(BG_COLORS[9]);
  const [baseName, setBaseName] = useState('');
  const [baseIcon, setBaseIcon] = useState('📊');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const toast = useToast();

  async function deleteBoard(b: Board) {
    if (!confirm(`¿Eliminar el tablero "${b.title}" y todo su contenido? Esta acción no se puede deshacer.`)) return;
    const ok = await apiCall(`/api/boards/${b.id}`, { method: 'DELETE' }, toast, 'No se pudo eliminar el tablero');
    if (!ok) return;
    setBoards(prev => prev.filter(x => x.id !== b.id));
    toast.success(`Tablero "${b.title}" eliminado`);
    router.refresh();
  }

  async function deleteBase(b: Base) {
    if (!confirm(`¿Eliminar la base "${b.name}" con todas sus tablas y registros? Esta acción no se puede deshacer.`)) return;
    const ok = await apiCall(`/api/bases/${b.id}`, { method: 'DELETE' }, toast, 'No se pudo eliminar la base');
    if (!ok) return;
    setBaseList(prev => prev.filter(x => x.id !== b.id));
    toast.success(`Base "${b.name}" eliminada`);
    router.refresh();
  }

  async function createBoard(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setLoading(true);
    const board = await apiCall<Board>(
      '/api/boards',
      { method: 'POST', body: JSON.stringify({ title: title.trim(), background: bg }) },
      toast,
      'No se pudo crear el tablero'
    );
    setLoading(false);
    if (!board?.id) return;
    setBoards(prev => [{ ...board, list_count: 0, card_count: 0, member_count: 1 }, ...prev]);
    setTitle(''); setMode(null);
    router.refresh();
  }

  async function createBase(e: React.FormEvent) {
    e.preventDefault();
    if (!baseName.trim()) return;
    setLoading(true);
    const created = await apiCall<{ id: string }>(
      '/api/bases',
      { method: 'POST', body: JSON.stringify({ name: baseName.trim(), icon: baseIcon }) },
      toast,
      'No se pudo crear la base'
    );
    setLoading(false);
    if (created?.id) router.push(`/base/${created.id}`);
  }

  const globalBoards = boards.filter(b => b.is_public);
  const ownBoards = boards.filter(b => !b.is_public);
  const firstName = (userName || '').split(' ')[0];
  const total = boards.length + baseList.length;

  const grid = 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4';

  // Tile de creación: elegir entre Tablero (Trello) o Base (Airtable)
  let newTile: React.ReactNode;
  if (readOnly) {
    newTile = null;
  } else if (mode === 'choose') {
    newTile = (
      <div className="card animate-pop flex h-[9.5rem] flex-col gap-2 p-3">
        <div className="flex items-center justify-between">
          <span className="eyebrow">¿Qué querés crear?</span>
          <button onClick={() => setMode(null)} className="btn-icon" aria-label="Cancelar"><X size={14} /></button>
        </div>
        <button
          onClick={() => setMode('board')}
          className="flex flex-1 items-center gap-3 rounded-panel border border-state-info/25 bg-state-info/[0.08] px-3 text-left transition-colors hover:border-state-info/45 hover:bg-state-info/[0.15]"
        >
          <Trello size={19} className="flex-shrink-0 text-state-info" />
          <span>
            <span className="block text-sm font-medium text-ink-hi">Tablero</span>
            <span className="block text-micro text-ink-lo">Listas y tarjetas</span>
          </span>
        </button>
        <button
          onClick={() => setMode('base')}
          className="flex flex-1 items-center gap-3 rounded-panel border border-brand/25 bg-brand/[0.08] px-3 text-left transition-colors hover:border-brand/45 hover:bg-brand/[0.15]"
        >
          <Table2 size={19} className="flex-shrink-0 text-brand" />
          <span>
            <span className="block text-sm font-medium text-ink-hi">Base</span>
            <span className="block text-micro text-ink-lo">Tablas, vistas y formularios</span>
          </span>
        </button>
      </div>
    );
  } else if (mode === 'board') {
    newTile = (
      <div className="card animate-pop flex h-[9.5rem] flex-col gap-2 p-3.5">
        <input
          autoFocus
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Nombre del tablero…"
          aria-label="Nombre del tablero"
          className="input"
          onKeyDown={e => { if (e.key === 'Enter') createBoard(e as any); if (e.key === 'Escape') setMode(null); }}
        />
        <div className="flex gap-1 flex-wrap items-center">
          {BG_COLORS.map(c => (
            <button key={c} onClick={() => setBg(c)} aria-label={`Color ${c}`} className="h-5 w-5 rounded-full border-2 transition-transform hover:scale-110" style={{ background: c, borderColor: bg === c ? 'white' : 'transparent' }} />
          ))}
          <label className="cursor-pointer ml-0.5" title="Color propio">
            <input type="color" value={bg} onChange={e => setBg(e.target.value)} className="w-5 h-5 rounded-full cursor-pointer bg-transparent border border-white/30 p-0" />
          </label>
        </div>
        <div className="flex gap-2 mt-auto">
          <button onClick={createBoard} disabled={loading || !title.trim()} className="btn-primary px-3.5 py-1.5 text-meta">
            Crear tablero
          </button>
          <button onClick={() => setMode(null)} className="btn-icon" aria-label="Cancelar"><X size={16} /></button>
        </div>
      </div>
    );
  } else if (mode === 'base') {
    newTile = (
      <div className="card animate-pop flex h-[9.5rem] flex-col gap-2 p-3.5">
        <input
          autoFocus
          value={baseName}
          onChange={e => setBaseName(e.target.value)}
          placeholder="Nombre de la base…"
          aria-label="Nombre de la base"
          className="input"
          onKeyDown={e => { if (e.key === 'Enter') createBase(e as any); if (e.key === 'Escape') setMode(null); }}
        />
        <div className="flex gap-0.5 flex-wrap items-center">
          {BASE_ICONS.map(i => (
            <button
              key={i}
              onClick={() => setBaseIcon(i)}
              aria-label={`Icono ${i}`}
              className={`flex h-6 w-6 items-center justify-center rounded-chip text-sm transition-transform hover:scale-110 ${baseIcon === i ? 'bg-brand/25 ring-1 ring-brand' : ''}`}
            >
              {i}
            </button>
          ))}
        </div>
        <div className="flex gap-2 mt-auto">
          <button onClick={createBase} disabled={loading || !baseName.trim()} className="btn-primary px-3.5 py-1.5 text-meta">
            Crear base
          </button>
          <button onClick={() => setMode(null)} className="btn-icon" aria-label="Cancelar"><X size={16} /></button>
        </div>
      </div>
    );
  } else {
    newTile = (
      <button
        onClick={() => setMode('choose')}
        className="group flex h-[9.5rem] flex-col items-center justify-center gap-2 rounded-surface border border-dashed border-line bg-white/[0.015] text-ink-lo transition-all duration-200 hover:border-brand/45 hover:bg-brand/[0.05] hover:text-brand-hi"
      >
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.05] transition-colors group-hover:bg-brand/15">
          <Plus size={19} />
        </span>
        <span className="text-sm font-medium">Nuevo</span>
        <span className="text-micro">Tablero o base</span>
      </button>
    );
  }

  return (
    <div>
      {/* Greeting header + animación sutil a la derecha */}
      <div className="mb-7 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[1.65rem] font-semibold tracking-tight">
            {firstName ? `Hola, ${firstName}` : 'Mis proyectos'}
          </h1>
          <p className="mt-1.5 text-sm text-ink-md">
            {total === 0
              ? 'Todavía no tenés proyectos. Creá un tablero o una base para empezar.'
              : `Tenés ${boards.length} tablero${boards.length === 1 ? '' : 's'} y ${baseList.length} base${baseList.length === 1 ? '' : 's'}.`}
          </p>
        </div>
        <StickScene />
      </div>

      {globalBoards.length > 0 && (
        <section className="mb-8">
          <h2 className="eyebrow mb-3 flex items-center gap-2">
            <Globe size={13} className="text-state-info" /> Tableros del equipo
          </h2>
          <div className={grid}>
            {globalBoards.map(b => <BoardTile key={b.id} board={b} onDelete={deleteBoard} />)}
          </div>
        </section>
      )}

      <section className="mb-8">
        <h2 className="eyebrow mb-3 flex items-center gap-2">
          <LayoutGrid size={13} className="text-brand" /> Mis tableros
        </h2>
        <div className={grid}>
          {ownBoards.map(b => <BoardTile key={b.id} board={b} onDelete={deleteBoard} />)}
          {newTile}
        </div>
      </section>

      {baseList.length > 0 && (
        <section>
          <h2 className="eyebrow mb-3 flex items-center gap-2">
            <Table2 size={13} className="text-brand" /> Mis bases
          </h2>
          <div className={grid}>
            {baseList.map(b => <BaseTile key={b.id} base={b} onDelete={deleteBase} />)}
          </div>
        </section>
      )}
    </div>
  );
}
