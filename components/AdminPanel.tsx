'use client';
import { useState } from 'react';
import { KeyRound, ShieldCheck, Plus, Pencil, Trash2, X, Check, Shield, User, Globe, Users } from 'lucide-react';
import TenantsPanel from './TenantsPanel';
import { useToast, apiCall } from './Toast';

interface Board { id: number; title: string; background: string; is_public?: number; }
interface Base { id: string; name: string; icon: string; }
interface AppUser {
  id: number; username: string; display_name: string; is_admin: number; board_ids: number[];
  /** 1 = sigue con la contraseña repartida por defecto */
  password_is_default?: number;
  password_changed_at?: string | null;
}

export interface TenantInfo {
  name: string; max_users: number; user_count: number;
  storage_mb: number; storage_used: number; expires_at: string | null;
}

export default function AdminPanel({ initialUsers, initialBoards, initialBases = [], isMaster = false, tenantInfo = null }: {
  initialUsers: AppUser[]; initialBoards: Board[]; initialBases?: Base[]; isMaster?: boolean; tenantInfo?: TenantInfo | null;
}) {
  const toast = useToast();
  const [users, setUsers] = useState<AppUser[]>(initialUsers);
  const [boards, setBoards] = useState<Board[]>(initialBoards);
  const [bases, setBases] = useState<Base[]>(initialBases);
  const [editingUser, setEditingUser] = useState<AppUser | null>(null);
  const [showNewUser, setShowNewUser] = useState(false);
  const [newUser, setNewUser] = useState({ username: '', display_name: '', password: '', is_admin: false });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'users' | 'boards' | 'bases' | 'tenants'>('users');

  async function deleteBase(b: Base) {
    if (!confirm(`¿Eliminar la base "${b.name}" con todas sus tablas y registros? Esta acción no se puede deshacer.`)) return;
    const res = await fetch(`/api/bases/${b.id}`, { method: 'DELETE' });
    if (!res.ok) { toast.error((await res.json().catch(() => ({}))).error || 'No se pudo eliminar'); return; }
    setBases(prev => prev.filter(x => x.id !== b.id));
  }
  const [showNewBoard, setShowNewBoard] = useState(false);
  const [newBoard, setNewBoard] = useState({ title: '', background: '#0079bf' });
  const [expandedBoard, setExpandedBoard] = useState<number | null>(null);

  async function toggleGlobal(board: Board) {
    const newVal = board.is_public ? 0 : 1;
    await fetch(`/api/boards/${board.id}/share`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_public: newVal }) });
    setBoards(prev => prev.map(b => b.id === board.id ? { ...b, is_public: newVal } : b));
  }

  async function toggleBoardMember(boardId: number, userId: number, has: boolean) {
    await fetch(`/api/boards/${boardId}/share`, {
      method: has ? 'DELETE' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });
    setUsers(prev => prev.map(u => u.id === userId
      ? { ...u, board_ids: has ? u.board_ids.filter(id => id !== boardId) : [...u.board_ids, boardId] }
      : u));
  }

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
      <h1 className="text-white text-2xl font-bold mb-1.5">
        {isMaster ? 'Panel del Admin Master' : 'Panel de Administración'}
      </h1>
      {!isMaster && tenantInfo && (
        <p className="text-slate-400 text-sm mb-4">
          Rama <span className="text-brand-hi font-medium">{tenantInfo.name}</span> ·{' '}
          {tenantInfo.user_count}/{tenantInfo.max_users} usuarios ·{' '}
          {(tenantInfo.storage_used / 1024 / 1024).toFixed(0)}/{tenantInfo.storage_mb} MB usados
          {tenantInfo.expires_at && <> · activa hasta {tenantInfo.expires_at.split('-').reverse().join('/')}</>}
        </p>
      )}
      {isMaster && <div className="mb-4" />}

      <div className="flex gap-2 mb-6 flex-wrap">
        {(['users', 'boards', 'bases'] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === tab ? 'bg-brand text-white' : 'bg-surface-raised text-ink-md hover:bg-surface-hover'}`}>
            {tab === 'users'
              ? `Usuarios (${users.length}${!isMaster && tenantInfo ? `/${tenantInfo.max_users}` : ''})`
              : tab === 'boards'
                ? `Tableros (${boards.length})`
                : `Bases (${bases.length})`}
          </button>
        ))}
        {isMaster && (
          <button onClick={() => setActiveTab('tenants')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'tenants' ? 'bg-amber-600 text-white' : 'bg-surface-raised text-ink-md hover:bg-surface-hover'}`}>
            🌿 Ramas
          </button>
        )}
      </div>

      {activeTab === 'tenants' && isMaster && <TenantsPanel />}

      {activeTab === 'bases' && (
        <div className="space-y-2">
          {bases.length === 0 && (
            <p className="text-slate-400 text-sm py-6 text-center">No hay bases todavía.</p>
          )}
          {bases.map(b => (
            <div key={b.id} className="bg-surface-raised rounded-xl p-3.5 flex items-center gap-3">
              <span className="text-xl">{b.icon}</span>
              <span className="flex-1 text-white text-sm font-medium truncate">{b.name}</span>
              <button
                onClick={() => deleteBase(b)}
                className="p-1.5 text-ink-lo hover:text-red-400 hover:bg-red-900/20 rounded"
                title="Eliminar base"
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      )}

      {error && <div className="bg-red-900/40 border border-red-700 text-red-300 px-4 py-2 rounded-lg mb-4 text-sm">{error}</div>}

      {activeTab === 'users' && (
        <div className="space-y-3">
          {/* Resumen de seguridad: lo primero que hay que poder leer sin
              recorrer la lista usuario por usuario. */}
          {(() => {
            const pendientes = users.filter(u => u.password_is_default === 1);
            if (users.length === 0) return null;
            if (pendientes.length === 0) {
              return (
                <div className="flex items-center gap-2.5 rounded-panel border border-state-ok/25 bg-state-ok/[0.08] px-4 py-2.5">
                  <ShieldCheck size={15} className="flex-shrink-0 text-state-ok" />
                  <p className="text-[0.85rem] text-ink-md">
                    Todo el equipo tiene contraseña propia.
                  </p>
                </div>
              );
            }
            return (
              <div className="rounded-panel border border-state-crit/25 bg-state-crit/[0.08] px-4 py-3">
                <div className="flex items-start gap-2.5">
                  <KeyRound size={15} className="mt-0.5 flex-shrink-0 text-[#f79c8d]" />
                  <div className="min-w-0">
                    <p className="text-[0.88rem] font-medium text-ink-hi">
                      <span className="tnum">{pendientes.length}</span> de{' '}
                      <span className="tnum">{users.length}</span>{' '}
                      {pendientes.length === 1 ? 'persona sigue' : 'personas siguen'} con la contraseña por defecto
                    </p>
                    <p className="mt-1 text-[0.82rem] leading-relaxed text-ink-md">
                      No pueden usar Trochi hasta cambiarla: al ingresar les aparece el pedido.
                      Mientras no lo hagan, la autoría de sus tarjetas no prueba quién las hizo.
                    </p>
                    <p className="fineprint mt-1.5 truncate">
                      {pendientes.map(u => '@' + u.username).join(' · ')}
                    </p>
                  </div>
                </div>
              </div>
            );
          })()}

          {users.map(u => (
            <div key={u.id} className="card p-4">
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
                  <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold ${u.is_admin ? 'bg-state-warn/85 text-[#2a1e06]' : 'bg-brand text-brand-ink'}`}>
                    {u.is_admin ? <Shield size={16} /> : u.display_name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-sm font-medium text-ink-hi">{u.display_name}</span>
                      {!!u.is_admin && <span className="chip chip-warn">Admin</span>}
                      {/* Estado de la contraseña: lo primero que hay que poder
                          ver de un vistazo en una lista de usuarios. */}
                      {u.password_is_default === 1 ? (
                        <span className="chip chip-crit" title="Sigue usando la contraseña que se repartió a todos">
                          <KeyRound size={10} /> Clave por defecto
                        </span>
                      ) : (
                        <span
                          className="chip chip-ok"
                          title={u.password_changed_at ? `Cambiada el ${new Date(u.password_changed_at.replace(' ', 'T') + 'Z').toLocaleDateString('es-AR')}` : 'Contraseña propia'}
                        >
                          <ShieldCheck size={10} /> Clave propia
                        </span>
                      )}
                    </div>
                    <span className="fineprint">@{u.username}</span>
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
                    {u.board_ids.length === 0 && !u.is_admin && <span className="fineprint">Sin tableros</span>}
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <button onClick={() => setEditingUser(u)} aria-label={`Editar ${u.display_name}`} className="btn-icon"><Pencil size={15} /></button>
                    <button onClick={() => deleteUser(u.id)} aria-label={`Eliminar ${u.display_name}`} className="btn-icon hover:bg-state-crit/15 hover:text-[#f79c8d]"><Trash2 size={15} /></button>
                  </div>
                </div>
              )}
            </div>
          ))}

          {showNewUser ? (
            <div className="bg-surface-raised rounded-xl p-4 border border-teal-600/50">
              <h3 className="text-white font-medium mb-3 text-sm">Nuevo usuario</h3>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="text-ink-lo text-xs mb-1 block">Usuario *</label>
                  <input value={newUser.username} onChange={e => setNewUser(p => ({ ...p, username: e.target.value }))} className="w-full bg-surface-sunken border border-line text-white text-sm rounded px-2 py-1.5 focus:outline-none focus:border-brand" placeholder="juan_perez" />
                </div>
                <div>
                  <label className="text-ink-lo text-xs mb-1 block">Nombre para mostrar</label>
                  <input value={newUser.display_name} onChange={e => setNewUser(p => ({ ...p, display_name: e.target.value }))} className="w-full bg-surface-sunken border border-line text-white text-sm rounded px-2 py-1.5 focus:outline-none focus:border-brand" placeholder="Juan Pérez" />
                </div>
                <div>
                  <label className="text-ink-lo text-xs mb-1 block">Contraseña *</label>
                  <input type="password" value={newUser.password} onChange={e => setNewUser(p => ({ ...p, password: e.target.value }))} className="w-full bg-surface-sunken border border-line text-white text-sm rounded px-2 py-1.5 focus:outline-none focus:border-brand" placeholder="••••••••" />
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={newUser.is_admin} onChange={e => setNewUser(p => ({ ...p, is_admin: e.target.checked }))} className="accent-amber-500" />
                    <span className="text-ink-md text-sm">Es administrador</span>
                  </label>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={createUser} disabled={saving} className="bg-brand hover:bg-brand-hi text-white text-sm px-4 py-1.5 rounded font-medium">Crear</button>
                <button onClick={() => { setShowNewUser(false); setError(''); }} className="text-ink-lo hover:text-white text-sm px-3 py-1.5 rounded hover:bg-white/10">Cancelar</button>
              </div>
            </div>
          ) : (
            users.filter(u => !u.is_admin).length < 50 && (
              <button onClick={() => setShowNewUser(true)} className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-line hover:border-brand rounded-xl text-ink-lo hover:text-white text-sm transition-colors">
                <Plus size={16} /> Agregar usuario
              </button>
            )
          )}
        </div>
      )}

      {activeTab === 'boards' && (
        <div className="space-y-3">
          {boards.map(b => (
            <div key={b.id} className="bg-surface-raised rounded-xl p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg flex-shrink-0" style={{ background: b.background }} />
                <div className="flex-1 min-w-0">
                  <span className="text-white font-medium">{b.title}</span>
                  {b.is_public ? (
                    <span className="ml-2 text-[10px] bg-sky-600/30 text-sky-300 px-1.5 py-0.5 rounded-full inline-flex items-center gap-1"><Globe size={9} /> Global</span>
                  ) : null}
                </div>
                <span className="text-ink-lo text-xs">
                  {b.is_public ? 'Todos los usuarios' : `${users.filter(u => u.board_ids.includes(b.id)).length} miembros`}
                </span>
                <button onClick={() => toggleGlobal(b)}
                  className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg transition-colors ${b.is_public ? 'bg-sky-600 text-white' : 'bg-white/5 text-ink-lo hover:text-white hover:bg-white/10'}`}
                  title={b.is_public ? 'Dejar de ser global' : 'Hacer global (visible para todos)'}>
                  <Globe size={13} /> Global
                </button>
                <button onClick={() => setExpandedBoard(expandedBoard === b.id ? null : b.id)}
                  className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg transition-colors ${expandedBoard === b.id ? 'bg-brand text-white' : 'bg-white/5 text-ink-lo hover:text-white hover:bg-white/10'}`}>
                  <Users size={13} /> Accesos
                </button>
                <button onClick={() => deleteBoard(b.id)} className="p-1.5 text-ink-lo hover:text-red-400 hover:bg-red-900/20 rounded"><Trash2 size={15} /></button>
              </div>

              {expandedBoard === b.id && (
                <div className="mt-3 pt-3 border-t border-white/10">
                  <p className="text-ink-lo text-xs mb-2">
                    {b.is_public ? 'Este tablero es global: todos los usuarios lo ven aunque no sean miembros.' : 'Usuarios con acceso a este tablero:'}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {users.filter(u => !u.is_admin).map(u => {
                      const has = u.board_ids.includes(b.id);
                      return (
                        <button key={u.id} onClick={() => toggleBoardMember(b.id, u.id, has)}
                          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${has ? 'bg-brand border-brand text-white' : 'bg-transparent border-line text-ink-md hover:border-brand'}`}>
                          {has && <Check size={10} />} {u.display_name}
                        </button>
                      );
                    })}
                    {users.filter(u => !u.is_admin).length === 0 && <span className="text-ink-lo text-xs">No hay usuarios creados aún.</span>}
                  </div>
                </div>
              )}
            </div>
          ))}

          {showNewBoard ? (
            <div className="bg-surface-raised rounded-xl p-4 border border-teal-600/50">
              <h3 className="text-white font-medium mb-3 text-sm">Nuevo tablero</h3>
              <div className="space-y-3">
                <input value={newBoard.title} onChange={e => setNewBoard(p => ({ ...p, title: e.target.value }))} className="w-full bg-surface-sunken border border-line text-white text-sm rounded px-2 py-1.5 focus:outline-none focus:border-brand" placeholder="Nombre del tablero" />
                <div className="flex gap-2 flex-wrap">
                  {BG_COLORS.map(c => (
                    <button key={c} onClick={() => setNewBoard(p => ({ ...p, background: c }))} className="w-8 h-8 rounded-lg border-2 transition-transform hover:scale-110" style={{ background: c, borderColor: newBoard.background === c ? 'white' : 'transparent' }} />
                  ))}
                </div>
                <div className="flex gap-2">
                  <button onClick={createBoard} className="bg-brand hover:bg-brand-hi text-white text-sm px-4 py-1.5 rounded font-medium">Crear</button>
                  <button onClick={() => setShowNewBoard(false)} className="text-ink-lo hover:text-white text-sm px-3 py-1.5 rounded hover:bg-white/10">Cancelar</button>
                </div>
              </div>
            </div>
          ) : (
            <button onClick={() => setShowNewBoard(true)} className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-line hover:border-brand rounded-xl text-ink-lo hover:text-white text-sm transition-colors">
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
          <label className="text-ink-lo text-xs mb-1 block">Usuario</label>
          <input value={user.username} onChange={e => onChange({ ...user, username: e.target.value })} className="w-full bg-surface-sunken border border-line text-white text-sm rounded px-2 py-1.5 focus:outline-none focus:border-brand" />
        </div>
        <div>
          <label className="text-ink-lo text-xs mb-1 block">Nombre</label>
          <input value={user.display_name} onChange={e => onChange({ ...user, display_name: e.target.value })} className="w-full bg-surface-sunken border border-line text-white text-sm rounded px-2 py-1.5 focus:outline-none focus:border-brand" />
        </div>
        <div>
          <label className="text-ink-lo text-xs mb-1 block">Nueva contraseña (dejar vacío para no cambiar)</label>
          <input type="password" value={user.password || ''} onChange={e => onChange({ ...user, password: e.target.value })} className="w-full bg-surface-sunken border border-line text-white text-sm rounded px-2 py-1.5 focus:outline-none focus:border-brand" placeholder="••••••••" />
        </div>
        <div className="flex items-end">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={!!user.is_admin} onChange={e => onChange({ ...user, is_admin: e.target.checked ? 1 : 0 })} className="accent-amber-500" />
            <span className="text-ink-md text-sm">Es administrador</span>
          </label>
        </div>
      </div>
      <div>
        <label className="text-ink-lo text-xs mb-1 block">Acceso a tableros</label>
        <div className="flex flex-wrap gap-2">
          {boards.map(b => {
            const has = user.board_ids.includes(b.id);
            return (
              <button
                key={b.id}
                onClick={() => onChange({ ...user, board_ids: has ? user.board_ids.filter(id => id !== b.id) : [...user.board_ids, b.id] })}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border-2 transition-all"
                style={{ background: has ? b.background : 'transparent', borderColor: b.background, color: has ? 'white' : 'var(--t-md)' }}
              >
                {has && <Check size={10} />} {b.title}
              </button>
            );
          })}
          {boards.length === 0 && <span className="text-ink-lo text-xs">No hay tableros creados aún</span>}
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={onSave} disabled={saving} className="bg-brand hover:bg-brand-hi text-white text-sm px-4 py-1.5 rounded font-medium">Guardar</button>
        <button onClick={onCancel} className="text-ink-lo hover:text-white text-sm px-3 py-1.5 rounded hover:bg-white/10">Cancelar</button>
      </div>
    </div>
  );
}
