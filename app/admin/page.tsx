import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import db from '@/lib/db';
import Navbar from '@/components/Navbar';
import AdminPanel from '@/components/AdminPanel';

export default async function AdminPage() {
  const session = await getServerSession(authOptions);
  if (!session || !(session.user as any).isAdmin) redirect('/boards');

  const users = db.prepare('SELECT id, username, display_name, is_admin FROM users ORDER BY id ASC').all() as any[];
  const boards = db.prepare('SELECT * FROM boards ORDER BY title ASC').all() as any[];
  const userBoards = db.prepare('SELECT user_id, board_id FROM user_boards').all() as any[];

  const usersWithBoards = users.map(u => ({
    ...u,
    board_ids: userBoards.filter((ub: any) => ub.user_id === u.id).map((ub: any) => ub.board_id),
  }));

  return (
    <div className="min-h-screen">
      <Navbar />
      <AdminPanel initialUsers={usersWithBoards} initialBoards={boards} />
    </div>
  );
}
