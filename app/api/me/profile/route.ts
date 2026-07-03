import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import db from '@/lib/db';
import bcrypt from 'bcryptjs';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = (session.user as any).id;
  const user = db.prepare('SELECT id, username, display_name, avatar, is_admin FROM users WHERE id = ?').get(userId);
  return NextResponse.json(user);
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = (session.user as any).id;
  const body = await req.json();

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as any;
  if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (body.display_name !== undefined) {
    const name = String(body.display_name).trim();
    if (!name) return NextResponse.json({ error: 'El nombre no puede estar vacío' }, { status: 400 });
    db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(name, userId);
  }

  if (body.password) {
    if (!body.currentPassword) return NextResponse.json({ error: 'Ingresá tu contraseña actual' }, { status: 400 });
    const valid = await bcrypt.compare(body.currentPassword, user.password_hash);
    if (!valid) return NextResponse.json({ error: 'La contraseña actual es incorrecta' }, { status: 403 });
    if (String(body.password).length < 6) return NextResponse.json({ error: 'La nueva contraseña debe tener al menos 6 caracteres' }, { status: 400 });
    const hash = bcrypt.hashSync(body.password, 10);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, userId);
  }

  return NextResponse.json(db.prepare('SELECT id, username, display_name, avatar, is_admin FROM users WHERE id = ?').get(userId));
}
