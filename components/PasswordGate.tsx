'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { ShieldAlert, Check, Eye, EyeOff, LogOut } from 'lucide-react';
import Logo from './Logo';

// ── Bloqueo por contraseña por defecto ───────────────────────────────────
//
// Mientras el usuario siga con la contraseña que se repartió a todos, cualquiera
// que la conozca puede entrar con su cuenta: no hay identidad real y el pie de
// autoría de las tarjetas ("lo creó tal persona") no significa nada.
//
// Por eso este diálogo no se puede cerrar ni saltear. Lo único que ofrece
// además de cambiarla es cerrar sesión.

type Field = 'current' | 'next' | 'repeat';

export default function PasswordGate() {
  const { data: session, update } = useSession();
  const mustChange = !!(session?.user as any)?.mustChangePassword;

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [show, setShow] = useState<Record<Field, boolean>>({ current: false, next: false, repeat: false });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Trampa de foco: el diálogo es modal de verdad, no se puede tabular afuera
  useEffect(() => {
    if (!mustChange || done) return;
    const focusables = () =>
      Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>('input:not([disabled]), button:not([disabled])') || []
      ).filter((el) => el.offsetParent !== null);
    focusables()[0]?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Tab') return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [mustChange, done]);

  const submit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError('');
      if (next !== repeat) {
        setError('Las dos contraseñas nuevas no coinciden.');
        return;
      }
      setSaving(true);
      const res = await fetch('/api/me/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: current, password: next }),
      });
      setSaving(false);
      if (!res.ok) {
        const body = await res.json().catch(() => ({} as any));
        setError(body?.error || 'No se pudo cambiar la contraseña.');
        return;
      }
      setDone(true);
      // Refresca la sesión para que mustChangePassword pase a false y el
      // resumen diario pueda aparecer después.
      await update();
    },
    [current, next, repeat, update]
  );

  if (!mustChange || done) return null;

  const rules = [
    { ok: next.length >= 8, text: 'Al menos 8 caracteres' },
    { ok: next.length > 0 && !/^(0?123456789|12345678)$/.test(next), text: 'Que no sea 123456789' },
    { ok: next.length > 0 && next === repeat, text: 'Las dos coinciden' },
  ];
  const canSubmit = current.length > 0 && rules.every((r) => r.ok) && !saving;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center overflow-y-auto bg-surface-void/85 p-4 backdrop-blur-md">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pw-title"
        aria-describedby="pw-desc"
        className="card animate-rise my-auto w-full max-w-md overflow-hidden"
      >
        <div className="flex items-start gap-3.5 border-b border-line/70 bg-state-warn/[0.07] p-5">
          <span className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-control border border-state-warn/30 bg-state-warn/15 text-[#f0c078]">
            <ShieldAlert size={18} />
          </span>
          <div>
            <h2 id="pw-title" className="text-[1.05rem] font-semibold">
              Tenés que cambiar tu contraseña
            </h2>
            <p id="pw-desc" className="mt-1 text-[0.85rem] leading-relaxed text-ink-md">
              Seguís usando la contraseña que se le dio a todo el equipo. Mientras sea así, cualquiera que
              la conozca puede entrar con tu cuenta y firmar cosas con tu nombre.
            </p>
          </div>
        </div>

        <form onSubmit={submit} className="p-5">
          <div className="space-y-3.5">
            <PasswordField
              id="pw-current"
              label="Contraseña actual"
              value={current}
              onChange={setCurrent}
              visible={show.current}
              onToggle={() => setShow((s) => ({ ...s, current: !s.current }))}
              autoComplete="current-password"
              autoFocus
            />
            <PasswordField
              id="pw-next"
              label="Contraseña nueva"
              value={next}
              onChange={setNext}
              visible={show.next}
              onToggle={() => setShow((s) => ({ ...s, next: !s.next }))}
              autoComplete="new-password"
            />
            <PasswordField
              id="pw-repeat"
              label="Repetila"
              value={repeat}
              onChange={setRepeat}
              visible={show.repeat}
              onToggle={() => setShow((s) => ({ ...s, repeat: !s.repeat }))}
              autoComplete="new-password"
            />
          </div>

          <ul className="mt-4 space-y-1.5">
            {rules.map((r) => (
              <li key={r.text} className="flex items-center gap-2 text-micro">
                <span
                  className={`flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded-full transition-colors ${
                    r.ok ? 'bg-state-ok/20 text-state-ok' : 'bg-white/[0.07] text-ink-lo'
                  }`}
                >
                  {r.ok ? <Check size={9} strokeWidth={3} /> : <span className="h-1 w-1 rounded-full bg-current" />}
                </span>
                <span className={r.ok ? 'text-ink-md' : 'text-ink-lo'}>{r.text}</span>
              </li>
            ))}
          </ul>

          {error && (
            <p
              role="alert"
              className="mt-4 rounded-control border border-state-crit/30 bg-state-crit/10 px-3 py-2 text-[0.8rem] leading-snug text-[#f79c8d]"
            >
              {error}
            </p>
          )}

          <button type="submit" disabled={!canSubmit} className="btn-primary mt-5 w-full py-2.5">
            {saving ? 'Guardando…' : 'Cambiar y continuar'}
          </button>

          <button
            type="button"
            onClick={async () => { await signOut({ redirect: false }); window.location.href = '/login'; }}
            className="btn-ghost mt-2 w-full text-meta"
          >
            <LogOut size={13} /> Salir sin cambiarla
          </button>
        </form>

        <div className="flex items-center gap-2 border-t border-line/70 px-5 py-3">
          <Logo size={13} className="flex-shrink-0 text-brand/60" />
          <p className="fineprint">Trochi no guarda tu contraseña: sólo un hash.</p>
        </div>
      </div>
    </div>
  );
}

function PasswordField({
  id, label, value, onChange, visible, onToggle, autoComplete, autoFocus,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  visible: boolean;
  onToggle: () => void;
  autoComplete: string;
  autoFocus?: boolean;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-meta font-medium text-ink-md">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          required
          className="input pr-10"
        />
        <button
          type="button"
          onClick={onToggle}
          aria-label={visible ? 'Ocultar la contraseña' : 'Mostrar la contraseña'}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 btn-icon"
        >
          {visible ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      </div>
    </div>
  );
}
