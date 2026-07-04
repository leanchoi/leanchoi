import { getServerSession } from 'next-auth'
import { authOptions, SessionUser } from './auth'
import db from './db'

export async function requireUser(): Promise<SessionUser | null> {
  const session = await getServerSession(authOptions)
  const u = session?.user as any
  if (!u?.id) return null
  return u as SessionUser
}

export type BaseRole = 'owner' | 'editor' | 'commenter' | 'viewer' | null

// Rol efectivo de un usuario sobre una base. El admin ve y puede todo.
export function baseRole(userId: string, baseId: string, userRole?: string): BaseRole {
  const base = db.prepare('SELECT owner_id FROM bases WHERE id = ?').get(baseId) as any
  if (!base) return null
  const user =
    userRole !== undefined
      ? { role: userRole }
      : (db.prepare('SELECT role FROM users WHERE id = ?').get(userId) as any)
  if (user?.role === 'admin') return 'owner'
  if (base.owner_id === userId) return 'owner'
  const collab = db
    .prepare('SELECT role FROM collaborators WHERE base_id = ? AND user_id = ?')
    .get(baseId, userId) as any
  if (!collab) return null
  return collab.role as BaseRole
}

export function canView(role: BaseRole) {
  return role !== null
}
export function canComment(role: BaseRole) {
  return role === 'owner' || role === 'editor' || role === 'commenter'
}
export function canEdit(role: BaseRole) {
  return role === 'owner' || role === 'editor'
}
export function isOwner(role: BaseRole) {
  return role === 'owner'
}

export function baseIdOfTable(tableId: string): string | null {
  const t = db.prepare('SELECT base_id FROM tables WHERE id = ?').get(tableId) as any
  return t?.base_id ?? null
}

export function baseIdOfRecord(recordId: string): { baseId: string; tableId: string } | null {
  const r = db.prepare('SELECT table_id FROM records WHERE id = ?').get(recordId) as any
  if (!r) return null
  const baseId = baseIdOfTable(r.table_id)
  if (!baseId) return null
  return { baseId, tableId: r.table_id }
}

// Bases accesibles para un usuario (admin: todas)
export function accessibleBases(user: SessionUser) {
  if (user.role === 'admin') {
    return db.prepare('SELECT * FROM bases ORDER BY created_at').all() as any[]
  }
  return db
    .prepare(
      `SELECT DISTINCT b.* FROM bases b
       LEFT JOIN collaborators c ON c.base_id = b.id
       WHERE b.owner_id = ? OR c.user_id = ?
       ORDER BY b.created_at`
    )
    .all(user.id, user.id) as any[]
}
