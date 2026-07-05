import { getServerSession } from 'next-auth';
import { authOptions } from './auth';
import db from './db';

// Usuario de sesión del proyecto fusionado (ids numéricos de Trochi)
export type SessionUser = {
  id: number;
  username: string;
  name: string;
  isAdmin: boolean;
  isMaster: boolean;
  tenantId: number;
  avatar: string | null;
};

export async function requireUser(): Promise<SessionUser | null> {
  const session = await getServerSession(authOptions);
  const u = session?.user as any;
  if (!u?.id) return null;
  return {
    id: Number(u.id),
    username: u.username || u.email || '',
    name: u.name || '',
    isAdmin: !!u.isAdmin,
    isMaster: !!u.isMaster,
    tenantId: Number(u.tenantId || 1),
    avatar: u.avatar || null,
  };
}

export type BaseRole = 'owner' | 'editor' | 'commenter' | 'viewer' | null;

// Rol efectivo sobre una base:
// - el Admin Master puede todo en todas las ramas
// - el admin de rama puede todo dentro de SU rama
// - el dueño y los colaboradores según su rol
export function baseRole(user: SessionUser, baseId: string): BaseRole {
  const base = db.prepare('SELECT owner_id, tenant_id FROM bases WHERE id = ?').get(baseId) as any;
  if (!base) return null;
  if (user.isMaster) return 'owner';
  if (base.tenant_id !== user.tenantId) return null;
  if (user.isAdmin) return 'owner';
  if (base.owner_id === user.id) return 'owner';
  const collab = db
    .prepare('SELECT role FROM base_collaborators WHERE base_id = ? AND user_id = ?')
    .get(baseId, user.id) as any;
  if (!collab) return null;
  return collab.role as BaseRole;
}

export function canView(role: BaseRole) {
  return role !== null;
}
export function canComment(role: BaseRole) {
  return role === 'owner' || role === 'editor' || role === 'commenter';
}
export function canEdit(role: BaseRole) {
  return role === 'owner' || role === 'editor';
}
export function isOwner(role: BaseRole) {
  return role === 'owner';
}

export function baseIdOfTable(tableId: string): string | null {
  const t = db.prepare('SELECT base_id FROM base_tables WHERE id = ?').get(tableId) as any;
  return t?.base_id ?? null;
}

export function baseIdOfRecord(recordId: string): { baseId: string; tableId: string } | null {
  const r = db.prepare('SELECT table_id FROM base_records WHERE id = ?').get(recordId) as any;
  if (!r) return null;
  const baseId = baseIdOfTable(r.table_id);
  if (!baseId) return null;
  return { baseId, tableId: r.table_id };
}

// Bases accesibles: master ve todas; admin de rama ve las de su rama;
// el resto, las propias o compartidas (siempre dentro de su rama).
export function accessibleBases(user: SessionUser) {
  if (user.isMaster) {
    return db.prepare('SELECT * FROM bases ORDER BY created_at DESC').all() as any[];
  }
  if (user.isAdmin) {
    return db
      .prepare('SELECT * FROM bases WHERE tenant_id = ? ORDER BY created_at DESC')
      .all(user.tenantId) as any[];
  }
  return db
    .prepare(
      `SELECT DISTINCT b.* FROM bases b
       LEFT JOIN base_collaborators c ON c.base_id = b.id
       WHERE b.tenant_id = ? AND (b.owner_id = ? OR c.user_id = ?)
       ORDER BY b.created_at DESC`
    )
    .all(user.tenantId, user.id, user.id) as any[];
}

// Usuarios visibles para menciones/compartir: solo los de la misma rama
// (el master ve a todos)
export function visibleUsers(user: SessionUser) {
  if (user.isMaster) {
    return db
      .prepare('SELECT id, username, display_name AS name, avatar FROM users ORDER BY display_name')
      .all() as any[];
  }
  return db
    .prepare(
      'SELECT id, username, display_name AS name, avatar FROM users WHERE tenant_id = ? ORDER BY display_name'
    )
    .all(user.tenantId) as any[];
}
