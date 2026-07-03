import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import db from '@/lib/db';
import { artDay } from '@/lib/rankings';

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = (session.user as any).id;

  const body = await req.json().catch(() => ({}));
  const seconds = Math.min(Math.max(Number(body.seconds) || 0, 0), 60);
  if (seconds === 0) return NextResponse.json({ ok: true });

  const day = artDay(new Date());
  db.prepare(`
    INSERT INTO online_time (user_id, day, seconds) VALUES (?, ?, ?)
    ON CONFLICT(user_id, day) DO UPDATE SET seconds = seconds + excluded.seconds
  `).run(userId, day, seconds);

  return NextResponse.json({ ok: true });
}
