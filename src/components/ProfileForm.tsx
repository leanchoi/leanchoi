'use client'

import { useEffect, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import Avatar from './Avatar'

export default function ProfileForm() {
  const { data: session, update } = useSession()
  const user = session?.user as any
  const [name, setName] = useState('')
  const [avatar, setAvatar] = useState<string | null>(null)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (user && !loaded) {
      setName(user.name || '')
      setAvatar(user.avatar || null)
      setLoaded(true)
    }
  }, [user, loaded])

  async function uploadAvatar(files: FileList | null) {
    if (!files || !files[0]) return
    const f = files[0]
    if (!f.type.startsWith('image/')) {
      setError('Elegí una imagen')
      return
    }
    setUploading(true)
    setError('')
    const fd = new FormData()
    fd.append('file', f)
    const res = await fetch('/api/upload', { method: 'POST', body: fd })
    const d = await res.json()
    setUploading(false)
    if (res.ok) setAvatar(d.url)
    else setError(d.error || 'Error al subir la foto')
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setMsg('')
    const body: any = { name, avatar }
    if (newPassword) {
      body.currentPassword = currentPassword
      body.newPassword = newPassword
    }
    const res = await fetch('/api/profile', { method: 'PATCH', body: JSON.stringify(body) })
    const d = await res.json()
    if (!res.ok) {
      setError(d.error || 'Error al guardar')
      return
    }
    setMsg('Perfil actualizado ✓')
    setCurrentPassword('')
    setNewPassword('')
    await update()
  }

  if (!user) return <p className="text-slate-400">Cargando…</p>

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Mi perfil</h1>
      <form onSubmit={save} className="card space-y-5 p-6">
        <div className="flex items-center gap-4">
          <Avatar name={name || user.name || ''} avatar={avatar} size={72} />
          <div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => uploadAvatar(e.target.files)}
            />
            <button
              type="button"
              className="btn-ghost border border-slate-700"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
            >
              {uploading ? 'Subiendo…' : 'Cambiar foto'}
            </button>
            {avatar && (
              <button
                type="button"
                className="btn-ghost ml-2 text-red-400"
                onClick={() => setAvatar(null)}
              >
                Quitar
              </button>
            )}
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm text-slate-300">Nombre</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        <div>
          <label className="mb-1 block text-sm text-slate-300">Usuario</label>
          <input className="input opacity-60" value={user.username || ''} disabled />
        </div>

        <div className="border-t border-slate-800 pt-4">
          <p className="mb-3 text-sm font-medium text-slate-300">Cambiar contraseña</p>
          <div className="space-y-3">
            <input
              className="input"
              type="password"
              placeholder="Contraseña actual"
              value={currentPassword}
              autoComplete="current-password"
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
            <input
              className="input"
              type="password"
              placeholder="Nueva contraseña (mín. 6)"
              value={newPassword}
              autoComplete="new-password"
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </div>
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}
        {msg && <p className="text-sm text-teal-400">{msg}</p>}
        <button type="submit" className="btn-primary w-full">
          Guardar cambios
        </button>
      </form>
    </div>
  )
}
