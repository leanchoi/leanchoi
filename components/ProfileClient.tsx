'use client';
import { useState, useEffect, useRef } from 'react';
import { Camera, Trash2, Save, KeyRound, UserCircle } from 'lucide-react';
import Avatar from './Avatar';

interface Profile { id: number; username: string; display_name: string; avatar?: string | null; }

export default function ProfileClient() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [msg, setMsg] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [avatarKey, setAvatarKey] = useState(0); // cache-buster after upload
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('/api/me/profile').then(r => r.json()).then(p => { setProfile(p); setDisplayName(p.display_name); });
  }, []);

  async function uploadAvatar(file: File) {
    setMsg(null);
    const form = new FormData();
    form.append('file', file);
    const res = await fetch('/api/me/avatar', { method: 'POST', body: form });
    if (res.ok) {
      const { avatar } = await res.json();
      setProfile(p => p ? { ...p, avatar } : p);
      setAvatarKey(k => k + 1);
      setMsg({ type: 'ok', text: 'Foto actualizada ✓' });
    } else {
      const err = await res.json().catch(() => ({}));
      setMsg({ type: 'error', text: err.error || 'Error al subir la foto' });
    }
    if (fileRef.current) fileRef.current.value = '';
  }

  async function removeAvatar() {
    await fetch('/api/me/avatar', { method: 'DELETE' });
    setProfile(p => p ? { ...p, avatar: null } : p);
    setMsg({ type: 'ok', text: 'Foto eliminada' });
  }

  async function saveName() {
    if (!displayName.trim()) return;
    setSaving(true); setMsg(null);
    const res = await fetch('/api/me/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ display_name: displayName }) });
    if (res.ok) {
      const p = await res.json();
      setProfile(p);
      setMsg({ type: 'ok', text: 'Nombre actualizado ✓' });
    } else {
      const err = await res.json().catch(() => ({}));
      setMsg({ type: 'error', text: err.error || 'Error al guardar' });
    }
    setSaving(false);
  }

  async function changePassword() {
    if (!currentPassword || !newPassword) { setMsg({ type: 'error', text: 'Completá ambas contraseñas' }); return; }
    setSaving(true); setMsg(null);
    const res = await fetch('/api/me/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ currentPassword, password: newPassword }) });
    if (res.ok) {
      setCurrentPassword(''); setNewPassword('');
      setMsg({ type: 'ok', text: 'Contraseña cambiada ✓' });
    } else {
      const err = await res.json().catch(() => ({}));
      setMsg({ type: 'error', text: err.error || 'Error al cambiar la contraseña' });
    }
    setSaving(false);
  }

  if (!profile) return <p className="text-slate-400 text-sm text-center py-10">Cargando...</p>;

  return (
    <div className="space-y-5">
      <h1 className="text-white text-xl font-semibold flex items-center gap-2"><UserCircle size={20} className="text-brand" /> Mi perfil</h1>

      {msg && (
        <div className={`px-4 py-2 rounded-lg text-sm ${msg.type === 'ok' ? 'bg-teal-900/40 border border-teal-700 text-brand-hi' : 'bg-red-900/40 border border-red-700 text-red-300'}`}>
          {msg.text}
        </div>
      )}

      {/* Photo */}
      <div className="bg-surface-raised rounded-xl p-5 flex items-center gap-5">
        <div key={avatarKey}>
          <Avatar userId={profile.id} name={profile.display_name} avatar={profile.avatar} size={72} />
        </div>
        <div className="flex-1">
          <p className="text-white text-sm font-medium">{profile.display_name}</p>
          <p className="text-slate-400 text-xs mb-3">@{profile.username}</p>
          <div className="flex gap-2">
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) uploadAvatar(f); }} />
            <button onClick={() => fileRef.current?.click()} className="flex items-center gap-1.5 bg-brand hover:bg-brand-hi text-white text-xs px-3 py-1.5 rounded-lg font-medium transition-colors">
              <Camera size={13} /> {profile.avatar ? 'Cambiar foto' : 'Subir foto'}
            </button>
            {profile.avatar && (
              <button onClick={removeAvatar} className="flex items-center gap-1.5 text-slate-400 hover:text-red-400 text-xs px-2 py-1.5 rounded-lg hover:bg-white/5 transition-colors">
                <Trash2 size={13} /> Quitar
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Name */}
      <div className="bg-surface-raised rounded-xl p-5">
        <label className="text-slate-400 text-xs mb-1.5 block">Nombre para mostrar</label>
        <div className="flex gap-2">
          <input value={displayName} onChange={e => setDisplayName(e.target.value)}
            className="flex-1 bg-surface-sunken border border-line text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-brand" />
          <button onClick={saveName} disabled={saving || displayName === profile.display_name} className="flex items-center gap-1.5 bg-brand hover:bg-brand-hi disabled:opacity-40 text-white text-sm px-4 py-2 rounded-lg font-medium transition-colors">
            <Save size={14} /> Guardar
          </button>
        </div>
      </div>

      {/* Password */}
      <div className="bg-surface-raised rounded-xl p-5 space-y-3">
        <p className="text-slate-300 text-sm font-medium flex items-center gap-2"><KeyRound size={15} className="text-slate-400" /> Cambiar contraseña</p>
        <div>
          <label className="text-slate-400 text-xs mb-1.5 block">Contraseña actual</label>
          <input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)}
            className="w-full bg-surface-sunken border border-line text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-brand" placeholder="••••••••" />
        </div>
        <div>
          <label className="text-slate-400 text-xs mb-1.5 block">Nueva contraseña (mínimo 6 caracteres)</label>
          <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)}
            className="w-full bg-surface-sunken border border-line text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-brand" placeholder="••••••••" />
        </div>
        <button onClick={changePassword} disabled={saving} className="bg-brand hover:bg-brand-hi disabled:opacity-40 text-white text-sm px-4 py-2 rounded-lg font-medium transition-colors">
          Cambiar contraseña
        </button>
      </div>
    </div>
  );
}
