import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import db from '@/lib/db';
import { requireUser, accessibleBases } from '@/lib/access';
import { readOnlyReason, canDeleteBoard } from '@/lib/tenant';
import Navbar from '@/components/Navbar';
import BoardsClient from '@/components/BoardsClient';
import MyZone from '@/components/MyZone';

// Siempre datos frescos: evita que a veces no aparezcan las bases recién creadas
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const BOARD_META = `
  (SELECT COUNT(*) FROM lists l WHERE l.board_id = b.id) as list_count,
  (SELECT COUNT(*) FROM cards c JOIN lists l ON c.list_id = l.id WHERE l.board_id = b.id) as card_count,
  (SELECT COUNT(*) FROM user_boards ub2 WHERE ub2.board_id = b.id) as member_count
`;

export default async function BoardsPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');
  const user = await requireUser();
  if (!user) redirect('/login');

  // Tableros: el master ve todos; el admin de rama, los de su rama;
  // el resto, los públicos de su rama o donde es miembro.
  const boards = user.isMaster
    ? db.prepare(`SELECT b.*, ${BOARD_META} FROM boards b ORDER BY b.created_at DESC`).all()
    : user.isAdmin
      ? db
          .prepare(
            `SELECT b.*, ${BOARD_META} FROM boards b WHERE b.tenant_id = ? ORDER BY b.created_at DESC`
          )
          .all(user.tenantId)
      : db
          .prepare(
            `SELECT DISTINCT b.*, ${BOARD_META} FROM boards b
             LEFT JOIN user_boards ub ON b.id = ub.board_id AND ub.user_id = ?
             WHERE b.tenant_id = ? AND (b.is_public = 1 OR ub.user_id IS NOT NULL)
             ORDER BY b.created_at DESC`
          )
          .all(user.id, user.tenantId);

  // marcar en cada tablero si este usuario lo puede borrar (creador o admin/master)
  const boardsWithPerm = (boards as any[]).map((b) => ({
    ...b,
    can_delete: canDeleteBoard(user, b),
  }));

  const bases = accessibleBases(user).map((b) => ({
    ...b,
    table_count: (
      db.prepare('SELECT COUNT(*) AS c FROM base_tables WHERE base_id = ?').get(b.id) as any
    ).c,
    record_count: (
      db
        .prepare(
          'SELECT COUNT(*) AS c FROM base_records r JOIN base_tables t ON t.id = r.table_id WHERE t.base_id = ?'
        )
        .get(b.id) as any
    ).c,
    // borra la base: el dueño (owner_id) o admin/master de la rama
    can_delete:
      user.isMaster ||
      (user.isAdmin && b.tenant_id === user.tenantId) ||
      b.owner_id === user.id,
  }));

  return (
    <div className="min-h-screen">
      <Navbar />
      {readOnlyReason(user.id) && (
        <div className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-1.5 text-center text-xs text-amber-300">
          🔒 {readOnlyReason(user.id)}
        </div>
      )}
      <main className="p-4 sm:p-6 pb-20 max-w-7xl mx-auto">
        <BoardsClient
          boards={boardsWithPerm as any}
          bases={bases as any}
          isAdmin={user.isAdmin || user.isMaster}
          userName={user.name}
          readOnly={!!readOnlyReason(user.id)}
        />
      </main>
      <MyZone />
    </div>
  );
}
