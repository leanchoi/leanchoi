'use client';
import { useEffect, useState } from 'react';
import { Plus, Pencil, X, Shield, HardDrive, Users, CalendarClock } from 'lucide-react';

// Panel de ramas del Admin Master: crear ramas con su admin, editar cupos y
// vencimiento. Una rama vencida queda en solo-lectura hasta renovarla.
type Tenant = {
  id: number;
  name: string;
  max_users: number;
  storage_mb: number;
  expires_at: string | null;
  user_count: number;
  storage_used: number;
  board_count: number;
  base_count: number;
  admins: { id: number; username: string; display_name: string }[];
};

function fmtDate(d: string | null) {
  if (!d) return 'sin vencimiento';
  return d.slice(0, 10).split('-').reverse().join('/');
}

function expired(t: Tenant) {
  return !!t.expires_at && t.expires_at.slice(0, 10) < new Date().toISOString().slice(0, 10);
}

export default function TenantsPanel() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState<Tenant | null>(null);
  const [form, setForm] = useState({
    name: '', adminUsername: '', adminName: '', adminPassword: '',
    maxUsers: 10, storageMb: 500, expiresAt: '',
  });
  const [edit, setEdit] = useState({ name: '', maxUsers: 10, storageMb: 500, expiresAt: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function load() {
    const res = await fetch('/api/admin/tenants');
    if (res.ok) setTenants((await res.json()).tenants);
  }
  useEffect(() => { load(); }, []);

  async function createTenant() {
    setError(''); setSaving(true);
    const res = await fetch('/api/admin/tenants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    setSaving(false);
    if (!res.ok) { setError((await res.json()).error || 'Error'); return; }
    setShowNew(false);
    setForm({ name: '', adminUsername: '', adminName: '', adminPassword: '', maxUsers: 10, storageMb: 500, expiresAt: '' });
    load();
  }

  async function saveTenant() {
    if (!editing) return;
    setError(''); setSaving(true);
    const res = await fetch(`/api/admin/tenants/${editing.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: edit.name,
        maxUsers: edit.maxUsers,
        storageMb: edit.storageMb,
        expiresAt: edit.expiresAt || null,
      }),
    });
    setSaving(false);
    if (!res.ok) { setError((await res.json()).error || 'Error'); return; }
    setEditing(null);
    load();
  }

  const inputCls = 'bg-surface-sunken border border-line text-white text-sm rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-brand w-full';

  return (
    <div className="space-y-3">
      <p className="text-slate-400 text-sm">
        Cada rama tiene su propio admin, sus usuarios y sus proyectos, sin mezclarse con las demás.
        Cuando una rama vence, su gente pasa a <span className="text-amber-300">solo lectura</span> hasta
        que le pongas una nueva fecha.
      </p>
      {error && <div className="bg-red-900/40 border border-red-700 text-red-300 px-4 py-2 rounded-lg text-sm">{error}</div>}

      {tenants.map(t => (
        <div key={t.id} className={`bg-surface-raised rounded-xl p-4 ${expired(t) ? 'border border-amber-600/50' : ''}`}>
          {editing?.id === t.id ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="text-xs text-slate-400">Nombre
                <input className={inputCls} value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} />
              </label>
              <label className="text-xs text-slate-400">Vence (vacío = nunca)
                <input type="date" className={inputCls} value={edit.expiresAt} onChange={e => setEdit({ ...edit, expiresAt: e.target.value })} />
              </label>
              <label className="text-xs text-slate-400">Máx. usuarios
                <input type="number" min={1} className={inputCls} value={edit.maxUsers} onChange={e => setEdit({ ...edit, maxUsers: Number(e.target.value) })} />
              </label>
              <label className="text-xs text-slate-400">Almacenamiento (MB)
                <input type="number" min={50} className={inputCls} value={edit.storageMb} onChange={e => setEdit({ ...edit, storageMb: Number(e.target.value) })} />
              </label>
              <div className="flex gap-2 sm:col-span-2">
                <button onClick={saveTenant} disabled={saving} className="bg-brand hover:bg-brand-hi text-white text-xs px-3.5 py-1.5 rounded-lg font-medium">
                  Guardar
                </button>
                <button onClick={() => setEditing(null)} className="text-slate-400 hover:text-white p-1"><X size={16} /></button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex-1 min-w-40">
                <div className="flex items-center gap-2">
                  <span className="text-white font-medium">{t.name}</span>
                  {t.id === 1 && <span className="text-[10px] bg-brand/30 text-brand-hi px-1.5 py-0.5 rounded">Principal</span>}
                  {expired(t) && <span className="text-[10px] bg-amber-600/30 text-amber-300 px-1.5 py-0.5 rounded">🔒 Vencida · solo lectura</span>}
                </div>
                <div className="text-xs text-slate-400 mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                  <span className="flex items-center gap-1"><Users size={11} /> {t.user_count}/{t.max_users} usuarios</span>
                  <span className="flex items-center gap-1"><HardDrive size={11} /> {(t.storage_used / 1024 / 1024).toFixed(0)}/{t.storage_mb} MB</span>
                  <span className="flex items-center gap-1"><CalendarClock size={11} /> {fmtDate(t.expires_at)}</span>
                  <span>{t.board_count} tableros · {t.base_count} bases</span>
                </div>
                {t.admins.length > 0 && (
                  <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                    <Shield size={11} className="text-amber-400" />
                    {t.admins.map(a => `${a.display_name} (@${a.username})`).join(', ')}
                  </div>
                )}
              </div>
              {t.id !== 1 && (
                <button
                  onClick={() => {
                    setEditing(t);
                    setEdit({ name: t.name, maxUsers: t.max_users, storageMb: t.storage_mb, expiresAt: t.expires_at?.slice(0, 10) || '' });
                  }}
                  className="p-1.5 text-ink-lo hover:text-white hover:bg-white/10 rounded"
                >
                  <Pencil size={15} />
                </button>
              )}
            </div>
          )}
        </div>
      ))}

      {showNew ? (
        <div className="bg-surface-raised rounded-xl p-4">
          <h3 className="text-white text-sm font-semibold mb-3">Nueva rama con su admin</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-xs text-slate-400">Nombre de la rama
              <input className={inputCls} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Agencia Sur" />
            </label>
            <label className="text-xs text-slate-400">Vence (vacío = nunca)
              <input type="date" className={inputCls} value={form.expiresAt} onChange={e => setForm({ ...form, expiresAt: e.target.value })} />
            </label>
            <label className="text-xs text-slate-400">Usuario del admin
              <input className={inputCls} value={form.adminUsername} onChange={e => setForm({ ...form, adminUsername: e.target.value })} placeholder="maria" />
            </label>
            <label className="text-xs text-slate-400">Nombre del admin
              <input className={inputCls} value={form.adminName} onChange={e => setForm({ ...form, adminName: e.target.value })} placeholder="María Pérez" />
            </label>
            <label className="text-xs text-slate-400">Contraseña del admin
              <input type="text" className={inputCls} value={form.adminPassword} onChange={e => setForm({ ...form, adminPassword: e.target.value })} />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs text-slate-400">Máx. usuarios
                <input type="number" min={1} className={inputCls} value={form.maxUsers} onChange={e => setForm({ ...form, maxUsers: Number(e.target.value) })} />
              </label>
              <label className="text-xs text-slate-400">Storage (MB)
                <input type="number" min={50} className={inputCls} value={form.storageMb} onChange={e => setForm({ ...form, storageMb: Number(e.target.value) })} />
              </label>
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <button onClick={createTenant} disabled={saving} className="bg-brand hover:bg-brand-hi text-white text-xs px-3.5 py-1.5 rounded-lg font-medium">
              Crear rama
            </button>
            <button onClick={() => setShowNew(false)} className="text-slate-400 hover:text-white p-1"><X size={16} /></button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowNew(true)}
          className="w-full rounded-xl border-2 border-dashed border-line hover:border-brand py-3 text-sm text-slate-400 hover:text-brand-hi flex items-center justify-center gap-2 transition-colors"
        >
          <Plus size={16} /> Nueva rama
        </button>
      )}
    </div>
  );
}
