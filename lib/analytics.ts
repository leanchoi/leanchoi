import db from './db';
import { sqliteTs, artDay, rankingResetAt } from './rankings';

// Métricas de analytics por usuario en un rango. Cuenta: logueos, tiempo
// online (seg), ítems completados, ítems generados (checklist + tarjetas) y
// comentarios. Respeta el reset y la exclusión de usuarios.
export interface UserAnalytics {
  user_id: number;
  display_name: string;
  username: string;
  avatar: string | null;
  logins: number;
  online_seconds: number;
  items_completed: number;
  checklist_created: number;
  cards_created: number;
  items_generated: number; // checklist_created + cards_created
  comments: number;
}

export interface DailyPoint {
  day: string; // YYYY-MM-DD (ART)
  byUser: Record<number, {
    logins: number;
    online_seconds: number;
    items_completed: number;
    items_generated: number;
    comments: number;
  }>;
}

export interface AnalyticsResult {
  users: { id: number; display_name: string; username: string; avatar: string | null }[];
  metrics: UserAnalytics[];
  daily: DailyPoint[];
}

function mapCount(rows: any[], key = 'uid', val = 'n'): Map<number, number> {
  const m = new Map<number, number>();
  for (const r of rows) m.set(Number(r[key]), Number(r[val]) || 0);
  return m;
}

// Lista los días ART entre dos fechas (inclusive), acotado a 400 días
function dayRange(fromDay: string, toDay: string): string[] {
  const out: string[] = [];
  let d = new Date(fromDay + 'T00:00:00Z');
  const end = new Date(toDay + 'T00:00:00Z');
  let guard = 0;
  while (d <= end && guard < 400) {
    out.push(d.toISOString().slice(0, 10));
    d = new Date(d.getTime() + 86400000);
    guard++;
  }
  return out;
}

