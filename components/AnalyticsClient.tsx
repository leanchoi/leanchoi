'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { RotateCcw, Users as UsersIcon, LogIn, Clock, CheckCircle2, PlusCircle, MessageSquare } from 'lucide-react';
import { useToast } from './Toast';

interface U { id: number; display_name: string; username: string; avatar: string | null }
interface Metric {
  user_id: number; display_name: string; username: string; avatar: string | null;
  logins: number; online_seconds: number; items_completed: number;
  checklist_created: number; cards_created: number; items_generated: number; comments: number;
}
interface Daily { day: string; byUser: Record<number, { logins: number; online_seconds: number; items_completed: number; items_generated: number; comments: number }> }

const PALETTE = ['#2dd4bf', '#60a5fa', '#c084fc', '#fbbf24', '#f472b6', '#4ade80', '#f87171', '#38bdf8', '#a3e635', '#fb923c'];
const AVG_COLOR = '#e2e8f0';

const PERIODS: { key: string; label: string }[] = [
  { key: 'today', label: 'Hoy' },
  { key: 'yesterday', label: 'Ayer' },
  { key: 'last_week', label: 'Última semana' },
  { key: 'this_week', label: 'Esta semana' },
  { key: 'this_month', label: 'Mes en curso' },
  { key: 'last_30', label: 'Últimos 30 días' },
  { key: 'custom', label: 'Personalizado' },
];

const METRICS: { key: keyof Metric; label: string; icon: any }[] = [
  { key: 'logins', label: 'Logueos', icon: LogIn },
  { key: 'online_seconds', label: 'Tiempo online', icon: Clock },
  { key: 'items_completed', label: 'Ítems completados', icon: CheckCircle2 },
  { key: 'items_generated', label: 'Ítems generados', icon: PlusCircle },
  { key: 'comments', label: 'Comentarios', icon: MessageSquare },
];

function fmtSeconds(s: number): string {
  s = Math.round(s);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}
function fmtVal(metric: string, v: number): string {
  return metric === 'online_seconds' ? fmtSeconds(v) : String(Math.round(v));
}

