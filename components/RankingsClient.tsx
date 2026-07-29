'use client';
import { useState, useEffect, useCallback } from 'react';
import { Trophy, Medal, Crown, Info, ChevronDown, ChevronUp, Zap, LogIn, Clock, CheckSquare, Briefcase } from 'lucide-react';
import Avatar from './Avatar';

interface Metric {
  user_id: number; display_name: string; username: string; avatar: string | null;
  cards_created: number; items_created: number; items_completed: number; comments: number;
  production: number; logins: number; online_seconds: number; workload: number; overall: number;
}
interface Historic { user_id: number; display_name: string; username: string; avatar: string | null; points: number; weeks_won: number; weeks_ranked: number; }
interface LastWeek { week_start: string; winners: { position: number; points: number; display_name: string; username: string; avatar: string | null }[]; }

const PERIODS = [
  { key: 'this_week', label: 'Esta semana' },
  { key: 'last_week', label: 'Semana anterior' },
  { key: 'two_weeks_ago', label: 'Hace 2 semanas' },
  { key: 'this_month', label: 'Mes en curso' },
  { key: 'last_30', label: 'Últimos 30 días' },
  { key: 'custom', label: 'Rango de fechas' },
];

const MEDALS = ['🥇', '🥈', '🥉'];

function fmtTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  if (h === 0) return `${m} min`;
  return `${h} h ${m} min`;
}

function positionBadge(i: number) {
  if (i < 3) return <span className="text-base w-6 text-center">{MEDALS[i]}</span>;
  return <span className="text-slate-500 text-xs font-semibold w-6 text-center">{i + 1}°</span>;
}

