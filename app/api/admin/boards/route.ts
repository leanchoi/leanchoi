import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import db from '@/lib/db';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || !(session.user as any).isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const boards = db.prepare('SELECT * FROM boards ORDER BY title ASC').all();
  return NextResponse.json(boards);
}
