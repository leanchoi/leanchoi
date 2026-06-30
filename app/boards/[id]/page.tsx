import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect, notFound } from 'next/navigation';
import db from '@/lib/db';
import Navbar from '@/components/Navbar';
import BoardView from '@/components/BoardView';

export default async function BoardPage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');

  const userId = (session.user as any).id;
  const isAdmin = (session.user as any).isAdmin;

  const board = db.prepare('SELECT * FROM boards WHERE id = ?').get(params.id) as any;
  if (!board) notFound();

  if (!isAdmin) {
    const access = db.prepare('SELECT 1 FROM user_boards WHERE user_id = ? AND board_id = ?').get(userId, params.id);
    if (!access) notFound();
  }

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

  const cards = allCards.map((card: any) => ({
    ...card,
    labels: card.labels_raw ? card.labels_raw.split('|').filter(Boolean).map((l: string) => {
      const [id, color, text] = l.split(':');
      return { id: Number(id), color, text: text || '' };
    }) : [],
  }));

  const currentUserName = session.user?.name || '';

  return (
    <div className="min-h-screen flex flex-col" style={{ background: board.background }}>
      <Navbar />
      <BoardView
        board={board}
        initialLists={lists}
        initialCards={cards}
        currentUserName={currentUserName}
        isAdmin={isAdmin}
      />
    </div>
  );
}
