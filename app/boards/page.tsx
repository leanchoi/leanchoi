import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import db from '@/lib/db';
import Navbar from '@/components/Navbar';
import BoardsClient from '@/components/BoardsClient';
import MyZone from '@/components/MyZone';

export default async function BoardsPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');

  const userId = (session.user as any).id;
  const isAdmin = (session.user as any).isAdmin;

  const boards = isAdmin
    ? db.prepare('SELECT * FROM boards ORDER BY created_at DESC').all()
    : db.prepare('SELECT b.* FROM boards b JOIN user_boards ub ON b.id = ub.board_id WHERE ub.user_id = ? ORDER BY b.created_at DESC').all(userId);

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="p-6 pb-20 max-w-7xl mx-auto">
        <h1 className="text-white text-xl font-semibold mb-6">Mis Tableros</h1>
        <BoardsClient boards={boards as any} isAdmin={isAdmin} />
      </main>
      <MyZone />
    </div>
  );
}
