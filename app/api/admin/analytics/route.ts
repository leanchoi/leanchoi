import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { analyticsData } from '@/lib/analytics';
import { weekStartUtc, rankingResetAt } from '@/lib/rankings';

export const dynamic = 'force-dynamic';

const ART_OFFSET_MS = 3 * 60 * 60 * 1000; // Argentina UTC-3

function artToday(): string {
  return new Date(Date.now() - ART_OFFSET_MS).toISOString().slice(0, 10);
}
function artDayStart(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) + ART_OFFSET_MS);
}
function artDayEnd(dateStr: string): Date {
  return new Date(artDayStart(dateStr).getTime() + 86400000 - 1000);
}
function shiftDay(dateStr: string, deltaDays: number): string {
  const base = new Date(dateStr + 'T00:00:00Z');
  return new Date(base.getTime() + deltaDays * 86400000).toISOString().slice(0, 10);
}

function resolveRange(period: string, fromParam?: string | null, toParam?: string | null) {
  const now = new Date();
  const today = artToday();
  switch (period) {
    case 'today':
      return { from: artDayStart(today), to: now, label: 'Hoy' };
    case 'yesterday': {
      const y = shiftDay(today, -1);
      return { from: artDayStart(y), to: artDayEnd(y), label: 'Ayer' };
    }
    case 'this_week':
      return { from: weekStartUtc(now), to: now, label: 'Esta semana' };
    case 'last_week': {
      const ws = weekStartUtc(now);
      return { from: new Date(ws.getTime() - 7 * 86400000), to: new Date(ws.getTime() - 1000), label: 'Última semana' };
    }
    case 'this_month': {
      const first = today.slice(0, 8) + '01';
      return { from: artDayStart(first), to: now, label: 'Mes en curso' };
    }
    case 'last_30':
      return { from: artDayStart(shiftDay(today, -29)), to: now, label: 'Últimos 30 días' };
    case 'custom': {
      const f = fromParam || today;
      const t = toParam || today;
      return { from: artDayStart(f), to: artDayEnd(t), label: `${f} → ${t}` };
    }
    default:
      return { from: weekStartUtc(now), to: now, label: 'Esta semana' };
  }
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const su = session?.user as any;
  if (!session || (!su.isAdmin && !su.isMaster))
    return NextResponse.json({ error: 'Solo administradores' }, { status: 403 });

  const sp = req.nextUrl.searchParams;
  const period = sp.get('period') || 'this_week';
  const range = resolveRange(period, sp.get('from'), sp.get('to'));
  const userIds = (sp.get('users') || '')
    .split(',')
    .map((s) => Number(s))
    .filter((n) => Number.isFinite(n) && n > 0);

  // Master ve todas las ramas; admin de rama, solo la suya
  const tenantId = su.isMaster ? null : Number(su.tenantId || 1);

  const data = analyticsData(range.from, range.to, { tenantId, userIds });

  return NextResponse.json({
    period,
    label: range.label,
    from: range.from.toISOString(),
    to: range.to.toISOString(),
    reset_at: rankingResetAt()?.toISOString() || null,
    ...data,
  });
}
