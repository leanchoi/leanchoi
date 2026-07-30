'use client';

import { useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { ArrowDownRight, ArrowUpRight, CheckCircle2, Clock, Flame, Minus, X } from 'lucide-react';
import Link from 'next/link';

// ── Resumen diario de actividad ──────────────────────────────────────────
//
// Se muestra una vez por día, en el primer login, y sólo después de que el
// usuario haya cambiado la contraseña por defecto (el bloqueo tiene prioridad,
// así nunca se apilan dos ventanas).
//
// Sobre el encuadre, que acá importa tanto como los datos: el titular es la
// comparación con la propia semana anterior, no con los compañeros. La
// referencia del equipo va como mediana y en segundo plano. El tiempo conectado
// es contexto, no titular. Y se dice explícitamente que la actividad queda
// registrada, en lugar de dejarlo entrever.

type Metric = { key: string; label: string; value: number; prev: number; teamMedian: number };

type Digest = {
  day: string;
  displayName: string;
  metrics: Metric[];
  streakDays: number;
  teamSize: number;
  minutesThisWeek: number;
  minutesTeamMedian: number;
  pendingItems: number;
  overdueItems: number;
};

function formatMinutes(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

export default function DailyDigest() {
  const { data: session } = useSession();
  const mustChange = !!(session?.user as any)?.mustChangePassword;
  const [digest, setDigest] = useState<Digest | null>(null);
  const [closing, setClosing] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const asked = useRef(false);

  useEffect(() => {
    if (!session || mustChange || asked.current) return;
    asked.current = true;
    fetch('/api/me/digest')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.pending && d.digest) setDigest(d.digest); })
      .catch(() => {});
  }, [session, mustChange]);

  function dismiss() {
    setClosing(true);
    // keepalive: si el usuario cierra y navega en el mismo gesto, la petición
    // sobrevive a la navegación. Sin esto el "ya lo vi" se perdía y el resumen
    // volvía a aparecer.
    fetch('/api/me/digest', { method: 'POST', keepalive: true }).catch(() => {});
    setDigest(null);
  }

  useEffect(() => {
    if (!digest) return;
    panelRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') dismiss();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [digest]);

  if (!digest || closing) return null;

  const done = digest.metrics.find((m) => m.key === 'done');
  const totalNow = digest.metrics.reduce((a, m) => a + m.value, 0);
  const totalPrev = digest.metrics.reduce((a, m) => a + m.prev, 0);
  const delta = totalNow - totalPrev;

  // El titular sale de la comparación con la propia semana anterior
  let headline: string;
  if (totalPrev === 0 && totalNow === 0) headline = 'Todavía no registraste actividad esta semana';
  else if (totalPrev === 0) headline = `Arrancaste la semana con ${totalNow} ${totalNow === 1 ? 'acción' : 'acciones'}`;
  else if (delta > 0) headline = `Vas ${delta} ${delta === 1 ? 'acción' : 'acciones'} por encima de tu semana pasada`;
  else if (delta < 0) headline = `Vas ${-delta} ${-delta === 1 ? 'acción' : 'acciones'} por debajo de tu semana pasada`;
  else headline = 'Vas al mismo ritmo que la semana pasada';

  const minDelta = digest.minutesThisWeek - digest.minutesTeamMedian;

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center overflow-y-auto bg-surface-void/80 p-4 backdrop-blur-md">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="digest-title"
        tabIndex={-1}
        className="card animate-rise my-auto w-full max-w-lg overflow-hidden"
      >
        {/* Encabezado */}
        <div className="relative border-b border-line/70 bg-gradient-to-b from-brand/[0.08] to-transparent p-5 pr-14">
          <p className="eyebrow">Tu semana en Trochi</p>
          <h2 id="digest-title" className="mt-1.5 text-[1.15rem] font-semibold leading-snug">
            {headline}
          </h2>
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            {digest.streakDays > 1 && (
              <span className="chip chip-warn">
                <Flame size={11} /> {digest.streakDays} días seguidos
              </span>
            )}
            {done && done.value > 0 && (
              <span className="chip chip-ok">
                <CheckCircle2 size={11} /> {done.value} {done.value === 1 ? 'ítem cerrado' : 'ítems cerrados'}
              </span>
            )}
          </div>

          <button
            onClick={dismiss}
            aria-label="Cerrar el resumen"
            className="btn-icon absolute right-3 top-4"
          >
            <X size={17} />
          </button>
        </div>

        {/* Métricas: propio vs. semana anterior, con la mediana del equipo detrás */}
        <div className="divide-y divide-line/50">
          {digest.metrics.map((m) => {
            const d = m.value - m.prev;
            const peak = Math.max(m.value, m.prev, m.teamMedian, 1);
            return (
              <div key={m.key} className="flex items-center gap-4 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="tnum text-[1.35rem] font-semibold leading-none text-ink-hi">{m.value}</span>
                    <span className="text-[0.82rem] text-ink-md">{m.label}</span>
                  </div>

                  {/* Barra propia + marca de la mediana del equipo */}
                  <div className="relative mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                    <div
                      className="h-full rounded-full bg-brand transition-all"
                      style={{ width: `${Math.round((m.value / peak) * 100)}%` }}
                    />
                    {digest.teamSize > 1 && m.teamMedian > 0 && (
                      <span
                        aria-hidden="true"
                        className="absolute top-[-2px] h-[10px] w-[2px] rounded-full bg-ink-md/70"
                        style={{ left: `calc(${Math.round((m.teamMedian / peak) * 100)}% - 1px)` }}
                      />
                    )}
                  </div>

                  <p className="fineprint mt-1.5">
                    {digest.teamSize > 1 && m.teamMedian > 0
                      ? `Mediana del equipo: ${m.teamMedian}`
                      : 'Semana pasada: ' + m.prev}
                  </p>
                </div>

                <span
                  className={`chip flex-shrink-0 tnum ${
                    d > 0 ? 'chip-ok' : d < 0 ? 'chip-neutral' : 'chip-neutral'
                  }`}
                  title="Comparado con tu semana pasada"
                >
                  {d > 0 ? <ArrowUpRight size={11} /> : d < 0 ? <ArrowDownRight size={11} /> : <Minus size={11} />}
                  {d === 0 ? 'igual' : `${d > 0 ? '+' : ''}${d}`}
                </span>
              </div>
            );
          })}
        </div>

        {/* Contexto: tiempo y pendientes */}
        <div className="grid grid-cols-1 gap-px bg-line/50 sm:grid-cols-2">
          <div className="bg-surface-raised px-5 py-3.5">
            <p className="eyebrow flex items-center gap-1.5">
              <Clock size={11} /> Tiempo en la plataforma
            </p>
            <p className="tnum mt-1 text-[0.95rem] font-medium text-ink-hi">
              {formatMinutes(digest.minutesThisWeek)}
            </p>
            {digest.teamSize > 1 && (
              <p className="fineprint mt-0.5">
                {minDelta === 0
                  ? 'Igual que la mediana del equipo'
                  : `${formatMinutes(Math.abs(minDelta))} ${minDelta > 0 ? 'por encima' : 'por debajo'} de la mediana`}
              </p>
            )}
          </div>
          <div className="bg-surface-raised px-5 py-3.5">
            <p className="eyebrow">Tus pendientes</p>
            <p className="tnum mt-1 text-[0.95rem] font-medium text-ink-hi">
              {digest.pendingItems} {digest.pendingItems === 1 ? 'ítem' : 'ítems'}
            </p>
            {digest.overdueItems > 0 ? (
              <p className="fineprint mt-0.5 text-[#f79c8d]">
                {digest.overdueItems} {digest.overdueItems === 1 ? 'vencido' : 'vencidos'}
              </p>
            ) : (
              <p className="fineprint mt-0.5">Ninguno vencido</p>
            )}
          </div>
        </div>

        {/* Acción concreta: lo mejor que puede hacer ahora, en función de su estado */}
        <div className="border-t border-line/70 p-5">
          {digest.overdueItems > 0 ? (
            <p className="text-[0.85rem] leading-relaxed text-ink-md">
              Lo más útil ahora: destrabar {digest.overdueItems === 1 ? 'el ítem vencido' : `los ${digest.overdueItems} ítems vencidos`}.
              Si alguno depende de otra persona, dejale un comentario y queda registrado.
            </p>
          ) : digest.pendingItems > 0 ? (
            <p className="text-[0.85rem] leading-relaxed text-ink-md">
              Estás al día con los vencimientos. Te quedan {digest.pendingItems}{' '}
              {digest.pendingItems === 1 ? 'ítem' : 'ítems'} por delante.
            </p>
          ) : (
            <p className="text-[0.85rem] leading-relaxed text-ink-md">
              No tenés nada pendiente asignado. Buen momento para tomar algo de las listas del equipo.
            </p>
          )}

          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Link href="/rankings" onClick={dismiss} className="btn-secondary flex-1">
              Ver mi actividad completa
            </Link>
            <button onClick={dismiss} className="btn-primary flex-1">
              Empezar el día
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
