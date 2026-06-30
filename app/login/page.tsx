'use client';
import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';

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
    if (res?.ok) router.push('/boards');
    else { setError('Usuario o contraseña incorrectos'); setLoading(false); }
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #0052cc 0%, #0079bf 100%)' }}>
      <div className="bg-[#22272b] rounded-xl shadow-2xl p-8 w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-blue-600 rounded-xl mb-4">
            <svg className="w-7 h-7 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M3 5a2 2 0 012-2h4a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2V5zm10 0a2 2 0 012-2h4a2 2 0 012 2v3a2 2 0 01-2 2h-4a2 2 0 01-2-2V5zm0 9a2 2 0 012-2h4a2 2 0 012 2v5a2 2 0 01-2 2h-4a2 2 0 01-2-2v-5z"/>
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white">LeanBoard</h1>
          <p className="text-[#8c9bab] text-sm mt-1">Iniciá sesión para continuar</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[#b6c2cf] mb-1">Usuario</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              className="w-full px-3 py-2 bg-[#2c3540] border border-[#3d4b58] rounded-lg text-white placeholder-[#8c9bab] focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              placeholder="tu_usuario"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[#b6c2cf] mb-1">Contraseña</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full px-3 py-2 bg-[#2c3540] border border-[#3d4b58] rounded-lg text-white placeholder-[#8c9bab] focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              placeholder="••••••••"
              required
            />
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold rounded-lg transition-colors"
          >
            {loading ? 'Ingresando...' : 'Ingresar'}
          </button>
        </form>
      </div>
    </div>
  );
}
