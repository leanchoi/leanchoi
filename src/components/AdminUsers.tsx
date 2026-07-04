'use client'

import { useEffect, useState } from 'react'
import Avatar from './Avatar'
import Modal from './Modal'

type U = {
  id: string
  username: string
  name: string
  role: string
  avatar: string | null
  created_at: string
}

export default function AdminUsers() {
  const [users, setUsers] = useState<U[]>([])
  const [createOpen, setCreateOpen] = useState(false)
  const [editUser, setEditUser] = useState<U | null>(null)
  const [form, setForm] = useState({ username: '', name: '', password: '', role: 'user' })
  const [error, setError] = useState('')

  async function load() {
    const res = await fetch('/api/users')
    if (res.ok) setUsers((await res.json()).users)
  }
  useEffect(() => {
    load()
  }, [])

  async function createUser(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    const res = await fetch('/api/users', { method: 'POST', body: JSON.stringify(form) })
    const d = await res.json()
    if (!res.ok) {
      setError(d.error || 'Error')
      return
    }
    setCreateOpen(false)
    setForm({ username: '', name: '', password: '', role: 'user' })
    load()
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Usuarios</h1>
          <p className="text-sm text-slate-400">{users.length} de 50 usuarios</p>
        </div>
        <button className="btn-primary" onClick={() => setCreateOpen(true)}>
          + Nuevo usuario
        </button>
      </div>

      <div className="card divide-y divide-slate-800">
        {users.map((u) => (
          <div key={u.id} className="flex items-center gap-3 px-4 py-3">
            <Avatar name={u.name} avatar={u.avatar} size={36} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate font-medium">{u.name}</span>
                {u.role === 'admin' && (
                  <span className="rounded-full bg-teal-900/60 px-2 py-0.5 text-xs text-teal-300">
                    Admin
                  </span>
                )}
              </div>
              <div className="text-xs text-slate-400">@{u.username}</div>
            </div>
            <button className="btn-ghost text-sm" onClick={() => setEditUser(u)}>
              Editar
            </button>
          </div>
        ))}
      </div>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Nuevo usuario">
        <form onSubmit={createUser} className="space-y-3">
          <div>
            <label className="mb-1 block text-sm text-slate-300">Usuario (para ingresar)</label>
            <input
              className="input"
              value={form.username}
              autoCapitalize="none"
              onChange={(e) => setForm({ ...form, username: e.target.value })}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-slate-300">Nombre completo</label>
            <input
              className="input"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-slate-300">Contraseña</label>
            <input
              className="input"
              type="text"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.role === 'admin'}
              onChange={(e) => setForm({ ...form, role: e.target.checked ? 'admin' : 'user' })}
            />
            Es administrador
          </label>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button type="submit" className="btn-primary w-full">
            Crear usuario
          </button>
        </form>
      </Modal>

      {editUser && (
        <EditUserModal
          user={editUser}
          onClose={() => setEditUser(null)}
          onChanged={() => {
            setEditUser(null)
            load()
          }}
        />
      )}
    </div>
  )
}

function EditUserModal({
  user,
  onClose,
  onChanged,
}: {
  user: U
  onClose: () => void
  onChanged: () => void
}) {
  const [name, setName] = useState(user.name)
  const [role, setRole] = useState(user.role)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    const body: any = { name, role }
    if (password) body.password = password
    const res = await fetch(`/api/users/${user.id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    })
    const d = await res.json()
    if (!res.ok) {
      setError(d.error || 'Error')
      return
    }
    onChanged()
  }

  async function remove() {
    if (!confirm(`¿Borrar al usuario "${user.name}"?`)) return
    setError('')
    const res = await fetch(`/api/users/${user.id}`, { method: 'DELETE' })
    const d = await res.json()
    if (!res.ok) {
      setError(d.error || 'Error')
      return
    }
    onChanged()
  }

  return (
    <Modal open onClose={onClose} title={`Editar @${user.username}`}>
      <form onSubmit={save} className="space-y-3">
        <div>
          <label className="mb-1 block text-sm text-slate-300">Nombre</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-sm text-slate-300">
            Nueva contraseña (dejar vacío para no cambiar)
          </label>
          <input
            className="input"
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={role === 'admin'}
            onChange={(e) => setRole(e.target.checked ? 'admin' : 'user')}
          />
          Es administrador
        </label>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <div className="flex gap-2">
          <button type="button" className="btn-danger" onClick={remove}>
            Borrar
          </button>
          <button type="submit" className="btn-primary flex-1">
            Guardar
          </button>
        </div>
      </form>
    </Modal>
  )
}
