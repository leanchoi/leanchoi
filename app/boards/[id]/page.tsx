import { redirect, notFound } from 'next/navigation';
import db from '@/lib/db';
import { requireUser } from '@/lib/access';
import { boardRoleFor, canViewBoard } from '@/lib/boardAccess';
import { canDeleteBoard, readOnlyReason } from '@/lib/tenant';
import Navbar from '@/components/Navbar';
import BoardView from '@/components/BoardView';
import MyZone from '@/components/MyZone';

export default async function BoardPage({ params }: { params: { id: string } }) {
  const user = await requireUser();
  if (!user) redirect('/login');

  const board = db.prepare('SELECT * FROM boards WHERE id = ?').get(params.id) as any;
  if (!board) notFound();

  // Una sola fuente de verdad para el acceso (antes un tablero "global" de otra
  // rama era visible para cualquiera, y un admin de rama abría los de todas).
  const role = boardRoleFor(user, board);
  if (!canViewBoard(role)) notFound();

  const canDelete = canDeleteBoard(user, board);

  const lists = db.prepare('SELECT * FROM lists WHERE board_id = ? ORDER BY position ASC').all(params.id) as any[];

  const allCards = db.prepare(`
    SELECT c.*, GROUP_CONCAT(l.id || ':' || l.color || ':' || COALESCE(l.text,''), '|') as labels_raw
    FROM cards c
    JOIN lists li ON c.list_id = li.id
    LEFT JOIN labels l ON l.card_id = c.id
    WHERE li.board_id = ?
    GROUP BY c.id
    ORDER BY c.position ASC
  `).all(params.id) as any[];

  const cardMembers = db.prepare(`
    SELECT cm.card_id, cm.user_id, u.display_name, u.avatar
    FROM card_members cm
    JOIN users u ON cm.user_id = u.id
    JOIN cards c ON cm.card_id = c.id
    JOIN lists li ON c.list_id = li.id
    WHERE li.board_id = ?
  `).all(params.id) as any[];

  const cards = allCards.map((card: any) => ({
    ...card,
    labels: card.labels_raw ? card.labels_raw.split('|').filter(Boolean).map((l: string) => {
      const [id, color, text] = l.split(':');
      return { id: Number(id), color, text: text || '' };
    }) : [],
    members: cardMembers.filter((m: any) => m.card_id === card.id).map((m: any) => ({ user_id: m.user_id, display_name: m.display_name, avatar: m.avatar })),
  }));

  const boardLabels = db.prepare('SELECT * FROM board_labels WHERE board_id = ? ORDER BY name ASC, id ASC').all(params.id);

  // Gente asignable: siempre de la misma rama. Antes, para un admin, esta lista
  // eran TODOS los usuarios del sistema.
  const boardUsers = user.isMaster
    ? db.prepare('SELECT id, display_name, username, avatar FROM users ORDER BY display_name ASC').all()
    : user.isAdmin
      ? db
          .prepare('SELECT id, display_name, username, avatar FROM users WHERE tenant_id = ? ORDER BY display_name ASC')
          .all(user.tenantId)
      : db.prepare(`
          SELECT u.id, u.display_name, u.username, u.avatar FROM users u
          JOIN user_boards ub ON u.id = ub.user_id
          WHERE ub.board_id = ? AND u.tenant_id = ?
          UNION SELECT u.id, u.display_name, u.username, u.avatar FROM users u
          WHERE u.is_admin = 1 AND u.tenant_id = ?
          ORDER BY display_name ASC
        `).all(params.id, user.tenantId, user.tenantId);

  const readOnly = readOnlyReason(user.id);

  return (
    <div className="min-h-screen flex flex-col" style={{ background: board.background }}>
      <Navbar />
      <BoardView
        board={board}
        initialLists={lists}
        initialCards={cards}
        boardUsers={boardUsers as any}
        initialBoardLabels={boardLabels as any}
        currentUserName={user.name}
        isAdmin={role === 'admin'}
        canDelete={canDelete}
        readOnly={readOnly}
      />
      <MyZone />
    </div>
  );
}
