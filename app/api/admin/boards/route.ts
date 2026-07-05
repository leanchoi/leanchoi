import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import db from '@/lib/db';

export async function GET() {
  const session = await getServerSession(authOptions);
  const su = session?.user as any;
  if (!session || (!su.isAdmin && !su.isMaster)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  // El master ve todos los tableros; el admin de rama, los de su rama
  const boards = su.isMaster
    ? db.prepare('SELECT * FROM boards ORDER BY title ASC').all()
    : db.prepare('SELECT * FROM boards WHERE tenant_id = ? ORDER BY title ASC').all(Number(su.tenantId || 1));
  return NextResponse.json(boards);
}