export default function AnalyticsClient({ allUsers }: { allUsers: U[] }) {
  const toast = useToast();
  const [period, setPeriod] = useState('this_week');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [selected, setSelected] = useState<number[]>([]); // vacío = todos
  const [metricKey, setMetricKey] = useState<keyof Metric>('items_generated');
  const [data, setData] = useState<{ metrics: Metric[]; daily: Daily[]; label: string; reset_at: string | null } | null>(null);
  const [loading, setLoading] = useState(false);
  const [resetting, setResetting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams({ period });
    if (period === 'custom') {
      if (from) qs.set('from', from);
      if (to) qs.set('to', to);
    }
    if (selected.length) qs.set('users', selected.join(','));
    const res = await fetch(`/api/admin/analytics?${qs.toString()}`);
    setLoading(false);
    if (res.ok) setData(await res.json());
  }, [period, from, to, selected]);

  useEffect(() => { load(); }, [load]);

  async function resetRankings() {
    if (!confirm('¿Resetear TODOS los rankings? La actividad anterior deja de contar (no se borra contenido). Esto no se puede deshacer.')) return;
    setResetting(true);
    const res = await fetch('/api/admin/rankings/reset', { method: 'POST' });
    setResetting(false);
    if (res.ok) { toast.success('Rankings reseteados. Se cuenta desde ahora.'); load(); }
    else toast.error('No se pudo resetear los rankings');
  }

  const metrics = data?.metrics || [];
  const colorFor = useMemo(() => {
    const m = new Map<number, string>();
    metrics.forEach((u, i) => m.set(u.user_id, PALETTE[i % PALETTE.length]));
    return m;
  }, [metrics]);

  const metricLabel = METRICS.find((m) => m.key === metricKey)!.label;
  const values = metrics.map((m) => Number(m[metricKey]) || 0);
  const avg = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
  const maxBar = Math.max(...values, avg, 1);

  function toggleUser(id: number) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 pb-20">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[1.5rem] font-semibold">Analytics</h1>
          <p className="mt-0.5 text-sm text-ink-md">
            Actividad consolidada del equipo{data?.label ? ` · ${data.label}` : ''}
            {data?.reset_at && <span className="text-ink-lo"> · desde el reset {new Date(data.reset_at).toLocaleDateString('es-AR')}</span>}
          </p>
        </div>
        {/* Es destructivo: no puede ser el botón más llamativo de la pantalla */}
        <button
          onClick={resetRankings}
          disabled={resetting}
          className="btn-secondary text-meta text-[#f79c8d] hover:border-state-crit/40 hover:bg-state-crit/10"
        >
          <RotateCcw size={13} /> {resetting ? 'Reseteando…' : 'Resetear rankings'}
        </button>
      </div>

      {/* Filtros de fecha */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {PERIODS.map((p) => (
          <button key={p.key} onClick={() => setPeriod(p.key)}
            className={`tap-row rounded-control px-3 py-2 text-meta font-medium transition-colors ${period === p.key ? 'bg-brand text-brand-ink' : 'bg-surface-raised text-ink-md hover:bg-surface-hover'}`}>
            {p.label}
          </button>
        ))}
        {period === 'custom' && (
          <div className="flex items-center gap-1.5 ml-1">
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
              className="bg-surface-sunken border border-line text-white text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:border-brand" style={{ colorScheme: 'dark' }} />
            <span className="text-slate-500 text-xs">→</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
              className="bg-surface-sunken border border-line text-white text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:border-brand" style={{ colorScheme: 'dark' }} />
          </div>
        )}
      </div>

      {/* Filtro de usuarios */}
      <div className="mb-5">
        <div className="flex items-center gap-2 mb-1.5 text-xs text-slate-400">
          <UsersIcon size={13} /> Usuarios {selected.length === 0 ? '(todos)' : `(${selected.length})`}
          {selected.length > 0 && <button onClick={() => setSelected([])} className="text-brand hover:underline">limpiar</button>}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {allUsers.map((u) => {
            const on = selected.includes(u.id);
            return (
              <button key={u.id} onClick={() => toggleUser(u.id)}
                className={`tap-row rounded-full border px-3 py-1.5 text-meta transition-colors ${on ? 'border-brand bg-brand text-brand-ink' : 'border-line bg-surface-raised text-ink-md hover:border-brand/50'}`}>
                {u.display_name}
              </button>
            );
          })}
          {allUsers.length === 0 && <span className="text-slate-500 text-xs">No hay usuarios para mostrar.</span>}
        </div>
      </div>

      {loading && !data && <p className="text-slate-400 text-sm">Cargando…</p>}

      {/* Tabla consolidada */}
      <div className="mb-6 min-w-0 overflow-x-auto rounded-panel border border-line">
        <table className="w-full text-sm min-w-[640px]">
          <thead>
            <tr className="bg-surface-raised text-slate-400 text-xs uppercase tracking-wide">
              <th className="text-left px-3 py-2 font-medium">Usuario</th>
              {METRICS.map((m) => (
                <th key={m.key} className="text-right px-3 py-2 font-medium whitespace-nowrap">{m.label}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {metrics.map((u) => (
              <tr key={u.user_id} className="hover:bg-white/5">
                <td className="px-3 py-2">
                  <span className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: colorFor.get(u.user_id) }} />
                    <span className="text-white">{u.display_name}</span>
                  </span>
                </td>
                <td className="px-3 py-2 text-right text-slate-200">{u.logins}</td>
                <td className="px-3 py-2 text-right text-slate-200">{fmtSeconds(u.online_seconds)}</td>
                <td className="px-3 py-2 text-right text-slate-200">{u.items_completed}</td>
                <td className="px-3 py-2 text-right text-slate-200" title={`Tarjetas ${u.cards_created} · Checklist ${u.checklist_created}`}>{u.items_generated}</td>
                <td className="px-3 py-2 text-right text-slate-200">{u.comments}</td>
              </tr>
            ))}
            {metrics.length > 0 && (
              <tr className="bg-surface-raised2 font-semibold">
                <td className="px-3 py-2 text-slate-300">Promedio</td>
                <td className="px-3 py-2 text-right text-slate-300">{(metrics.reduce((a, m) => a + m.logins, 0) / metrics.length).toFixed(1)}</td>
                <td className="px-3 py-2 text-right text-slate-300">{fmtSeconds(metrics.reduce((a, m) => a + m.online_seconds, 0) / metrics.length)}</td>
                <td className="px-3 py-2 text-right text-slate-300">{(metrics.reduce((a, m) => a + m.items_completed, 0) / metrics.length).toFixed(1)}</td>
                <td className="px-3 py-2 text-right text-slate-300">{(metrics.reduce((a, m) => a + m.items_generated, 0) / metrics.length).toFixed(1)}</td>
                <td className="px-3 py-2 text-right text-slate-300">{(metrics.reduce((a, m) => a + m.comments, 0) / metrics.length).toFixed(1)}</td>
              </tr>
            )}
            {!loading && metrics.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-500">Sin datos para el filtro elegido.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Selector de métrica para los gráficos */}
      <div className="flex flex-wrap items-center gap-1.5 mb-3">
        <span className="text-xs text-slate-400 mr-1">Gráfico de:</span>
        {METRICS.map((m) => (
          <button key={m.key} onClick={() => setMetricKey(m.key)}
            className={`tap-row flex items-center gap-1.5 rounded-control px-2.5 py-1.5 text-meta transition-colors ${metricKey === m.key ? 'bg-brand text-brand-ink' : 'bg-surface-raised text-ink-md hover:bg-surface-hover'}`}>
            <m.icon size={12} /> {m.label}
          </button>
        ))}
      </div>

      {metrics.length > 0 && (
        <div className="grid gap-5 lg:grid-cols-2">
          {/* Barras comparativas + promedio */}
          <div className="min-w-0 rounded-panel border border-line bg-surface-raised p-4">
            <h3 className="mb-3 text-sm font-semibold">Comparación · {metricLabel}</h3>
            <div className="space-y-2">
              {metrics.map((u) => {
                const v = Number(u[metricKey]) || 0;
                return (
                  <div key={u.user_id} className="flex items-center gap-2">
                    <span className="w-16 shrink-0 truncate text-micro text-ink-md sm:w-24" title={u.display_name}>{u.display_name}</span>
                    <div className="flex-1 h-5 rounded bg-surface-sunken overflow-hidden">
                      <div className="h-full rounded" style={{ width: `${(v / maxBar) * 100}%`, background: colorFor.get(u.user_id), minWidth: v > 0 ? 3 : 0 }} />
                    </div>
                    <span className="tnum w-14 shrink-0 text-right text-micro text-ink-hi sm:w-16">{fmtVal(metricKey, v)}</span>
                  </div>
                );
              })}
              {/* promedio */}
              <div className="flex items-center gap-2 pt-2 border-t border-line mt-2">
                <span className="w-16 shrink-0 truncate text-micro font-semibold text-ink-hi sm:w-24">Promedio</span>
                <div className="flex-1 h-5 rounded bg-surface-sunken overflow-hidden">
                  <div className="h-full rounded" style={{ width: `${(avg / maxBar) * 100}%`, background: AVG_COLOR, minWidth: avg > 0 ? 3 : 0 }} />
                </div>
                <span className="tnum w-14 shrink-0 text-right text-micro font-semibold text-ink-hi sm:w-16">{fmtVal(metricKey, avg)}</span>
              </div>
            </div>
          </div>

          {/* Evolución diaria (línea por usuario + promedio) */}
          <div className="min-w-0 rounded-panel border border-line bg-surface-raised p-4">
            <h3 className="text-white text-sm font-semibold mb-3">Evolución diaria · {metricLabel}</h3>
            <LineChart daily={data!.daily} metric={metricKey} metrics={metrics} colorFor={colorFor} />
          </div>
        </div>
      )}
    </div>
  );
}

function LineChart({ daily, metric, metrics, colorFor }: {
  daily: Daily[]; metric: keyof Metric; metrics: Metric[]; colorFor: Map<number, string>;
}) {
  const W = 520, H = 200, padL = 34, padB = 22, padT = 8, padR = 8;
  const days = daily.map((d) => d.day);
  const ids = metrics.map((m) => m.user_id);
  const valAt = (d: Daily, id: number) => Number((d.byUser[id] as any)?.[metric] || 0);
  const avgAt = (d: Daily) => (ids.length ? ids.reduce((a, id) => a + valAt(d, id), 0) / ids.length : 0);

  let maxY = 1;
  for (const d of daily) {
    for (const id of ids) maxY = Math.max(maxY, valAt(d, id));
    maxY = Math.max(maxY, avgAt(d));
  }
  const n = Math.max(days.length, 1);
  const x = (i: number) => padL + (n === 1 ? (W - padL - padR) / 2 : (i / (n - 1)) * (W - padL - padR));
  const y = (v: number) => padT + (1 - v / maxY) * (H - padT - padB);
  const fmtLabel = metric === 'online_seconds' ? (v: number) => fmtSeconds(v) : (v: number) => String(Math.round(v));

  const line = (getV: (d: Daily) => number) =>
    daily.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(getV(d)).toFixed(1)}`).join(' ');

  if (days.length <= 1) {
    return <p className="text-slate-500 text-xs py-8 text-center">El rango elegido tiene un solo día; probá un período más amplio para ver la evolución.</p>;
  }

  return (
    <div className="min-w-0 overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ minWidth: 360 }}>
        {/* grilla y eje Y */}
        {[0, 0.5, 1].map((t) => {
          const yy = padT + (1 - t) * (H - padT - padB);
          return (
            <g key={t}>
              <line x1={padL} y1={yy} x2={W - padR} y2={yy} stroke="#233043" strokeWidth="1" />
              <text x={padL - 4} y={yy + 3} textAnchor="end" fontSize="8" fill="#64748b">{fmtLabel(maxY * t)}</text>
            </g>
          );
        })}
        {/* etiquetas X: primer y último día */}
        <text x={x(0)} y={H - 6} textAnchor="start" fontSize="8" fill="#64748b">{days[0]?.slice(5)}</text>
        <text x={x(n - 1)} y={H - 6} textAnchor="end" fontSize="8" fill="#64748b">{days[n - 1]?.slice(5)}</text>
        {/* líneas por usuario */}
        {metrics.map((u) => (
          <path key={u.user_id} d={line((d) => valAt(d, u.user_id))} fill="none" stroke={colorFor.get(u.user_id)} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {/* promedio (punteado) */}
        <path d={line(avgAt)} fill="none" stroke={AVG_COLOR} strokeWidth="1.6" strokeDasharray="4 3" strokeLinejoin="round" />
      </svg>
      {/* leyenda */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
        {metrics.map((u) => (
          <span key={u.user_id} className="flex items-center gap-1 text-[10px] text-slate-400">
            <span className="w-2.5 h-0.5 rounded" style={{ background: colorFor.get(u.user_id) }} /> {u.display_name}
          </span>
        ))}
        <span className="flex items-center gap-1 text-[10px] text-slate-300">
          <span className="w-2.5 h-0.5 rounded" style={{ background: AVG_COLOR }} /> Promedio
        </span>
      </div>
    </div>
  );
}
