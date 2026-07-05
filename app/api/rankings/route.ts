import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import db from '@/lib/db';
import { computeMetrics, closePendingWeeks, historicRanking, lastClosedWeek, weekStartUtc } from '@/lib/rankings';

const ART_OFFSET_MS = 3 * 60 * 60 * 1000;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function parseArtDate(s: string, endOfDay: boolean): Date {
  // s = YYYY-MM-DD in Argentina local time
  const [y, m, d] = s.split('-').map(Number);
  const utc = Date.UTC(y, m - 1, d) + ART_OFFSET_MS;
  return new Date(endOfDay ? utc + 24 * 60 * 60 * 1000 - 1000 : utc);
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  closePendingWeeks();

  const sp = req.nextUrl.searchParams;
  const period = sp.get('period') || 'this_week';
  const now = new Date();
  const thisWeekStart = weekStartUtc(now);
  let from: Date, to: Date;

  switch (period) {
    case 'last_week':
      from = new Date(thisWeekStart.getTime() - WEEK_MS);
      to = new Date(thisWeekStart.getTime() - 1000);
      break;
    case 'two_weeks_ago':
      from = new Date(thisWeekStart.getTime() - 2 * WEEK_MS);
      to = new Date(thisWeekStart.getTime() - WEEK_MS - 1000);
      break;
    case 'this_month': {
      const art = new Date(now.getTime() - ART_OFFSET_MS);
      from = new Date(Date.UTC(art.getUTCFullYear(), art.getUTCMonth(), 1) + ART_OFFSET_MS);
      to = now;
      break;
    }
    case 'last_30':
      from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      to = now;
      break;
    case 'custom': {
      const f = sp.get('from'), t = sp.get('to');
      if (!f || !t) return NextResponse.json({ error: 'from y to requeridos' }, { status: 400 });
      from = parseArtDate(f, false);
      to = parseArtDate(t, true);
      break;
    }
    default: // this_week
      from = thisWeekStart;
      to = now;
  }

  const metrics = computeMetrics(from, to);

  // Rankings por rama: cada rama compite entre su propia gente
  const su = session.user as any;
  let allowed: Set<number> | null = null;
  let allowedNames: Set<string> | null = null;
  if (!su.isMaster) {
    const rows = db.prepare('SELECT id, username FROM users WHERE tenant_id = ?').all(Number(su.tenantId || 1)) as any[];
    allowed = new Set(rows.map(r => Number(r.id)));
    allowedNames = new Set(rows.map(r => String(r.username).toLowerCase()));
  }
  const inTenant = (uid: any) => !allowed || allowed.has(Number(uid));
  const filterList = (list: any[]) =>
    list.filter((m: any) => inTenant(m.userId ?? m.user_id ?? m.id));

  const historic = historicRanking();
  const lastWeekRaw = lastClosedWeek() as any;
  const lastWeek =
    lastWeekRaw && allowedNames
      ? { ...lastWeekRaw, winners: (lastWeekRaw.winners || []).filter((w: any) => allowedNames!.has(String(w.username).toLowerCase())) }
      : lastWeekRaw;

  return NextResponse.json({
    period,
    from: from.toISOString(),
    to: to.toISOString(),
    metrics: filterList(metrics as any[]),
    historic: Array.isArray(historic) ? filterList(historic as any[]) : historic,
    lastWeek,
  });
}
