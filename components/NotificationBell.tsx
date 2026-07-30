'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { Bell, AtSign, UserPlus, Clock, MessageSquare, CheckCheck } from 'lucide-react';

interface Notification {
  id: number | string;
  type: string;
  text: string;
  board_id?: number;
  card_id?: number;
  link?: string | null;
  is_read: number;
  created_at: string;
}

const TYPE_ICON: Record<string, any> = {
  mention: AtSign,
  assigned: UserPlus,
  due: Clock,
  comment: MessageSquare,
};

const TYPE_COLOR: Record<string, string> = {
  mention: 'text-brand-hi bg-teal-500/15',
  assigned: 'text-sky-300 bg-sky-500/15',
  due: 'text-orange-300 bg-orange-500/15',
  comment: 'text-slate-300 bg-slate-500/15',
};

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/me/notifications');
      if (!res.ok) return;
      const data = await res.json();
      setItems(data.notifications || []);
      setUnread(data.unread || 0);
    } catch {}
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, [load]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setExpanded(false); }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  async function markAllRead() {
    await fetch('/api/me/notifications', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    setItems(prev => prev.map(n => ({ ...n, is_read: 1 })));
    setUnread(items.filter(n => typeof n.id === 'string').length); // due alerts stay "unread"
  }

  function timeLabel(s: string): string {
    const d = new Date(s.includes('T') || s.includes(' ') ? s + (s.includes('Z') || s.includes('+') ? '' : 'Z') : s);
    if (isNaN(d.getTime())) return s;
    const diff = Date.now() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'ahora';
    if (mins < 60) return `hace ${mins} min`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `hace ${hours} h`;
    return d.toLocaleDateString('es');
  }

  const visible = expanded ? items : items.slice(0, 6);

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => { setOpen(!open); if (!open) load(); }}
        aria-label="Notificaciones" className="btn-icon relative">
        <Bell size={17} />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-0.5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-surface-raised border border-line rounded-xl shadow-2xl z-[60] overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/10">
            <h3 className="text-white text-sm font-semibold">Notificaciones</h3>
            {items.some(n => !n.is_read && typeof n.id === 'number') && (
              <button onClick={markAllRead} className="text-brand-hi hover:text-teal-200 text-xs flex items-center gap-1">
                <CheckCheck size={13} /> Marcar leídas
              </button>
            )}
          </div>

          <div className={`overflow-y-auto ${expanded ? 'max-h-[70vh]' : 'max-h-96'}`}>
            {visible.length === 0 && (
              <p className="text-slate-400 text-sm text-center py-8">No tenés notificaciones. 🎉</p>
            )}
            {visible.map(n => {
              const Icon = TYPE_ICON[n.type] || Bell;
              const color = TYPE_COLOR[n.type] || TYPE_COLOR.comment;
              const inner = (
                <div className={`flex items-start gap-2.5 px-4 py-2.5 hover:bg-white/5 transition-colors ${!n.is_read ? 'bg-teal-500/5' : ''}`}>
                  <span className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${color}`}>
                    <Icon size={14} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm leading-snug ${n.is_read ? 'text-slate-400' : 'text-slate-200'}`}>{n.text}</p>
                    <p className="text-slate-500 text-xs mt-0.5">{timeLabel(n.created_at)}</p>
                  </div>
                  {!n.is_read && <span className="w-2 h-2 rounded-full bg-teal-400 flex-shrink-0 mt-1.5" />}
                </div>
              );
              const href = n.link || (n.board_id ? `/boards/${n.board_id}` : null);
              return href ? (
                <Link key={n.id} href={href} onClick={() => setOpen(false)} className="block">{inner}</Link>
              ) : (
                <div key={n.id}>{inner}</div>
              );
            })}
          </div>

          {!expanded && items.length > 6 && (
            <button onClick={() => setExpanded(true)} className="w-full py-2 text-brand-hi hover:text-teal-200 hover:bg-white/5 text-xs font-medium border-t border-white/10">
              Ver todas ({items.length})
            </button>
          )}
        </div>
      )}
    </div>
  );
}
