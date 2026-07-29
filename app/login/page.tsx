'use client';
import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
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
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden p-4">
      {/* Horizonte: una línea de terreno apenas sugerida, como la trocha del logo */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(78%_58%_at_50%_-12%,rgb(46_197_172/0.16)_0%,transparent_64%)]" />
        <div className="absolute bottom-0 left-0 right-0 h-64 bg-[radial-gradient(110%_100%_at_50%_100%,rgb(11_17_29/0.9)_0%,transparent_70%)]" />
        <svg
          className="absolute bottom-0 w-full text-brand/[0.06]"
          viewBox="0 0 1440 220"
          fill="none"
          preserveAspectRatio="none"
          style={{ height: '30vh' }}
        >
          <path d="M0 190 L210 96 L330 142 L520 44 L700 130 L880 70 L1080 150 L1260 90 L1440 168 V220 H0 Z" fill="currentColor" />
          <path
            d="M0 190 L210 96 L330 142 L520 44 L700 130 L880 70 L1080 150 L1260 90 L1440 168"
            stroke="currentColor"
            strokeOpacity="0.5"
            strokeWidth="2"
          />
        </svg>
      </div>

      <div className="animate-rise relative w-full max-w-[25rem]">
        {/* Marca */}
        <div className="mb-9 flex flex-col items-center text-center">
          <span className="mb-5 flex h-16 w-16 items-center justify-center rounded-surface border border-brand/25 bg-gradient-to-b from-surface-raised2 to-surface-sunken text-brand shadow-lift-3">
            <Logo size={38} />
          </span>
          <h1 className="text-[1.9rem] font-light tracking-[0.4em] text-ink-hi" style={{ paddingLeft: '0.4em' }}>
            TROCHI
          </h1>
          <p className="eyebrow mt-2.5">Gestor de proyectos turísticos</p>
        </div>

        <form onSubmit={handleSubmit} className="card p-7">
          <div className="space-y-4">
            <div>
              <label htmlFor="usuario" className="mb-1.5 block text-meta font-medium text-ink-md">
                Usuario
              </label>
              <input
                id="usuario"
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="input"
                placeholder="tu.usuario"
                required
              />
            </div>
            <div>
              <label htmlFor="clave" className="mb-1.5 block text-meta font-medium text-ink-md">
                Contraseña
              </label>
              <input
                id="clave"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input"
                placeholder="••••••••"
                required
              />
            </div>
          </div>

          {error && (
            <p
              role="alert"
              className="mt-4 rounded-control border border-state-crit/30 bg-state-crit/10 px-3 py-2 text-[0.8rem] leading-snug text-[#f79c8d]"
            >
              {error}
            </p>
          )}

          <button type="submit" disabled={loading} className="btn-primary mt-6 w-full py-2.5">
            {loading ? 'Ingresando…' : 'Ingresar'}
            {!loading && <ArrowRight size={15} />}
          </button>
        </form>
      </div>
    </div>
  );
}
