'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

/**
 * Ingreso del personal municipal y de los vecinalistas: usuario y contraseña.
 * Sin proveedores externos.
 */
export function FormularioIngreso({ destino }: { destino: string }) {
  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const ingresar = async (evento: React.FormEvent) => {
    evento.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      const respuesta = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ usuario, password }),
      });
      if (!respuesta.ok) {
        const cuerpo = (await respuesta.json().catch(() => null)) as { detalle?: string } | null;
        setError(cuerpo?.detalle ?? 'No se pudo ingresar.');
        return;
      }
      window.location.href = destino;
    } catch {
      setError('No hay conexión con el servidor.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <form onSubmit={ingresar} className="space-y-4">
      <label className="block">
        <span className="text-sm font-medium">Usuario</span>
        <input
          type="text"
          autoComplete="username"
          autoCapitalize="none"
          value={usuario}
          onChange={(e) => setUsuario(e.target.value)}
          className="mt-1 h-14 w-full rounded-lg border bg-transparent px-3 text-base"
          required
        />
      </label>

      <label className="block">
        <span className="text-sm font-medium">Contraseña</span>
        <input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1 h-14 w-full rounded-lg border bg-transparent px-3 text-base"
          required
        />
      </label>

      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}

      <Button type="submit" size="lg" className="w-full" disabled={enviando}>
        {enviando ? 'Entrando…' : 'Entrar'}
      </Button>
    </form>
  );
}
