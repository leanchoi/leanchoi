import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import db from '@/lib/db';
import Navbar from '@/components/Navbar';
import BoardsClient from '@/components/BoardsClient';
import MyZone from '@/components/MyZone';

const BOARD_META = `
  (SELECT COUNT(*) FROM lists l WHERE l.board_id = b.id) as list_count,
  (SELECT COUNT(*) FROM cards c JOIN lists l ON c.list_id = l.id WHERE l.board_id = b.id) as card_count,
  (SELECT COUNT(*) FROM user_boards ub2 WHERE ub2.board_id = b.id) as member_count
`;

export default async function BoardsPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');

  const userId = (session.user as any).id;
  const isAdmin = (session.user as any).isAdmin;
  const name = session.user?.name || '';

  const boards = isAdmin
    ? db.prepare(`SELECT b.*, ${BOARD_META} FROM boards b ORDER BY b.created_at DESC`).all()
    : db.prepare(`
        SELECT DISTINCT b.*, ${BOARD_META} FROM boards b
        LEFT JOIN user_boards ub ON b.id = ub.board_id AND ub.user_id = ?
        WHERE b.is_public = 1 OR ub.user_id IS NOT NULL
        ORDER BY b.created_at DESC
      `).all(userId);

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="p-4 sm:p-6 pb-20 max-w-7xl mx-auto">
        <BoardsClient boards={boards as any} isAdmin={isAdmin} userName={name} />
      </main>
      <MyZone />
    </div>
  );
}
