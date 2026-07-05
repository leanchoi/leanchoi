import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import db from '@/lib/db';
import bcrypt from 'bcryptjs';
import { getTenant, tenantUserCount } from '@/lib/tenant';

export async function GET() {
  const session = await getServerSession(authOptions);
  const su = session?.user as any;
  if (!session || (!su.isAdmin && !su.isMaster))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  // El master ve todos (con su rama); el admin de rama, solo los suyos
  const users = su.isMaster
    ? db
        .prepare(
          `SELECT u.id, u.username, u.display_name, u.is_admin, u.is_master, u.tenant_id, u.created_at, t.name AS tenant_name
           FROM users u LEFT JOIN tenants t ON t.id = u.tenant_id ORDER BY u.tenant_id, u.id`
        )
        .all()
    : db
        .prepare(
          'SELECT id, username, display_name, is_admin, is_master, tenant_id, created_at FROM users WHERE tenant_id = ? ORDER BY id'
        )
        .all(Number(su.tenantId));
  return NextResponse.json(users);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const su = session?.user as any;
  if (!session || (!su.isAdmin && !su.isMaster))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { username, display_name, password, is_admin, tenant_id } = await req.json();
  if (!username || !password)
    return NextResponse.json({ error: 'Usuario y contraseña son obligatorios' }, { status: 400 });

  // El master puede elegir rama; el admin de rama siempre crea en la suya
  const targetTenant = su.isMaster && tenant_id ? Number(tenant_id) : Number(su.tenantId);
  const tenant = getTenant(targetTenant);
  if (!tenant) return NextResponse.json({ error: 'Rama inexistente' }, { status: 400 });

  // Cupo de usuarios de la rama (el master no tiene tope en la Principal)
  if (tenantUserCount(targetTenant) >= tenant.max_users) {
    return NextResponse.json(
      { error: `Cupo de usuarios agotado (${tenant.max_users}). Pedí más cupo al administrador general.` },
      { status: 400 }
    );
  }

  const hash = await bcrypt.hash(password, 10);
  try {
    const result = db
      .prepare(
        'INSERT INTO users (username, display_name, password_hash, is_admin, tenant_id) VALUES (?, ?, ?, ?, ?)'
      )
      .run(username, display_name || username, hash, is_admin ? 1 : 0, targetTenant);
    const user = db
      .prepare('SELECT id, username, display_name, is_admin, tenant_id FROM users WHERE id = ?')
      .get(result.lastInsertRowid);
    return NextResponse.json(user, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Ese nombre de usuario ya existe' }, { status: 409 });
  }
}
