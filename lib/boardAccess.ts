import db from './db';
import type { SessionUser } from './access';

// ── Autorización del módulo de tableros (Trello) ─────────────────────────
//
// El módulo Arrayán ya resolvía esto en lib/access.ts con baseRole(); acá va
// el equivalente para tableros/listas/tarjetas, que hasta ahora sólo
// comprobaban "¿hay sesión?" y dejaban tocar cualquier id.
//
// Reglas (las mismas que ya aplicaban las páginas server-side, ahora también
// en la API y con la rama siempre acotada):
//   - Admin Master: todo, en cualquier rama.
//   - Admin de rama: todo, dentro de SU rama.
//   - Miembro (user_boards): ver y editar.
//   - Tablero global (is_public) de su rama: ver y editar.
//   - Cualquier otro caso: sin acceso.

export type BoardRole = 'admin' | 'member' | null;

export type BoardRow = {
  id: number;
  title: string;
  background: string;
  is_public: number | null;
  tenant_id: number | null;
  created_by: number | null;
};

export function getBoard(boardId: number | string): BoardRow | null {
  const row = db.prepare('SELECT * FROM boards WHERE id = ?').get(boardId) as any;
  return row ?? null;
}

/** Rol efectivo del usuario sobre un tablero, o null si no tiene acceso. */
export function boardRole(user: SessionUser, boardId: number | string): BoardRole {
  const board = getBoard(boardId);
  if (!board) return null;
  return boardRoleFor(user, board);
}

/** Igual que boardRole pero cuando ya tenés la fila del tablero en la mano. */
export function boardRoleFor(user: SessionUser, board: BoardRow): BoardRole {
  if (user.isMaster) return 'admin';

  // Los tableros creados antes de las ramas no tienen tenant_id: caen en la 1.
  const boardTenant = board.tenant_id ?? 1;
  if (boardTenant !== user.tenantId) return null;

  if (user.isAdmin) return 'admin';
  if (board.is_public) return 'member';

  const member = db
    .prepare('SELECT 1 FROM user_boards WHERE user_id = ? AND board_id = ?')
    .get(user.id, board.id);
  return member ? 'member' : null;
}

export function canViewBoard(role: BoardRole): boolean {
  return role !== null;
}

/**
 * Editar contenido del tablero (listas, tarjetas, checklists, comentarios…).
 * Hoy miembro y admin pueden lo mismo; queda separado de canViewBoard para
 * poder introducir un rol de sólo-lectura sin volver a tocar cada ruta.
 */
export function canEditBoard(role: BoardRole): boolean {
  return role === 'admin' || role === 'member';
}

/** Acciones de administración del tablero (visibilidad global, renombrar). */
export function isBoardAdmin(role: BoardRole): boolean {
  return role === 'admin';
}

// ── Resolución del tablero dueño de cada entidad ─────────────────────────

export function boardIdOfList(listId: number | string): number | null {
  const row = db.prepare('SELECT board_id FROM lists WHERE id = ?').get(listId) as any;
  return row?.board_id ?? null;
}

export function boardIdOfCard(cardId: number | string): number | null {
  const row = db
    .prepare('SELECT li.board_id AS bid FROM cards c JOIN lists li ON c.list_id = li.id WHERE c.id = ?')
    .get(cardId) as any;
  return row?.bid ?? null;
}

export function boardIdOfChecklist(checklistId: number | string): number | null {
  const row = db
    .prepare(
      `SELECT li.board_id AS bid FROM checklists cl
       JOIN cards c ON cl.card_id = c.id
       JOIN lists li ON c.list_id = li.id
       WHERE cl.id = ?`
    )
    .get(checklistId) as any;
  return row?.bid ?? null;
}

export function boardIdOfChecklistItem(itemId: number | string): number | null {
  const row = db
    .prepare(
      `SELECT li.board_id AS bid FROM checklist_items ci
       JOIN checklists cl ON ci.checklist_id = cl.id
       JOIN cards c ON cl.card_id = c.id
       JOIN lists li ON c.list_id = li.id
       WHERE ci.id = ?`
    )
    .get(itemId) as any;
  return row?.bid ?? null;
}

export function boardIdOfAttachment(attachmentId: number | string): number | null {
  const row = db
    .prepare(
      `SELECT li.board_id AS bid FROM attachments a
       JOIN cards c ON a.card_id = c.id
       JOIN lists li ON c.list_id = li.id
       WHERE a.id = ?`
    )
    .get(attachmentId) as any;
  return row?.bid ?? null;
}

// ── Guardas de conveniencia para las rutas de API ────────────────────────

export type Guard =
  | { ok: true; role: BoardRole; boardId: number }
  | { ok: false; status: 401 | 403 | 404 };

function guard(
  user: SessionUser | null,
  boardId: number | null,
  need: 'view' | 'edit' | 'admin'
): Guard {
  if (!user) return { ok: false, status: 401 };
  if (boardId == null) return { ok: false, status: 404 };
  const role = boardRole(user, boardId);
  if (!canViewBoard(role)) return { ok: false, status: 403 };
  if (need === 'edit' && !canEditBoard(role)) return { ok: false, status: 403 };
  if (need === 'admin' && !isBoardAdmin(role)) return { ok: false, status: 403 };
  return { ok: true, role, boardId };
}

export function guardBoard(user: SessionUser | null, boardId: number | string, need: 'view' | 'edit' | 'admin' = 'edit'): Guard {
  return guard(user, Number(boardId), need);
}

export function guardList(user: SessionUser | null, listId: number | string, need: 'view' | 'edit' | 'admin' = 'edit'): Guard {
  return guard(user, boardIdOfList(listId), need);
}

export function guardCard(user: SessionUser | null, cardId: number | string, need: 'view' | 'edit' | 'admin' = 'edit'): Guard {
  return guard(user, boardIdOfCard(cardId), need);
}

export function guardAttachment(user: SessionUser | null, attachmentId: number | string, need: 'view' | 'edit' | 'admin' = 'view'): Guard {
  return guard(user, boardIdOfAttachment(attachmentId), need);
}

/** Tableros que el usuario puede ver, con la rama ya acotada. */
export function accessibleBoardsSql(user: SessionUser): { sql: string; params: any[] } {
  if (user.isMaster) {
    return { sql: 'SELECT b.* FROM boards b', params: [] };
  }
  if (user.isAdmin) {
    return { sql: 'SELECT b.* FROM boards b WHERE b.tenant_id = ?', params: [user.tenantId] };
  }
  return {
    sql: `SELECT DISTINCT b.* FROM boards b
          LEFT JOIN user_boards ub ON b.id = ub.board_id AND ub.user_id = ?
          WHERE b.tenant_id = ? AND (b.is_public = 1 OR ub.user_id IS NOT NULL)`,
    params: [user.id, user.tenantId],
  };
}
