'use client';
import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Logo from '@/components/Logo';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    const res = await signIn('credentials', { username, password, redirect: false });
    if (res?.ok) {
      router.push('/boards');
      return;
    }
    // El limitador de intentos manda su propio mensaje ("probá en N minutos");
    // cualquier otro error se muestra como credenciales inválidas.
    const raw = res?.error || '';
    const isCustom = raw && raw !== 'CredentialsSignin' && !raw.startsWith('http');
    setError(isCustom ? raw : 'Usuario o contraseña incorrectos');
    setLoading(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'radial-gradient(ellipse at 20% 0%, #134e4a 0%, transparent 55%), radial-gradient(ellipse at 90% 100%, #164e63 0%, transparent 55%), #0f172a' }}>
      <div className="bg-[#1e293b]/80 backdrop-blur border border-white/10 rounded-2xl shadow-2xl p-8 w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-[#1d3461] to-[#101f3c] border border-[#b9c8ea]/20 rounded-2xl mb-5 shadow-lg shadow-black/50 text-[#b9c8ea]">
            <Logo size={42} />
          </div>
          <h1 className="text-3xl font-extralight text-white tracking-[0.42em] pl-[0.42em]">TROCHI</h1>
          <p className="text-teal-300/70 text-[11px] mt-2.5 uppercase tracking-[0.22em]">Gestor de Proyectos Turísticos</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Usuario</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              className="w-full px-3 py-2 bg-[#0f172a] border border-[#3b5068] rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-teal-400 focus:ring-1 focus:ring-teal-400"
              placeholder="tu_usuario"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Contraseña</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full px-3 py-2 bg-[#0f172a] border border-[#3b5068] rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-teal-400 focus:ring-1 focus:ring-teal-400"
              placeholder="••••••••"
              required
            />
          </div>
          {error && (
            <p role="alert" className="rounded-lg border border-red-500/30 bg-red-950/40 px-3 py-2 text-red-300 text-sm">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 bg-gradient-to-r from-teal-500 to-cyan-600 hover:from-teal-400 hover:to-cyan-500 disabled:opacity-60 text-white font-semibold rounded-lg transition-all shadow-lg shadow-teal-900/40"
          >
            {loading ? 'Ingresando...' : 'Ingresar'}
          </button>
        </form>
      </div>
    </div>
  );
}
