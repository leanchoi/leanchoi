import db from './db';

// All timestamps are stored in UTC (sqlite CURRENT_TIMESTAMP / datetime('now')).
// Weeks run Monday 00:00 -> Sunday 23:59:59 Argentina time (UTC-3, no DST).
const ART_OFFSET_MS = 3 * 60 * 60 * 1000;

export const WEEKLY_POINTS = [8, 5, 3, 2, 1];

function toArt(d: Date): Date { return new Date(d.getTime() - ART_OFFSET_MS); }

/** Monday 00:00 ART of the week containing the given instant, as a UTC Date. */
export function weekStartUtc(instant: Date): Date {
  const art = toArt(instant);
  const day = (art.getUTCDay() + 6) % 7; // Monday = 0
  const mondayArt = Date.UTC(art.getUTCFullYear(), art.getUTCMonth(), art.getUTCDate() - day);
  return new Date(mondayArt + ART_OFFSET_MS);
}

export function sqliteTs(d: Date): string {
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

/** Argentina calendar date (YYYY-MM-DD) for an instant. */
export function artDay(instant: Date): string {
  return toArt(instant).toISOString().slice(0, 10);
}

export interface UserMetrics {
  user_id: number;
  display_name: string;
  username: string;
  avatar: string | null;
  cards_created: number;
  items_created: number;
  items_completed: number;
  comments: number;
  production: number;
  logins: number;
  online_seconds: number;
  workload: number; // currently assigned pending checklist items
  overall: number;  // 0-100 average across categories
}

export function computeMetrics(fromUtc: Date, toUtc: Date): UserMetrics[] {
  const from = sqliteTs(fromUtc);
  const to = sqliteTs(toUtc);
  const fromDay = artDay(fromUtc);
  const toDay = artDay(toUtc);

  const users = db.prepare('SELECT id, display_name, username, avatar FROM users').all() as any[];

  const cardsBy = new Map<number, number>();
  for (const r of db.prepare('SELECT created_by as uid, COUNT(*) as n FROM cards WHERE created_by IS NOT NULL AND created_at BETWEEN ? AND ? GROUP BY created_by').all(from, to) as any[]) cardsBy.set(r.uid, r.n);

  const itemsCreatedBy = new Map<number, number>();
  for (const r of db.prepare('SELECT created_by as uid, COUNT(*) as n FROM checklist_items WHERE created_by IS NOT NULL AND created_at BETWEEN ? AND ? GROUP BY created_by').all(from, to) as any[]) itemsCreatedBy.set(r.uid, r.n);

  const itemsCompletedBy = new Map<number, number>();
  for (const r of db.prepare('SELECT completed_by as uid, COUNT(*) as n FROM checklist_items WHERE completed_by IS NOT NULL AND is_checked = 1 AND completed_at BETWEEN ? AND ? GROUP BY completed_by').all(from, to) as any[]) itemsCompletedBy.set(r.uid, r.n);

  const commentsBy = new Map<number, number>();
  for (const r of db.prepare('SELECT user_id as uid, COUNT(*) as n FROM comments WHERE created_at BETWEEN ? AND ? GROUP BY user_id').all(from, to) as any[]) commentsBy.set(r.uid, r.n);

  const loginsBy = new Map<number, number>();
  for (const r of db.prepare('SELECT user_id as uid, COUNT(*) as n FROM logins WHERE created_at BETWEEN ? AND ? GROUP BY user_id').all(from, to) as any[]) loginsBy.set(r.uid, r.n);

  const onlineBy = new Map<number, number>();
  for (const r of db.prepare('SELECT user_id as uid, SUM(seconds) as n FROM online_time WHERE day BETWEEN ? AND ? GROUP BY user_id').all(fromDay, toDay) as any[]) onlineBy.set(r.uid, r.n || 0);

  const workloadBy = new Map<number, number>();
  for (const r of db.prepare('SELECT assigned_user_id as uid, COUNT(*) as n FROM checklist_items WHERE assigned_user_id IS NOT NULL AND is_checked = 0 GROUP BY assigned_user_id').all() as any[]) workloadBy.set(r.uid, r.n);

  const metrics: UserMetrics[] = users.map(u => {
    const cards = cardsBy.get(u.id) || 0;
    const itemsC = itemsCreatedBy.get(u.id) || 0;
    const itemsD = itemsCompletedBy.get(u.id) || 0;
    const comm = commentsBy.get(u.id) || 0;
    return {
      user_id: u.id,
      display_name: u.display_name,
      username: u.username,
      avatar: u.avatar || null,
      cards_created: cards,
      items_created: itemsC,
      items_completed: itemsD,
      comments: comm,
      production: cards * 3 + itemsC * 1 + itemsD * 2 + comm * 1,
      logins: loginsBy.get(u.id) || 0,
      online_seconds: onlineBy.get(u.id) || 0,
      workload: workloadBy.get(u.id) || 0,
      overall: 0,
    };
  });

  // Overall: each category contributes value/max*100; the overall score is the average.
  const cats: (keyof UserMetrics)[] = ['production', 'logins', 'online_seconds', 'items_completed', 'workload'];
  const maxima = cats.map(c => Math.max(...metrics.map(m => m[c] as number), 0));
  for (const m of metrics) {
    let sum = 0, count = 0;
    cats.forEach((c, i) => {
      if (maxima[i] > 0) { sum += ((m[c] as number) / maxima[i]) * 100; count++; }
    });
    m.overall = count > 0 ? Math.round((sum / count) * 10) / 10 : 0;
  }

  return metrics;
}

/**
 * Close any finished ART weeks that have activity but no awards yet.
 * Called lazily whenever rankings are requested — no cron needed.
 */
export function closePendingWeeks() {
  const first = db.prepare(`
    SELECT MIN(t) as t FROM (
      SELECT MIN(created_at) as t FROM logins
      UNION ALL SELECT MIN(created_at) as t FROM comments
      UNION ALL SELECT MIN(created_at) as t FROM cards WHERE created_by IS NOT NULL
    )
  `).get() as any;
  if (!first?.t) return;

  const firstWeek = weekStartUtc(new Date(first.t.replace(' ', 'T') + 'Z'));
  const currentWeek = weekStartUtc(new Date());
  const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

  for (let ws = firstWeek.getTime(); ws < currentWeek.getTime(); ws += WEEK_MS) {
    const weekStart = new Date(ws);
    const weekKey = artDay(weekStart);
    const already = db.prepare('SELECT 1 FROM weekly_awards WHERE week_start = ? LIMIT 1').get(weekKey);
    if (already) continue;

    const weekEnd = new Date(ws + WEEK_MS - 1000);
    const metrics = computeMetrics(weekStart, weekEnd).filter(m => m.overall > 0);
    if (metrics.length === 0) continue;

    metrics.sort((a, b) => b.overall - a.overall);
    const insert = db.prepare('INSERT INTO weekly_awards (week_start, user_id, position, points) VALUES (?, ?, ?, ?)');
    metrics.slice(0, WEEKLY_POINTS.length).forEach((m, i) => {
      insert.run(weekKey, m.user_id, i + 1, WEEKLY_POINTS[i]);
    });
  }
}

export function historicRanking() {
  return db.prepare(`
    SELECT wa.user_id, u.display_name, u.username, u.avatar,
           SUM(wa.points) as points,
           SUM(CASE WHEN wa.position = 1 THEN 1 ELSE 0 END) as weeks_won,
           COUNT(*) as weeks_ranked
    FROM weekly_awards wa JOIN users u ON wa.user_id = u.id
    GROUP BY wa.user_id
    ORDER BY points DESC, weeks_won DESC
  `).all();
}

export function lastClosedWeek() {
  const week = db.prepare('SELECT MAX(week_start) as w FROM weekly_awards').get() as any;
  if (!week?.w) return null;
  const winners = db.prepare(`
    SELECT wa.position, wa.points, u.display_name, u.username, u.avatar
    FROM weekly_awards wa JOIN users u ON wa.user_id = u.id
    WHERE wa.week_start = ? ORDER BY wa.position ASC
  `).all(week.w);
  return { week_start: week.w, winners };
}
