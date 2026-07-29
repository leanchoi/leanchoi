import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import db from '@/lib/db';
import bcrypt from 'bcryptjs';
import { validateNewPassword, markPasswordChanged } from '@/lib/passwords';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = (session.user as any).id;
  const user = db
    .prepare('SELECT id, username, display_name, avatar, is_admin, password_is_default, password_changed_at FROM users WHERE id = ?')
    .get(userId) as any;
  return NextResponse.json({ ...user, mustChangePassword: user?.password_is_default === 1 });
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
    // La nueva no puede ser otra de las repartidas por defecto: si no, el
    // bloqueo se "resolvería" sin resolver nada.
    const problem = validateNewPassword(body.password, user.username);
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });
    if (await bcrypt.compare(body.password, user.password_hash))
      return NextResponse.json({ error: 'La contraseña nueva tiene que ser distinta de la actual.' }, { status: 400 });
    const hash = bcrypt.hashSync(body.password, 10);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, userId);
    markPasswordChanged(Number(userId));
  }

  const fresh = db
    .prepare('SELECT id, username, display_name, avatar, is_admin, password_is_default FROM users WHERE id = ?')
    .get(userId) as any;
  return NextResponse.json({ ...fresh, mustChangePassword: fresh.password_is_default === 1 });
}
