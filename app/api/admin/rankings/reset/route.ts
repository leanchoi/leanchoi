import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import db, { setSetting } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Reset de rankings/analytics (admin o master). No borra contenido real
// (tarjetas, ítems, comentarios): fija una fecha base y desde ahí se cuenta
// todo de cero. Además limpia los contadores propios del ranking.
export async function POST() {
  const session = await getServerSession(authOptions);
  const su = session?.user as any;
  if (!session || (!su.isAdmin && !su.isMaster))
    return NextResponse.json({ error: 'Solo administradores' }, { status: 403 });

  const now = new Date().toISOString();
  const tx = db.transaction(() => {
    setSetting('ranking_reset_at', now);
    db.prepare('DELETE FROM weekly_awards').run();
    db.prepare('DELETE FROM logins').run();
    db.prepare('DELETE FROM online_time').run();
  });
  tx();
  return NextResponse.json({ ok: true, reset_at: now });
}
