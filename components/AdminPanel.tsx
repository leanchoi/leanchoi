'use client';
import { useState } from 'react';
import { Plus, Pencil, Trash2, X, Check, Shield, User } from 'lucide-react';

interface Board { id: number; title: string; background: string; }
interface AppUser { id: number; username: string; display_name: string; is_admin: number; board_ids: number[]; }

export default function AdminPanel({ initialUsers, initialBoards }: { initialUsers: AppUser[]; initialBoards: Board[]; }) {
  const [users, setUsers] = useState<AppUser[]>(initialUsers);
  const [boards, setBoards] = useState<Board[]>(initialBoards);
  const [editingUser, setEditingUser] = useState<AppUser | null>(null);
  const [showNewUser, setShowNewUser] = useState(false);
  const [newUser, setNewUser] = useState({ username: '', display_name: '', password: '', is_admin: false });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'users' | 'boards'>('users');
  const [showNewBoard, setShowNewBoard] = useState(false);
  const [newBoard, setNewBoard] = useState({ title: '', background: '#0079bf' });

  const BG_COLORS = ['#0079bf','#d29034','#519839','#b04632','#89609e','#cd5a91','#4bbf6b','#00aecc','#838c91'];

  async function createUser() {
    if (!newUser.username || !newUser.password) { setError('Usuario y contraseña requeridos'); return; }
    setSaving(true); setError('');
    const res = await fetch('/api/admin/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newUser) });
    if (!res.ok) { setError((await res.json()).error || 'Error'); setSaving(false); return; }
    const user = await res.json();
    setUsers(prev => [...prev, { ...user, board_ids: [] }]);
    setNewUser({ username: '', display_name: '', password: '', is_admin: false });
    setShowNewUser(false); setSaving(false);
  }

  async function saveUser(u: AppUser & { password?: string }) {
    setSaving(true); setError('');
    const res = await fetch(`/api/admin/users/${u.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: u.username, display_name: u.display_name, password: u.password || undefined, is_admin: u.is_admin, board_ids: u.board_ids }),
    });
    if (!res.ok) { setError('Error al guardar'); setSaving(false); return; }
    setUsers(prev => prev.map(p => p.id === u.id ? { ...u, board_ids: u.board_ids } : p));
    setEditingUser(null); setSaving(false);
  }

  async function deleteUser(id: number) {
    if (!confirm('¿Eliminar este usuario?')) return;
    await fetch(`/api/admin/users/${id}`, { method: 'DELETE' });
    setUsers(prev => prev.filter(u => u.id !== id));
  }

  async function createBoard() {
    if (!newBoard.title) return;
    const res = await fetch('/api/boards', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newBoard) });
    const board = await res.json();
    setBoards(prev => [...prev, board]);
    setNewBoard({ title: '', background: '#0079bf' }); setShowNewBoard(false);
  }

  async function deleteBoard(id: number) {
    if (!confirm('¿Eliminar este tablero y todo su contenido?')) return;
    await fetch(`/api/boards/${id}`, { method: 'DELETE' });
    setBoards(prev => prev.filter(b => b.id !== id));
    setUsers(prev => prev.map(u => ({ ...u, board_ids: u.board_ids.filter(bid => bid !== id) })));
  }

  return (
    <div className="max-w-5xl mx-auto p-6">
      <h1 className="text-white text-2xl font-bold mb-6">Panel de Administración</h1>

      <div className="flex gap-2 mb-6">
        {(['users', 'boards'] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === tab ? 'bg-teal-600 text-white' : 'bg-[#1e293b] text-[#cbd5e1] hover:bg-[#2e415c]'}`}>
            {tab === 'users' ? `Usuarios (${users.filter(u => !u.is_admin).length}/50)` : `Tableros (${boards.length})`}
          </button>
        ))}
      </div>

      {error && <div className="bg-red-900/40 border border-red-700 text-red-300 px-4 py-2 rounded-lg mb-4 text-sm">{error}</div>}

      {activeTab === 'users' && (
        <div className="space-y-3">
          {users.map(u => (
            <div key={u.id} className="bg-[#1e293b] rounded-xl p-4">
              {editingUser?.id === u.id ? (
                <UserEditForm
                  user={editingUser}
                  boards={boards}
                  onChange={setEditingUser as any}
                  onSave={() => saveUser(editingUser as any)}
                  onCancel={() => setEditingUser(null)}
                  saving={saving}
                />
              ) : (
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0 ${u.is_admin ? 'bg-amber-600' : 'bg-teal-600'}`}>
                    {u.is_admin ? <Shield size={16} /> : u.display_name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-white font-medium text-sm">{u.display_name}</span>
                      {u.is_admin && <span className="text-xs bg-amber-600/30 text-amber-400 px-1.5 py-0.5 rounded">Admin</span>}
                    </div>
                    <span className="text-[#94a3b8] text-xs">@{u.username}</span>
                  </div>
                  <div className="flex flex-wrap gap-1 flex-1">
                    {u.board_ids.map(bid => {
                      const board = boards.find(b => b.id === bid);
                      return board ? (
                        <span key={bid} className="text-xs px-2 py-0.5 rounded-full text-white" style={{ background: board.background }}>
                          {board.title}
                        </span>
                      ) : null;
                    })}
                    {u.board_ids.length === 0 && !u.is_admin && <span className="text-xs text-[#94a3b8]">Sin tableros</span>}
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <button onClick={() => setEditingUser(u)} className="p-1.5 text-[#94a3b8] hover:text-white hover:bg-white/10 rounded"><Pencil size={15} /></button>
                    <button onClick={() => deleteUser(u.id)} className="p-1.5 text-[#94a3b8] hover:text-red-400 hover:bg-red-900/20 rounded"><Trash2 size={15} /></button>
                  </div>
                </div>
              )}
            </div>
          ))}

          {showNewUser ? (
            <div className="bg-[#1e293b] rounded-xl p-4 border border-teal-600/50">
              <h3 className="text-white font-medium mb-3 text-sm">Nuevo usuario</h3>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="text-[#94a3b8] text-xs mb-1 block">Usuario *</label>
                  <input value={newUser.username} onChange={e => setNewUser(p => ({ ...p, username: e.target.value }))} className="w-full bg-[#0f172a] border border-[#3b5068] text-white text-sm rounded px-2 py-1.5 focus:outline-none focus:border-teal-400" placeholder="juan_perez" />
                </div>
                <div>
                  <label className="text-[#94a3b8] text-xs mb-1 block">Nombre para mostrar</label>
                  <input value={newUser.display_name} onChange={e => setNewUser(p => ({ ...p, display_name: e.target.value }))} className="w-full bg-[#0f172a] border border-[#3b5068] text-white text-sm rounded px-2 py-1.5 focus:outline-none focus:border-teal-400" placeholder="Juan Pérez" />
                </div>
                <div>
                  <label className="text-[#94a3b8] text-xs mb-1 block">Contraseña *</label>
                  <input type="password" value={newUser.password} onChange={e => setNewUser(p => ({ ...p, password: e.target.value }))} className="w-full bg-[#0f172a] border border-[#3b5068] text-white text-sm rounded px-2 py-1.5 focus:outline-none focus:border-teal-400" placeholder="••••••••" />
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={newUser.is_admin} onChange={e => setNewUser(p => ({ ...p, is_admin: e.target.checked }))} className="accent-amber-500" />
                    <span className="text-[#cbd5e1] text-sm">Es administrador</span>
                  </label>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={createUser} disabled={saving} className="bg-teal-600 hover:bg-teal-500 text-white text-sm px-4 py-1.5 rounded font-medium">Crear</button>
                <button onClick={() => { setShowNewUser(false); setError(''); }} className="text-[#94a3b8] hover:text-white text-sm px-3 py-1.5 rounded hover:bg-white/10">Cancelar</button>
              </div>
            </div>
          ) : (
            users.filter(u => !u.is_admin).length < 50 && (
              <button onClick={() => setShowNewUser(true)} className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-[#3b5068] hover:border-teal-400 rounded-xl text-[#94a3b8] hover:text-white text-sm transition-colors">
                <Plus size={16} /> Agregar usuario
              </button>
            )
          )}
        </div>
      )}

      {activeTab === 'boards' && (
        <div className="space-y-3">
          {boards.map(b => (
            <div key={b.id} className="bg-[#1e293b] rounded-xl p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg flex-shrink-0" style={{ background: b.background }} />
              <span className="text-white font-medium flex-1">{b.title}</span>
              <span className="text-[#94a3b8] text-xs">
                {users.filter(u => u.board_ids.includes(b.id)).length} miembros
              </span>
              <button onClick={() => deleteBoard(b.id)} className="p-1.5 text-[#94a3b8] hover:text-red-400 hover:bg-red-900/20 rounded"><Trash2 size={15} /></button>
            </div>
          ))}

          {showNewBoard ? (
            <div className="bg-[#1e293b] rounded-xl p-4 border border-teal-600/50">
              <h3 className="text-white font-medium mb-3 text-sm">Nuevo tablero</h3>
              <div className="space-y-3">
                <input value={newBoard.title} onChange={e => setNewBoard(p => ({ ...p, title: e.target.value }))} className="w-full bg-[#0f172a] border border-[#3b5068] text-white text-sm rounded px-2 py-1.5 focus:outline-none focus:border-teal-400" placeholder="Nombre del tablero" />
                <div className="flex gap-2 flex-wrap">
                  {BG_COLORS.map(c => (
                    <button key={c} onClick={() => setNewBoard(p => ({ ...p, background: c }))} className="w-8 h-8 rounded-lg border-2 transition-transform hover:scale-110" style={{ background: c, borderColor: newBoard.background === c ? 'white' : 'transparent' }} />
                  ))}
                </div>
                <div className="flex gap-2">
                  <button onClick={createBoard} className="bg-teal-600 hover:bg-teal-500 text-white text-sm px-4 py-1.5 rounded font-medium">Crear</button>
                  <button onClick={() => setShowNewBoard(false)} className="text-[#94a3b8] hover:text-white text-sm px-3 py-1.5 rounded hover:bg-white/10">Cancelar</button>
                </div>
              </div>
            </div>
          ) : (
            <button onClick={() => setShowNewBoard(true)} className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-[#3b5068] hover:border-teal-400 rounded-xl text-[#94a3b8] hover:text-white text-sm transition-colors">
              <Plus size={16} /> Nuevo tablero
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function UserEditForm({ user, boards, onChange, onSave, onCancel, saving }: {
  user: AppUser & { password?: string }; boards: Board[];
  onChange: (u: AppUser & { password?: string }) => void;
  onSave: () => void; onCancel: () => void; saving: boolean;
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[#94a3b8] text-xs mb-1 block">Usuario</label>
          <input value={user.username} onChange={e => onChange({ ...user, username: e.target.value })} className="w-full bg-[#0f172a] border border-[#3b5068] text-white text-sm rounded px-2 py-1.5 focus:outline-none focus:border-teal-400" />
        </div>
        <div>
          <label className="text-[#94a3b8] text-xs mb-1 block">Nombre</label>
          <input value={user.display_name} onChange={e => onChange({ ...user, display_name: e.target.value })} className="w-full bg-[#0f172a] border border-[#3b5068] text-white text-sm rounded px-2 py-1.5 focus:outline-none focus:border-teal-400" />
        </div>
        <div>
          <label className="text-[#94a3b8] text-xs mb-1 block">Nueva contraseña (dejar vacío para no cambiar)</label>
          <input type="password" value={user.password || ''} onChange={e => onChange({ ...user, password: e.target.value })} className="w-full bg-[#0f172a] border border-[#3b5068] text-white text-sm rounded px-2 py-1.5 focus:outline-none focus:border-teal-400" placeholder="••••••••" />
        </div>
        <div className="flex items-end">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={!!user.is_admin} onChange={e => onChange({ ...user, is_admin: e.target.checked ? 1 : 0 })} className="accent-amber-500" />
            <span className="text-[#cbd5e1] text-sm">Es administrador</span>
          </label>
        </div>
      </div>
      <div>
        <label className="text-[#94a3b8] text-xs mb-1 block">Acceso a tableros</label>
        <div className="flex flex-wrap gap-2">
          {boards.map(b => {
            const has = user.board_ids.includes(b.id);
            return (
              <button
                key={b.id}
                onClick={() => onChange({ ...user, board_ids: has ? user.board_ids.filter(id => id !== b.id) : [...user.board_ids, b.id] })}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border-2 transition-all"
                style={{ background: has ? b.background : 'transparent', borderColor: b.background, color: has ? 'white' : '#cbd5e1' }}
              >
                {has && <Check size={10} />} {b.title}
              </button>
            );
          })}
          {boards.length === 0 && <span className="text-[#94a3b8] text-xs">No hay tableros creados aún</span>}
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={onSave} disabled={saving} className="bg-teal-600 hover:bg-teal-500 text-white text-sm px-4 py-1.5 rounded font-medium">Guardar</button>
        <button onClick={onCancel} className="text-[#94a3b8] hover:text-white text-sm px-3 py-1.5 rounded hover:bg-white/10">Cancelar</button>
      </div>
    </div>
  );
}
