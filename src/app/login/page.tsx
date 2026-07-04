'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import Logo from '@/components/Logo'
import Footer from '@/components/Footer'

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const res = await signIn('credentials', { username, password, redirect: false })
    setLoading(false)
    if (res?.error) {
      setError('Usuario o contraseña incorrectos')
    } else {
      // redirect relativo al origin actual
      window.location.href = '/'
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <main className="flex flex-1 items-center justify-center p-4">
        <div className="card w-full max-w-sm p-8">
          <div className="mb-6 flex flex-col items-center gap-3">
            <Logo size={56} />
            <h1 className="text-2xl font-bold tracking-tight">
              Arrayán <span className="text-teal-400">Workflows</span>
            </h1>
            <p className="text-sm text-slate-400">Bases de datos colaborativas</p>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm text-slate-300">Usuario</label>
              <input
                className="input"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoFocus
                autoCapitalize="none"
                autoComplete="username"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-300">Contraseña</label>
              <input
                className="input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? 'Ingresando…' : 'Ingresar'}
            </button>
          </form>
        </div>
      </main>
      <Footer />
    </div>
  )
}
