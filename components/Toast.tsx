'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, AlertTriangle, Info, X, Undo2 } from 'lucide-react';

// ── Avisos de la app ─────────────────────────────────────────────────────
//
// Reemplaza los alert() nativos: no bloquean el hilo, se pueden estilar y
// permiten ofrecer "Deshacer" en las acciones destructivas.

type ToastKind = 'success' | 'error' | 'info';

export type Toast = {
  id: number;
  kind: ToastKind;
  message: string;
  /** Acción opcional a la derecha del mensaje (típicamente "Deshacer"). */
  action?: { label: string; onClick: () => void };
  /** ms hasta que se va solo; 0 = queda hasta que lo cierren. */
  duration: number;
};

type ToastApi = {
  show: (message: string, opts?: { kind?: ToastKind; duration?: number; action?: Toast['action'] }) => number;
  success: (message: string, opts?: { duration?: number; action?: Toast['action'] }) => number;
  error: (message: string, opts?: { duration?: number; action?: Toast['action'] }) => number;
  dismiss: (id: number) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

const ICONS = { success: CheckCircle2, error: AlertTriangle, info: Info };

const STYLES: Record<ToastKind, string> = {
  success: 'border-emerald-500/40 bg-emerald-950/85 text-emerald-100',
  error: 'border-red-500/40 bg-red-950/85 text-red-100',
  info: 'border-slate-600/60 bg-slate-900/90 text-slate-100',
};

const ICON_STYLES: Record<ToastKind, string> = {
  success: 'text-emerald-400',
  error: 'text-red-400',
  info: 'text-teal-300',
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback<ToastApi['show']>((message, opts) => {
    const id = nextId.current++;
    const duration = opts?.duration ?? (opts?.action ? 7000 : 4000);
    setToasts((prev) => [...prev, { id, kind: opts?.kind ?? 'info', message, action: opts?.action, duration }]);
    return id;
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      show,
      success: (m, o) => show(m, { ...o, kind: 'success' }),
      error: (m, o) => show(m, { ...o, kind: 'error' }),
      dismiss,
    }),
    [show, dismiss]
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        // aria-live para que un lector de pantalla anuncie el aviso
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed bottom-16 left-1/2 z-[100] flex w-full max-w-sm -translate-x-1/2 flex-col gap-2 px-4 sm:bottom-20"
      >
        {toasts.map((t) => (
          <ToastRow key={t.id} toast={t} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastRow({ toast, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
  useEffect(() => {
    if (!toast.duration) return;
    const timer = setTimeout(() => onDismiss(toast.id), toast.duration);
    return () => clearTimeout(timer);
  }, [toast.id, toast.duration, onDismiss]);

  const Icon = ICONS[toast.kind];

  return (
    <div
      role="status"
      className={`pointer-events-auto flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5 shadow-2xl backdrop-blur-md animate-pop ${STYLES[toast.kind]}`}
    >
      <Icon size={16} className={`mt-0.5 flex-shrink-0 ${ICON_STYLES[toast.kind]}`} />
      <p className="flex-1 text-sm leading-snug">{toast.message}</p>
      {toast.action && (
        <button
          onClick={() => {
            toast.action!.onClick();
            onDismiss(toast.id);
          }}
          className="flex flex-shrink-0 items-center gap-1 rounded-lg bg-white/10 px-2 py-1 text-xs font-medium hover:bg-white/20 transition-colors"
        >
          <Undo2 size={12} /> {toast.action.label}
        </button>
      )}
      <button
        onClick={() => onDismiss(toast.id)}
        aria-label="Cerrar aviso"
        className="flex-shrink-0 rounded p-0.5 opacity-60 hover:opacity-100 transition-opacity"
      >
        <X size={14} />
      </button>
    </div>
  );
}

/**
 * Devuelve la API de avisos. Fuera del provider degrada a no-op en vez de
 * romper, para que un componente suelto no tire la página.
 */
export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  const fallback = useMemo<ToastApi>(
    () => ({ show: () => 0, success: () => 0, error: () => 0, dismiss: () => {} }),
    []
  );
  return ctx ?? fallback;
}

/**
 * Helper para las llamadas a la API: si la respuesta no es ok, muestra el
 * mensaje de error del backend y devuelve null.
 *
 * Antes buena parte de los fetch no miraban res.ok: con la rama vencida (403)
 * la respuesta `{error: "..."}` se insertaba en el estado como si fuera el
 * objeto creado, y aparecían listas y tarjetas fantasma.
 */
export async function apiCall<T = any>(
  input: RequestInfo,
  init: RequestInit | undefined,
  toast: ToastApi,
  fallbackMessage = 'No se pudo completar la acción'
): Promise<T | null> {
  try {
    const res = await fetch(input, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({} as any));
      toast.error(body?.error || fallbackMessage);
      return null;
    }
    if (res.status === 204) return {} as T;
    return (await res.json().catch(() => ({}))) as T;
  } catch {
    toast.error('Sin conexión con el servidor. Revisá tu red e intentá de nuevo.');
    return null;
  }
}
