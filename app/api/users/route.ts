import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import db from '@/lib/db';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const u = session.user as any;
  // Cada rama ve solo a su gente; el Admin Master ve a todos
  const users = u.isMaster
    ? db.prepare('SELECT id, display_name, username, avatar FROM users ORDER BY display_name ASC').all()
    : db
        .prepare(
          'SELECT id, display_name, username, avatar FROM users WHERE tenant_id = ? ORDER BY display_name ASC'
        )
        .all(Number(u.tenantId || 1));
  return NextResponse.json(users);
}
