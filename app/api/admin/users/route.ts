import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import db from '@/lib/db';
import bcrypt from 'bcryptjs';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || !(session.user as any).isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const users = db.prepare('SELECT id, username, display_name, is_admin, created_at FROM users ORDER BY id ASC').all();
  return NextResponse.json(users);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !(session.user as any).isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const count = (db.prepare('SELECT COUNT(*) as c FROM users WHERE is_admin = 0').get() as any).c;
  if (count >= 50) return NextResponse.json({ error: 'Maximum 50 users reached' }, { status: 400 });

  const { username, display_name, password, is_admin } = await req.json();
  if (!username || !password) return NextResponse.json({ error: 'Username and password required' }, { status: 400 });

  const hash = await bcrypt.hash(password, 10);
  try {
    const result = db.prepare('INSERT INTO users (username, display_name, password_hash, is_admin) VALUES (?, ?, ?, ?)')
      .run(username, display_name || username, hash, is_admin ? 1 : 0);
    const user = db.prepare('SELECT id, username, display_name, is_admin FROM users WHERE id = ?').get(result.lastInsertRowid);
    return NextResponse.json(user, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Username already exists' }, { status: 409 });
  }
}
