import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import db from '@/lib/db';
import bcrypt from 'bcryptjs';
import { storageUsed, tenantUserCount } from '@/lib/tenant';

export const dynamic = 'force-dynamic';

// Gestión de ramas: SOLO el Admin Master
function requireMaster(session: any) {
  return session && (session.user as any).isMaster;
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!requireMaster(session)) return NextResponse.json({ error: 'Solo el Admin Master' }, { status: 403 });
  const tenants = (db.prepare('SELECT * FROM tenants ORDER BY id').all() as any[]).map((t) => ({
    ...t,
    user_count: tenantUserCount(t.id),
    storage_used: storageUsed(t.id),
    admins: db
      .prepare('SELECT id, username, display_name FROM users WHERE tenant_id = ? AND is_admin = 1')
      .all(t.id),
    board_count: (db.prepare('SELECT COUNT(*) AS c FROM boards WHERE tenant_id = ?').get(t.id) as any).c,
    base_count: (db.prepare('SELECT COUNT(*) AS c FROM bases WHERE tenant_id = ?').get(t.id) as any).c,
  }));
  return NextResponse.json({ tenants });
}

// Crea una rama nueva junto con su admin
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!requireMaster(session)) return NextResponse.json({ error: 'Solo el Admin Master' }, { status: 403 });
  const body = await req.json();
  const name = String(body.name || '').trim();
  const adminUsername = String(body.adminUsername || '').trim().toLowerCase();
  const adminName = String(body.adminName || '').trim() || adminUsername;
  const adminPassword = String(body.adminPassword || '');
  if (!name) return NextResponse.json({ error: 'Poné un nombre a la rama' }, { status: 400 });
  if (!/^[a-z0-9._-]{2,30}$/.test(adminUsername))
    return NextResponse.json({ error: 'Usuario del admin inválido (letras, números, punto, guion)' }, { status: 400 });
  if (adminPassword.length < 6)
    return NextResponse.json({ error: 'La contraseña debe tener al menos 6 caracteres' }, { status: 400 });
  const exists = db
    .prepare('SELECT id FROM users WHERE username = ? COLLATE NOCASE')
    .get(adminUsername);
  if (exists) return NextResponse.json({ error: 'Ese nombre de usuario ya existe' }, { status: 409 });

  const maxUsers = Math.max(1, Math.min(500, Number(body.maxUsers) || 10));
  const storageMb = Math.max(50, Math.min(100000, Number(body.storageMb) || 500));
  const expiresAt = body.expiresAt ? String(body.expiresAt).slice(0, 10) : null;

  const tx = db.transaction(() => {
    const t = db
      .prepare('INSERT INTO tenants (name, max_users, storage_mb, expires_at) VALUES (?, ?, ?, ?)')
      .run(name, maxUsers, storageMb, expiresAt);
    db.prepare(
      'INSERT INTO users (username, display_name, password_hash, is_admin, is_master, tenant_id) VALUES (?, ?, ?, 1, 0, ?)'
    ).run(adminUsername, adminName, bcrypt.hashSync(adminPassword, 10), t.lastInsertRowid);
    return t.lastInsertRowid;
  });
  const tenantId = tx();
  return NextResponse.json({ id: tenantId }, { status: 201 });
}
