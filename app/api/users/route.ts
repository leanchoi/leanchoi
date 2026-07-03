import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import db from '@/lib/db';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const users = db.prepare('SELECT id, display_name, username, avatar FROM users ORDER BY display_name ASC').all();
  return NextResponse.json(users);
}
