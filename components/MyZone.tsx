'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { CalendarDays, ListTodo, X, ChevronLeft, ChevronRight, CheckSquare, CreditCard } from 'lucide-react';

interface AgendaCard { id: number; title: string; due_date?: string; list_title: string; board_id: number; board_title: string; board_background: string; }
interface AgendaItem { id: number; text: string; due_date?: string; is_checked: number; card_id: number; card_title: string; board_id: number; board_title: string; board_background: string; }

interface AgendaEvent {
  key: string;
  type: 'card' | 'item';
  title: string;
  subtitle: string;
  due_date?: string;
  board_id: number;
  board_title: string;
  board_background: string;
  card_id: number;
  item_id?: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

function today(): Date {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function parseDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function toKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function daysUntil(dateStr: string): number {
  return Math.round((parseDate(dateStr).getTime() - today().getTime()) / DAY_MS);
}

function relativeLabel(dateStr: string): { text: string; cls: string } {
  const d = daysUntil(dateStr);
  if (d < 0) return { text: `Vencida hace ${-d} día${d === -1 ? '' : 's'}`, cls: 'text-red-400' };
  if (d === 0) return { text: 'Vence hoy', cls: 'text-orange-400' };
  if (d === 1) return { text: 'Vence mañana', cls: 'text-yellow-400' };
  return { text: `Faltan ${d} días`, cls: 'text-emerald-400' };
}

function startOfWeek(d: Date): Date {
  const day = (d.getDay() + 6) % 7; // Monday = 0
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - day);
}

export default function MyZone() {
  const [panel, setPanel] = useState<'agenda' | 'calendar' | null>(null);
  const [events, setEvents] = useState<AgendaEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [calView, setCalView] = useState<'month' | 'week' | 'day'>('month');
  const [anchor, setAnchor] = useState<Date>(today());

  useEffect(() => {
    if (!panel) return;
    setLoading(true);
    fetch('/api/me/agenda').then(r => r.json()).then((data: { cards: AgendaCard[]; items: AgendaItem[] }) => {
      const evts: AgendaEvent[] = [
        ...data.cards.map(c => ({
          key: `card-${c.id}`, type: 'card' as const, title: c.title,
          subtitle: `${c.board_title} · ${c.list_title}`,
          due_date: c.due_date || undefined,
          board_id: c.board_id, board_title: c.board_title, board_background: c.board_background,
          card_id: c.id
        })),
        ...data.items.filter(i => !i.is_checked).map(i => ({
          key: `item-${i.id}`, type: 'item' as const, title: i.text,
          subtitle: `${i.board_title} · tarjeta: ${i.card_title}`,
          due_date: i.due_date || undefined,
          board_id: i.board_id, board_title: i.board_title, board_background: i.board_background,
          card_id: i.card_id, item_id: i.id
        })),
      ];
      setEvents(evts);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [panel]);

  const dated = events.filter(e => e.due_date);
  const overdue = dated.filter(e => daysUntil(e.due_date!) < 0);
  const boardCount = new Set(events.map(e => e.board_id)).size;

  const groups: { label: string; cls: string; items: AgendaEvent[] }[] = [
    { label: '🔴 Vencidas', cls: 'text-red-400', items: dated.filter(e => daysUntil(e.due_date!) < 0) },
    { label: '🟠 Vencen hoy', cls: 'text-orange-400', items: dated.filter(e => daysUntil(e.due_date!) === 0) },
    { label: '🟡 Vencen mañana', cls: 'text-yellow-400', items: dated.filter(e => daysUntil(e.due_date!) === 1) },
    { label: '🟢 Próximos 7 días', cls: 'text-emerald-400', items: dated.filter(e => { const d = daysUntil(e.due_date!); return d >= 2 && d <= 7; }) },
    { label: '🔵 Más adelante', cls: 'text-sky-400', items: dated.filter(e => daysUntil(e.due_date!) > 7) },
    { label: '⚪ Sin fecha', cls: 'text-slate-400', items: events.filter(e => !e.due_date) },
  ];

  const eventsByDay = new Map<string, AgendaEvent[]>();
  for (const e of dated) {
    const arr = eventsByDay.get(e.due_date!) || [];
    arr.push(e);
    eventsByDay.set(e.due_date!, arr);
  }

  function navigate(dir: -1 | 1) {
    if (calView === 'month') setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() + dir, 1));
    else if (calView === 'week') setAnchor(new Date(anchor.getTime() + dir * 7 * DAY_MS));
    else setAnchor(new Date(anchor.getTime() + dir * DAY_MS));
  }

  function calTitle(): string {
    if (calView === 'month') return `${MONTHS[anchor.getMonth()]} ${anchor.getFullYear()}`;
    if (calView === 'week') {
      const start = startOfWeek(anchor);
      const end = new Date(start.getTime() + 6 * DAY_MS);
      return `${start.getDate()} ${MONTHS[start.getMonth()].slice(0, 3)} – ${end.getDate()} ${MONTHS[end.getMonth()].slice(0, 3)} ${end.getFullYear()}`;
    }
    return `${WEEKDAYS[(anchor.getDay() + 6) % 7]} ${anchor.getDate()} de ${MONTHS[anchor.getMonth()]} ${anchor.getFullYear()}`;
  }

  function monthGrid(): Date[] {
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const start = startOfWeek(first);
    return Array.from({ length: 42 }, (_, i) => new Date(start.getTime() + i * DAY_MS));
  }

  function EventChip({ e, compact }: { e: AgendaEvent; compact?: boolean }) {
    const isOver = e.due_date && daysUntil(e.due_date) < 0;
    const url = `/boards/${e.board_id}?cardId=${e.card_id}` + (e.type === 'item' ? `&itemId=${e.item_id}` : `&highlight=due_date`);
    return (
      <Link href={url}
        className={`block rounded px-1.5 py-0.5 text-xs truncate hover:opacity-80 transition-opacity ${isOver ? 'ring-1 ring-red-500' : ''}`}
        style={{ background: `${e.board_background}33`, borderLeft: `3px solid ${e.board_background}` }}
        title={`${e.title} — ${e.subtitle}`}>
        <span className="text-slate-200">{compact ? e.title : `${e.title}`}</span>
      </Link>
    );
  }

  function EventRow({ e }: { e: AgendaEvent }) {
    const url = `/boards/${e.board_id}?cardId=${e.card_id}` + (e.type === 'item' ? `&itemId=${e.item_id}` : `&highlight=due_date`);
    return (
      <Link href={url} className="flex items-start gap-2.5 bg-[#1e293b] hover:bg-[#2e415c] rounded-lg px-3 py-2 transition-colors">
        <span className="mt-0.5 flex-shrink-0" style={{ color: e.board_background }}>
          {e.type === 'card' ? <CreditCard size={14} /> : <CheckSquare size={14} />}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-slate-200 text-sm truncate">{e.title}</p>
          <p className="text-slate-400 text-xs truncate">{e.subtitle}</p>
        </div>
        {e.due_date && (
          <span className={`text-xs flex-shrink-0 mt-0.5 ${relativeLabel(e.due_date).cls}`}>
            {relativeLabel(e.due_date).text}
          </span>
        )}
      </Link>
    );
  }

  return (
    <>
      {/* Bottom bar */}
      <div className="fixed bottom-0 inset-x-0 z-40 flex justify-center pb-3 pointer-events-none">
        <div className="pointer-events-auto flex items-center gap-1 bg-[#0f172a]/95 backdrop-blur border border-[#3b5068] rounded-full px-1.5 py-1 shadow-2xl">
          <button onClick={() => setPanel(panel === 'agenda' ? null : 'agenda')}
            className={`flex items-center gap-1.5 text-xs font-medium px-3.5 py-1.5 rounded-full transition-colors ${panel === 'agenda' ? 'bg-teal-600 text-white' : 'text-slate-300 hover:bg-white/10 hover:text-white'}`}>
            <ListTodo size={14} /> Mi Agenda
          </button>
          <button onClick={() => setPanel(panel === 'calendar' ? null : 'calendar')}
            className={`flex items-center gap-1.5 text-xs font-medium px-3.5 py-1.5 rounded-full transition-colors ${panel === 'calendar' ? 'bg-teal-600 text-white' : 'text-slate-300 hover:bg-white/10 hover:text-white'}`}>
            <CalendarDays size={14} /> Mi Calendario
          </button>
        </div>
      </div>

      {/* Panel */}
      {panel && (
        <div className="fixed bottom-0 inset-x-0 z-30 h-[58vh] bg-[#0f172a] border-t border-[#3b5068] shadow-2xl flex flex-col">
          <div className="flex items-center justify-between px-5 py-3 border-b border-white/10 flex-shrink-0">
            <h2 className="text-white font-semibold text-sm flex items-center gap-2">
              {panel === 'agenda' ? <><ListTodo size={16} className="text-teal-400" /> Mi Agenda</> : <><CalendarDays size={16} className="text-teal-400" /> Mi Calendario</>}
            </h2>

            {panel === 'calendar' && (
              <div className="flex items-center gap-2">
                <div className="flex items-center bg-[#1e293b] rounded-lg p-0.5">
                  {(['month', 'week', 'day'] as const).map(v => (
                    <button key={v} onClick={() => setCalView(v)}
                      className={`text-xs px-2.5 py-1 rounded-md transition-colors ${calView === v ? 'bg-teal-600 text-white' : 'text-slate-400 hover:text-white'}`}>
                      {v === 'month' ? 'Mes' : v === 'week' ? 'Semana' : 'Día'}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => navigate(-1)} className="text-slate-400 hover:text-white p-1 rounded hover:bg-white/10"><ChevronLeft size={16} /></button>
                  <button onClick={() => setAnchor(today())} className="text-xs text-slate-300 hover:text-white px-2 py-1 rounded hover:bg-white/10">Hoy</button>
                  <button onClick={() => navigate(1)} className="text-slate-400 hover:text-white p-1 rounded hover:bg-white/10"><ChevronRight size={16} /></button>
                </div>
                <span className="text-slate-300 text-sm font-medium min-w-[150px] text-right hidden sm:block">{calTitle()}</span>
              </div>
            )}

            <button onClick={() => setPanel(null)} className="text-slate-400 hover:text-white p-1 rounded hover:bg-white/10"><X size={18} /></button>
          </div>

          <div className="flex-1 overflow-y-auto p-5 pb-16">
            {loading ? (
              <p className="text-slate-400 text-sm text-center py-8">Cargando...</p>
            ) : panel === 'agenda' ? (
              <div className="max-w-3xl mx-auto space-y-5">
                {/* Summary */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-[#1e293b] rounded-xl px-4 py-3 text-center">
                    <p className="text-2xl font-bold text-teal-400">{events.length}</p>
                    <p className="text-slate-400 text-xs">Tareas asignadas</p>
                  </div>
                  <div className="bg-[#1e293b] rounded-xl px-4 py-3 text-center">
                    <p className={`text-2xl font-bold ${overdue.length > 0 ? 'text-red-400' : 'text-emerald-400'}`}>{overdue.length}</p>
                    <p className="text-slate-400 text-xs">Vencidas</p>
                  </div>
                  <div className="bg-[#1e293b] rounded-xl px-4 py-3 text-center">
                    <p className="text-2xl font-bold text-sky-400">{boardCount}</p>
                    <p className="text-slate-400 text-xs">Proyectos</p>
                  </div>
                </div>

                {events.length === 0 && <p className="text-slate-400 text-sm text-center py-6">No tenés tareas asignadas. 🎉</p>}

                {groups.filter(g => g.items.length > 0).map(g => (
                  <div key={g.label}>
                    <h3 className={`text-xs font-semibold uppercase mb-2 ${g.cls}`}>{g.label} · {g.items.length}</h3>
                    <div className="space-y-1.5">
                      {g.items.map(e => <EventRow key={e.key} e={e} />)}
                    </div>
                  </div>
                ))}
              </div>
            ) : calView === 'month' ? (
              <div className="max-w-5xl mx-auto overflow-x-auto">
                <div className="grid grid-cols-7 gap-px bg-[#3b5068] rounded-lg overflow-hidden border border-[#3b5068] min-w-[560px]">
                  {WEEKDAYS.map(d => (
                    <div key={d} className="bg-[#1e293b] text-slate-400 text-xs font-semibold text-center py-1.5">{d}</div>
                  ))}
                  {monthGrid().map(day => {
                    const key = toKey(day);
                    const isToday = key === toKey(today());
                    const inMonth = day.getMonth() === anchor.getMonth();
                    const dayEvents = eventsByDay.get(key) || [];
                    return (
                      <div key={key} className={`bg-[#0f172a] min-h-[72px] p-1 ${inMonth ? '' : 'opacity-40'}`}>
                        <p className={`text-xs mb-1 w-5 h-5 flex items-center justify-center rounded-full ${isToday ? 'bg-teal-600 text-white font-bold' : 'text-slate-400'}`}>{day.getDate()}</p>
                        <div className="space-y-0.5">
                          {dayEvents.slice(0, 3).map(e => <EventChip key={e.key} e={e} compact />)}
                          {dayEvents.length > 3 && <p className="text-slate-500 text-[10px] px-1">+{dayEvents.length - 3} más</p>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : calView === 'week' ? (
              <div className="max-w-5xl mx-auto grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
                {Array.from({ length: 7 }, (_, i) => new Date(startOfWeek(anchor).getTime() + i * DAY_MS)).map(day => {
                  const key = toKey(day);
                  const isToday = key === toKey(today());
                  const dayEvents = eventsByDay.get(key) || [];
                  return (
                    <div key={key} className={`bg-[#1e293b] rounded-lg p-2 min-h-[140px] ${isToday ? 'ring-1 ring-teal-500' : ''}`}>
                      <p className={`text-xs font-semibold mb-2 ${isToday ? 'text-teal-400' : 'text-slate-400'}`}>{WEEKDAYS[(day.getDay() + 6) % 7]} {day.getDate()}</p>
                      <div className="space-y-1">
                        {dayEvents.map(e => <EventChip key={e.key} e={e} compact />)}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="max-w-3xl mx-auto space-y-1.5">
                {(eventsByDay.get(toKey(anchor)) || []).map(e => <EventRow key={e.key} e={e} />)}
                {(eventsByDay.get(toKey(anchor)) || []).length === 0 && (
                  <p className="text-slate-400 text-sm text-center py-8">No hay vencimientos este día.</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