export default function RankingsClient() {
  const [period, setPeriod] = useState('this_week');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [historic, setHistoric] = useState<Historic[]>([]);
  const [lastWeek, setLastWeek] = useState<LastWeek | null>(null);
  const [loading, setLoading] = useState(true);
  const [showLegend, setShowLegend] = useState(false);

  const load = useCallback(async (p: string, from?: string, to?: string) => {
    setLoading(true);
    let url = `/api/rankings?period=${p}`;
    if (p === 'custom' && from && to) url += `&from=${from}&to=${to}`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      setMetrics(data.metrics || []);
      setHistoric(data.historic || []);
      setLastWeek(data.lastWeek || null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (period !== 'custom') load(period);
  }, [period, load]);

  function rankedBy(key: keyof Metric): Metric[] {
    return [...metrics].filter(m => (m[key] as number) > 0).sort((a, b) => (b[key] as number) - (a[key] as number)).slice(0, 10);
  }

  function RankCard({ title, icon, items, valueOf, accent }: {
    title: string; icon: React.ReactNode; items: Metric[]; valueOf: (m: Metric) => string; accent: string;
  }) {
    return (
      <div className="bg-surface-raised rounded-xl p-4">
        <h3 className={`text-sm font-semibold mb-3 flex items-center gap-2 ${accent}`}>{icon} {title}</h3>
        {items.length === 0 && <p className="text-slate-500 text-xs py-2">Sin actividad en este período.</p>}
        <div className="space-y-1.5">
          {items.map((m, i) => (
            <div key={m.user_id} className={`flex items-center gap-2.5 rounded-lg px-2 py-1.5 ${i === 0 ? 'bg-white/5' : ''}`}>
              {positionBadge(i)}
              <Avatar userId={m.user_id} name={m.display_name} avatar={m.avatar} size={24} />
              <span className="text-slate-200 text-sm flex-1 truncate">{m.display_name}</span>
              <span className="text-slate-400 text-xs font-semibold tabular-nums">{valueOf(m)}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const overall = rankedBy('overall');

  return (
    <div>
      <div className="flex items-center gap-3 mb-5">
        <h1 className="text-white text-xl font-semibold flex items-center gap-2"><Trophy size={20} className="text-amber-400" /> Rankings</h1>
        <button onClick={() => setShowLegend(!showLegend)} className="ml-auto flex items-center gap-1.5 text-xs text-slate-400 hover:text-white px-2.5 py-1.5 rounded-lg hover:bg-white/10 transition-colors">
          <Info size={13} /> ¿Cómo se puntúa? {showLegend ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </button>
      </div>

      {showLegend && (
        <div className="bg-surface-raised border border-line rounded-xl p-4 mb-5 text-sm text-slate-300 space-y-2">
          <p><strong className="text-brand-hi">⚡ Producción</strong>: tarjeta creada = 5 pts · ítem completado = 2 pts · comentario = 1 a 4 pts (según longitud; los informes detallados suman más).</p>
          <p><strong className="text-sky-300">🔑 Check-ins</strong>: visitas y accesos diarios registrados (máximo uno por cada 2 horas).</p>
          <p><strong className="text-violet-300">⏱ Tiempo online</strong>: se cuenta mientras TROCHI está abierto y hay interacción; tras 30 segundos sin actividad deja de contar.</p>
          <p><strong className="text-emerald-300">✅ Ítems completados</strong>: ítems de checklist que marcaste como hechos (informativo, no suma al Ranking General).</p>
          <p><strong className="text-orange-300">💼 Carga de trabajo</strong>: ítems de checklist asignados a vos que siguen pendientes (informativo, no suma al Ranking General).</p>
          <p className="pt-1 border-t border-white/10"><strong className="text-amber-300">🏆 Ranking General</strong>: promedio ponderado de los porcentajes: <strong>Producción (60%)</strong>, <strong>Tiempo Online (25%)</strong> y <strong>Check-ins (15%)</strong>.</p>
          <p><strong className="text-amber-300">📜 Ranking Histórico</strong>: cada domingo a las 23:59 (hora argentina) se cierra la semana y el top 5 del Ranking General suma puntos permanentes: <strong>8 · 5 · 3 · 2 · 1</strong>.</p>
        </div>
      )}

      {/* Period filter */}
      <div className="flex flex-wrap items-center gap-1.5 mb-5">
        {PERIODS.map(p => (
          <button key={p.key} onClick={() => setPeriod(p.key)}
            className={`text-xs px-3 py-1.5 rounded-full transition-colors ${period === p.key ? 'bg-brand text-white' : 'bg-surface-raised text-slate-300 hover:bg-surface-hover'}`}>
            {p.label}
          </button>
        ))}
        {period === 'custom' && (
          <div className="flex items-center gap-2 ml-1">
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
              className="bg-surface-raised border border-line text-white text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:border-brand" />
            <span className="text-slate-500 text-xs">a</span>
            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
              className="bg-surface-raised border border-line text-white text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:border-brand" />
            <button onClick={() => customFrom && customTo && load('custom', customFrom, customTo)}
              disabled={!customFrom || !customTo}
              className="bg-brand hover:bg-brand-hi disabled:opacity-40 text-white text-xs px-3 py-1.5 rounded-lg font-medium">
              Aplicar
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <p className="text-slate-400 text-sm text-center py-16">Calculando rankings...</p>
      ) : (
        <div className="flex flex-col lg:flex-row gap-5">
          {/* Center: period rankings */}
          <div className="flex-1 min-w-0 space-y-5">
            {/* Overall */}
            <div className="rounded-panel border border-state-warn/25 bg-gradient-to-br from-surface-raised to-surface-overlay p-5 shadow-lift-2">
              <h2 className="text-amber-300 text-sm font-semibold mb-3 flex items-center gap-2"><Crown size={16} /> Ranking General del período</h2>
              {overall.length === 0 && <p className="text-slate-500 text-xs py-2">Sin actividad en este período.</p>}
              <div className="space-y-1.5">
                {overall.map((m, i) => (
                  <div key={m.user_id} className={`flex items-center gap-3 rounded-lg px-3 py-2 ${i === 0 ? 'bg-amber-500/10 ring-1 ring-amber-500/30' : i < 3 ? 'bg-white/5' : ''}`}>
                    {positionBadge(i)}
                    <Avatar userId={m.user_id} name={m.display_name} avatar={m.avatar} size={30} />
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-medium truncate">{m.display_name}</p>
                      <div className="h-1.5 bg-surface-sunken rounded-full overflow-hidden mt-1 max-w-[200px]">
                        <div className="h-full bg-gradient-to-r from-amber-400 to-amber-500 rounded-full" style={{ width: `${m.overall}%` }} />
                      </div>
                    </div>
                    <span className="text-amber-300 text-sm font-bold tabular-nums">{m.overall}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Category rankings */}
            <div className="grid sm:grid-cols-2 gap-4">
              <RankCard title="Producción" icon={<Zap size={14} />} accent="text-brand-hi" items={rankedBy('production')} valueOf={m => `${m.production} pts`} />
              <RankCard title="Ítems completados" icon={<CheckSquare size={14} />} accent="text-emerald-300" items={rankedBy('items_completed')} valueOf={m => String(m.items_completed)} />
              <RankCard title="Logueos" icon={<LogIn size={14} />} accent="text-sky-300" items={rankedBy('logins')} valueOf={m => String(m.logins)} />
              <RankCard title="Tiempo online" icon={<Clock size={14} />} accent="text-violet-300" items={rankedBy('online_seconds')} valueOf={m => fmtTime(m.online_seconds)} />
              <RankCard title="Carga de trabajo (pendientes asignados)" icon={<Briefcase size={14} />} accent="text-orange-300" items={rankedBy('workload')} valueOf={m => `${m.workload} ítems`} />
            </div>
          </div>

          {/* Right: historic */}
          <div className="w-full lg:w-80 flex-shrink-0 space-y-4">
            <div className="bg-surface-raised border border-line rounded-xl p-4">
              <h2 className="text-white text-sm font-semibold mb-3 flex items-center gap-2"><Medal size={15} className="text-amber-400" /> Ranking Histórico</h2>
              {historic.length === 0 && <p className="text-slate-500 text-xs py-2">Todavía no se cerró ninguna semana. El primer cierre es el próximo domingo a las 23:59.</p>}
              <div className="space-y-1.5">
                {historic.map((h, i) => (
                  <div key={h.user_id} className={`flex items-center gap-2.5 rounded-lg px-2 py-2 ${i === 0 ? 'bg-amber-500/10 ring-1 ring-amber-500/30' : ''}`}>
                    {positionBadge(i)}
                    <Avatar userId={h.user_id} name={h.display_name} avatar={h.avatar} size={26} />
                    <div className="flex-1 min-w-0">
                      <p className="text-slate-200 text-sm truncate">{h.display_name}</p>
                      <p className="text-slate-500 text-[10px]">{h.weeks_won > 0 ? `${h.weeks_won} semana${h.weeks_won > 1 ? 's' : ''} ganada${h.weeks_won > 1 ? 's' : ''}` : `top 5 en ${h.weeks_ranked} semana${h.weeks_ranked > 1 ? 's' : ''}`}</p>
                    </div>
                    <span className="text-amber-300 text-sm font-bold tabular-nums">{h.points} pts</span>
                  </div>
                ))}
              </div>
            </div>

            {lastWeek && (
              <div className="bg-surface-raised rounded-xl p-4">
                <h3 className="text-slate-300 text-xs font-semibold mb-2.5 uppercase tracking-wide">Última semana cerrada · {new Date(lastWeek.week_start + 'T12:00:00').toLocaleDateString('es')}</h3>
                <div className="space-y-1">
                  {lastWeek.winners.map(w => (
                    <div key={w.position} className="flex items-center gap-2 text-sm">
                      <span className="w-6 text-center">{w.position <= 3 ? MEDALS[w.position - 1] : `${w.position}°`}</span>
                      <span className="text-slate-300 flex-1 truncate">{w.display_name}</span>
                      <span className="text-brand-hi text-xs font-semibold">+{w.points} pts</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
