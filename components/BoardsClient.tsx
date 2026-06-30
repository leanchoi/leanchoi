'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Plus, X } from 'lucide-react';
import { useRouter } from 'next/navigation';

const BG_COLORS = [
  '#0079bf','#d29034','#519839','#b04632','#89609e','#cd5a91','#4bbf6b','#00aecc','#838c91',
];

interface Board { id: number; title: string; background: string; }

export default function BoardsClient({ boards: initial, isAdmin }: { boards: Board[]; isAdmin: boolean }) {
  const [boards, setBoards] = useState<Board[]>(initial);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [bg, setBg] = useState(BG_COLORS[0]);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function createBoard(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setLoading(true);
    const res = await fetch('/api/boards', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: title.trim(), background: bg }) });
    const board = await res.json();
    setBoards(prev => [board, ...prev]);
    setTitle(''); setShowForm(false); setLoading(false);
    router.refresh();
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
      {boards.map(board => (
        <Link
          key={board.id}
          href={`/boards/${board.id}`}
          className="h-28 rounded-xl p-3 font-semibold text-white text-sm hover:opacity-90 transition-opacity relative overflow-hidden shadow-md"
          style={{ background: board.background }}
        >
          <span className="relative z-10 drop-shadow">{board.title}</span>
          <div className="absolute inset-0 bg-black/10 hover:bg-black/0 transition-colors" />
        </Link>
      ))}

      {isAdmin && (
        showForm ? (
          <div className="h-28 rounded-xl bg-[#22272b] p-3 flex flex-col gap-2">
            <input
              autoFocus
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Título del tablero"
              className="bg-[#2c3540] border border-[#3d4b58] text-white text-sm rounded px-2 py-1 focus:outline-none focus:border-blue-500 w-full"
              onKeyDown={e => e.key === 'Enter' && createBoard(e as any)}
            />
            <div className="flex gap-1 flex-wrap">
              {BG_COLORS.map(c => (
                <button key={c} onClick={() => setBg(c)} className="w-5 h-5 rounded-full border-2 transition-transform hover:scale-110" style={{ background: c, borderColor: bg === c ? 'white' : 'transparent' }} />
              ))}
            </div>
            <div className="flex gap-2 mt-auto">
              <button onClick={createBoard} disabled={loading} className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-3 py-1 rounded font-medium">
                Crear
              </button>
              <button onClick={() => setShowForm(false)} className="text-[#8c9bab] hover:text-white"><X size={16} /></button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowForm(true)}
            className="h-28 rounded-xl bg-white/10 hover:bg-white/20 transition-colors flex items-center justify-center gap-2 text-[#b6c2cf] hover:text-white text-sm font-medium"
          >
            <Plus size={16} /> Nuevo tablero
          </button>
        )
      )}
    </div>
  );
}
