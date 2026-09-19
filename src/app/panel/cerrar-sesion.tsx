'use client';

export function CerrarSesion() {
  return (
    <button
      type="button"
      className="underline"
      onClick={async () => {
        await fetch('/api/auth/logout', { method: 'POST' });
        window.location.href = '/ingresar';
      }}
    >
      Salir
    </button>
  );
}