export function analyticsData(
  fromUtc: Date,
  toUtc: Date,
  opts: { tenantId?: number | null; userIds?: number[] }
): AnalyticsResult {
  const reset = rankingResetAt();
  const effFrom = reset && reset > fromUtc ? reset : fromUtc;
  const from = sqliteTs(effFrom);
  const to = sqliteTs(toUtc);
  const fromDay = artDay(effFrom);
  const toDay = artDay(toUtc);

  // Universo de usuarios: no excluidos, de la rama (si aplica), y si se pasó
  // una lista, solo esos.
  let sql = 'SELECT id, display_name, username, avatar FROM users WHERE exclude_ranking = 0';
  const params: any[] = [];
  if (opts.tenantId != null) {
    sql += ' AND tenant_id = ?';
    params.push(opts.tenantId);
  }
  if (opts.userIds && opts.userIds.length) {
    sql += ` AND id IN (${opts.userIds.map(() => '?').join(',')})`;
    params.push(...opts.userIds);
  }
  sql += ' ORDER BY display_name';
  const users = db.prepare(sql).all(...params) as any[];
  const ids = users.map((u) => u.id);
  if (ids.length === 0) return { users: [], metrics: [], daily: [] };
  const inClause = `(${ids.map(() => '?').join(',')})`;

  const logins = mapCount(
    db.prepare(`SELECT user_id uid, COUNT(*) n FROM logins WHERE created_at BETWEEN ? AND ? AND user_id IN ${inClause} GROUP BY user_id`).all(from, to, ...ids)
  );
  const online = mapCount(
    db.prepare(`SELECT user_id uid, SUM(seconds) n FROM online_time WHERE day BETWEEN ? AND ? AND user_id IN ${inClause} GROUP BY user_id`).all(fromDay, toDay, ...ids)
  );
  const completed = mapCount(
    db.prepare(`SELECT completed_by uid, COUNT(*) n FROM checklist_items WHERE completed_by IS NOT NULL AND is_checked = 1 AND completed_at BETWEEN ? AND ? AND completed_by IN ${inClause} GROUP BY completed_by`).all(from, to, ...ids)
  );
  const checklistCreated = mapCount(
    db.prepare(`SELECT created_by uid, COUNT(*) n FROM checklist_items WHERE created_by IS NOT NULL AND created_at BETWEEN ? AND ? AND created_by IN ${inClause} GROUP BY created_by`).all(from, to, ...ids)
  );
  const cardsCreated = mapCount(
    db.prepare(`SELECT created_by uid, COUNT(*) n FROM cards WHERE created_by IS NOT NULL AND created_at BETWEEN ? AND ? AND created_by IN ${inClause} GROUP BY created_by`).all(from, to, ...ids)
  );
  const comments = mapCount(
    db.prepare(`SELECT user_id uid, COUNT(*) n FROM comments WHERE created_at BETWEEN ? AND ? AND user_id IN ${inClause} GROUP BY user_id`).all(from, to, ...ids)
  );

  const metrics: UserAnalytics[] = users.map((u) => {
    const cl = checklistCreated.get(u.id) || 0;
    const cd = cardsCreated.get(u.id) || 0;
    return {
      user_id: u.id,
      display_name: u.display_name,
      username: u.username,
      avatar: u.avatar || null,
      logins: logins.get(u.id) || 0,
      online_seconds: online.get(u.id) || 0,
      items_completed: completed.get(u.id) || 0,
      checklist_created: cl,
      cards_created: cd,
      items_generated: cl + cd,
      comments: comments.get(u.id) || 0,
    };
  });

  // Serie diaria por usuario (para gráficos de evolución)
  const days = dayRange(fromDay, toDay);
  const zero = () => ({ logins: 0, online_seconds: 0, items_completed: 0, items_generated: 0, comments: 0 });
  const daily: DailyPoint[] = days.map((day) => ({
    day,
    byUser: Object.fromEntries(ids.map((id) => [id, zero()])),
  }));
  const dayIndex = new Map(days.map((d, i) => [d, i]));

  // helper: acumular por día ART. logins/comments/cards/checklist usan created_at
  // (timestamp UTC → día ART); completed usa completed_at; online usa day directo.
  const bump = (rows: any[], field: keyof ReturnType<typeof zero>, tsCol: string) => {
    for (const r of rows) {
      const uid = Number(r.uid);
      if (!dayIndex.has(r.d)) continue;
      const pt = daily[dayIndex.get(r.d)!].byUser[uid];
      if (pt) (pt as any)[field] += Number(r.n) || 0;
    }
  };
  // Día ART: restar 3hs y tomar la fecha
  const artExpr = (col: string) => `strftime('%Y-%m-%d', datetime(${col}, '-3 hours'))`;

  bump(db.prepare(`SELECT user_id uid, ${artExpr('created_at')} d, COUNT(*) n FROM logins WHERE created_at BETWEEN ? AND ? AND user_id IN ${inClause} GROUP BY uid, d`).all(from, to, ...ids), 'logins', 'created_at');
  bump(db.prepare(`SELECT user_id uid, day d, seconds n FROM online_time WHERE day BETWEEN ? AND ? AND user_id IN ${inClause}`).all(fromDay, toDay, ...ids), 'online_seconds', 'day');
  bump(db.prepare(`SELECT completed_by uid, ${artExpr('completed_at')} d, COUNT(*) n FROM checklist_items WHERE completed_by IS NOT NULL AND is_checked = 1 AND completed_at BETWEEN ? AND ? AND completed_by IN ${inClause} GROUP BY uid, d`).all(from, to, ...ids), 'items_completed', 'completed_at');
  bump(db.prepare(`SELECT created_by uid, ${artExpr('created_at')} d, COUNT(*) n FROM checklist_items WHERE created_by IS NOT NULL AND created_at BETWEEN ? AND ? AND created_by IN ${inClause} GROUP BY uid, d`).all(from, to, ...ids), 'items_generated', 'created_at');
  bump(db.prepare(`SELECT created_by uid, ${artExpr('created_at')} d, COUNT(*) n FROM cards WHERE created_by IS NOT NULL AND created_at BETWEEN ? AND ? AND created_by IN ${inClause} GROUP BY uid, d`).all(from, to, ...ids), 'items_generated', 'created_at');
  bump(db.prepare(`SELECT user_id uid, ${artExpr('created_at')} d, COUNT(*) n FROM comments WHERE created_at BETWEEN ? AND ? AND user_id IN ${inClause} GROUP BY uid, d`).all(from, to, ...ids), 'comments', 'created_at');

  return {
    users: users.map((u) => ({ id: u.id, display_name: u.display_name, username: u.username, avatar: u.avatar || null })),
    metrics,
    daily,
  };
}
