import db from './db';
import { artDay, sqliteTs } from './rankings';

// ── Resumen diario de actividad ──────────────────────────────────────────
//
// Decisiones de encuadre, porque acá el "cómo" cambia el resultado:
//
// 1. El titular es la comparación de la persona CON SU PROPIA semana anterior.
//    La comparación con uno mismo es la que motiva de forma sostenida; la
//    comparación con los demás desmotiva a la mitad del equipo que, por
//    definición, va a quedar debajo del promedio.
//
// 2. La referencia del equipo es la MEDIANA, no el promedio. Un solo usuario
//    muy intenso corre el promedio hacia arriba y hace que casi todos queden
//    "por debajo", lo cual es estadísticamente esperable y motivacionalmente
//    tóxico.
//
// 3. El tiempo conectado va como contexto, no como titular: es una medida de
//    presencia, no de trabajo. Si el equipo aprende que se mide el tiempo,
//    optimiza el tiempo (dejar la pestaña abierta), no el resultado. El titular
//    son cosas hechas: tarjetas creadas, ítems completados, comentarios.
//
// 4. El aviso dice explícitamente que esta actividad queda registrada y que es
//    lo mismo que ve la coordinación. Ser claro genera confianza; dejarlo
//    entrever genera desconfianza y juego con la métrica.

export type DigestMetric = {
  key: string;
  label: string;
  value: number;
  prev: number;
  /** Mediana del equipo para esta semana */
  teamMedian: number;
  unit?: 'min';
};

export type Digest = {
  day: string;
  displayName: string;
  /** Actividad de la semana en curso */
  metrics: DigestMetric[];
  /** Racha de días con actividad, hasta hoy */
  streakDays: number;
  /** Cantidad de compañeros con los que se compara (excluye a los excluidos del ranking) */
  teamSize: number;
  minutesThisWeek: number;
  minutesTeamMedian: number;
  /** Ítems asignados pendientes, con los vencidos aparte */
  pendingItems: number;
  overdueItems: number;
};

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

/** Lunes 00:00 ART de la semana que contiene ese instante, como fecha UTC. */
function weekStart(d: Date): Date {
  const ART = 3 * 60 * 60 * 1000;
  const art = new Date(d.getTime() - ART);
  const dow = (art.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(art.getUTCFullYear(), art.getUTCMonth(), art.getUTCDate() - dow) + ART);
}

function countBy(sql: string, params: any[]): Map<number, number> {
  const m = new Map<number, number>();
  for (const r of db.prepare(sql).all(...params) as any[]) {
    m.set(Number(r.uid), Number(r.n) || 0);
  }
  return m;
}

export function buildDigest(userId: number): Digest {
  const now = new Date();
  const thisWeek = weekStart(now);
  const lastWeek = new Date(thisWeek.getTime() - 7 * 86400000);

  const curFrom = sqliteTs(thisWeek);
  const curTo = sqliteTs(now);
  const prevFrom = sqliteTs(lastWeek);
  const prevTo = sqliteTs(new Date(thisWeek.getTime() - 1000));

  const me = db
    .prepare('SELECT id, display_name, tenant_id FROM users WHERE id = ?')
    .get(userId) as any;

  // Con quién se compara: la propia rama, sin los usuarios excluidos del ranking
  const peers = db
    .prepare('SELECT id FROM users WHERE tenant_id = ? AND exclude_ranking = 0')
    .all(me?.tenant_id ?? 1) as any[];
  const peerIds = peers.map((p) => Number(p.id));

  const CARDS = `SELECT created_by uid, COUNT(*) n FROM cards
                 WHERE created_by IS NOT NULL AND created_at BETWEEN ? AND ? GROUP BY created_by`;
  const DONE = `SELECT completed_by uid, COUNT(*) n FROM checklist_items
                WHERE completed_by IS NOT NULL AND is_checked = 1 AND completed_at BETWEEN ? AND ? GROUP BY completed_by`;
  const COMMENTS = `SELECT user_id uid, COUNT(*) n FROM comments
                    WHERE created_at BETWEEN ? AND ? GROUP BY user_id`;

  const cardsCur = countBy(CARDS, [curFrom, curTo]);
  const cardsPrev = countBy(CARDS, [prevFrom, prevTo]);
  const doneCur = countBy(DONE, [curFrom, curTo]);
  const donePrev = countBy(DONE, [prevFrom, prevTo]);
  const commCur = countBy(COMMENTS, [curFrom, curTo]);
  const commPrev = countBy(COMMENTS, [prevFrom, prevTo]);

  const secsCur = countBy(
    `SELECT user_id uid, SUM(seconds) n FROM online_time WHERE day BETWEEN ? AND ? GROUP BY user_id`,
    [artDay(thisWeek), artDay(now)]
  );

  const peerVals = (m: Map<number, number>) => peerIds.map((id) => m.get(id) || 0);

  const metrics: DigestMetric[] = [
    {
      key: 'done',
      label: 'Ítems completados',
      value: doneCur.get(userId) || 0,
      prev: donePrev.get(userId) || 0,
      teamMedian: median(peerVals(doneCur)),
    },
    {
      key: 'cards',
      label: 'Tarjetas creadas',
      value: cardsCur.get(userId) || 0,
      prev: cardsPrev.get(userId) || 0,
      teamMedian: median(peerVals(cardsCur)),
    },
    {
      key: 'comments',
      label: 'Comentarios',
      value: commCur.get(userId) || 0,
      prev: commPrev.get(userId) || 0,
      teamMedian: median(peerVals(commCur)),
    },
  ];

  // Racha: días consecutivos con tiempo registrado, contando desde hoy hacia atrás
  const activeDays = new Set(
    (
      db
        .prepare('SELECT day FROM online_time WHERE user_id = ? AND seconds > 0 ORDER BY day DESC LIMIT 400')
        .all(userId) as any[]
    ).map((r) => String(r.day))
  );
  let streakDays = 0;
  for (let i = 0; i < 400; i++) {
    const d = artDay(new Date(now.getTime() - i * 86400000));
    if (activeDays.has(d)) streakDays++;
    else if (i > 0) break; // que hoy todavía no tenga actividad no corta la racha
  }

  const pending = db
    .prepare(
      'SELECT COUNT(*) n FROM checklist_items WHERE assigned_user_id = ? AND is_checked = 0'
    )
    .get(userId) as any;
  const overdue = db
    .prepare(
      `SELECT COUNT(*) n FROM checklist_items
       WHERE assigned_user_id = ? AND is_checked = 0 AND due_date IS NOT NULL AND due_date < ?`
    )
    .get(userId, artDay(now)) as any;

  return {
    day: artDay(now),
    displayName: me?.display_name || '',
    metrics,
    streakDays,
    teamSize: peerIds.length,
    minutesThisWeek: Math.round((secsCur.get(userId) || 0) / 60),
    minutesTeamMedian: Math.round(median(peerVals(secsCur)) / 60),
    pendingItems: pending?.n || 0,
    overdueItems: overdue?.n || 0,
  };
}

/** ¿Ya se le mostró el resumen hoy? */
export function digestPendingFor(userId: number): boolean {
  const row = db.prepare('SELECT digest_seen_day FROM users WHERE id = ?').get(userId) as any;
  if (!row) return false;
  return String(row.digest_seen_day || '') !== artDay(new Date());
}

export function markDigestSeen(userId: number): void {
  db.prepare('UPDATE users SET digest_seen_day = ? WHERE id = ?').run(artDay(new Date()), userId);
}
