import db from './db';

export type Tenant = {
  id: number;
  name: string;
  max_users: number;
  storage_mb: number;
  expires_at: string | null;
  created_at: string;
};

export function getTenant(tenantId: number): Tenant | null {
  return (db.prepare('SELECT * FROM tenants WHERE id = ?').get(tenantId) as Tenant) || null;
}

export function tenantOfUser(userId: number): Tenant | null {
  const u = db.prepare('SELECT tenant_id FROM users WHERE id = ?').get(userId) as any;
  if (!u) return null;
  return getTenant(u.tenant_id);
}

export function isExpired(t: Tenant | null): boolean {
  if (!t || !t.expires_at) return false;
  return t.expires_at.slice(0, 10) < new Date().toISOString().slice(0, 10);
}

// Si la rama del usuario está vencida devuelve el motivo (la UI queda solo-lectura).
// El Admin Master nunca queda bloqueado.
export function readOnlyReason(userId: number): string | null {
  const u = db.prepare('SELECT tenant_id, is_master FROM users WHERE id = ?').get(userId) as any;
  if (!u || u.is_master) return null;
  const t = getTenant(u.tenant_id);
  if (isExpired(t)) {
    return 'Tu espacio está vencido: modo solo lectura. Pedile al administrador general que lo renueve.';
  }
  return null;
}

export function storageUsed(tenantId: number): number {
  const r = db
    .prepare('SELECT COALESCE(SUM(size), 0) AS s FROM storage_files WHERE tenant_id = ?')
    .get(tenantId) as any;
  return r.s as number;
}

// Controla el cupo de almacenamiento antes de aceptar una subida
export function storageQuotaError(userId: number, incomingBytes: number): string | null {
  const u = db.prepare('SELECT tenant_id, is_master FROM users WHERE id = ?').get(userId) as any;
  if (!u) return 'Usuario inválido';
  const t = getTenant(u.tenant_id);
  if (!t) return null;
  const limit = t.storage_mb * 1024 * 1024;
  if (storageUsed(t.id) + incomingBytes > limit) {
    return `Cupo de almacenamiento agotado (${t.storage_mb} MB). Liberá espacio o pedí más cupo.`;
  }
  return null;
}

export function registerFile(opts: {
  id: string;
  tenantId: number;
  userId: number | null;
  ref: string;
  size: number;
}) {
  db.prepare(
    'INSERT OR REPLACE INTO storage_files (id, tenant_id, user_id, ref, size) VALUES (?, ?, ?, ?, ?)'
  ).run(opts.id, opts.tenantId, opts.userId, opts.ref, opts.size);
}

export function unregisterFileByRef(ref: string) {
  db.prepare('DELETE FROM storage_files WHERE ref = ?').run(ref);
}

// ¿Puede este usuario borrar el tablero? Master siempre; admin dentro de su
// rama; y el creador del tablero.
export function canDeleteBoard(
  user: { id: number; isAdmin: boolean; isMaster: boolean; tenantId: number },
  board: { tenant_id?: number; created_by?: number | null }
): boolean {
  if (user.isMaster) return true;
  const boardTenant = board.tenant_id ?? 1;
  if (user.isAdmin && boardTenant === user.tenantId) return true;
  return board.created_by != null && Number(board.created_by) === user.id;
}

export function tenantUserCount(tenantId: number): number {
  const r = db
    .prepare('SELECT COUNT(*) AS c FROM users WHERE tenant_id = ?')
    .get(tenantId) as any;
  return r.c as number;
}
