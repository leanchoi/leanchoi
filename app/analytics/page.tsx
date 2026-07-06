import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import db from '@/lib/db';
import Navbar from '@/components/Navbar';
import AnalyticsClient from '@/components/AnalyticsClient';

export const dynamic = 'force-dynamic';

export default async function AnalyticsPage() {
  const session = await getServerSession(authOptions);
  const su = session?.user as any;
  if (!session || (!su.isAdmin && !su.isMaster)) redirect('/boards');

  // Usuarios elegibles para el filtro (no excluidos, de la rama; master ve todo)
  const users = (
    su.isMaster
      ? db.prepare('SELECT id, display_name, username, avatar FROM users WHERE exclude_ranking = 0 ORDER BY display_name').all()
      : db
          .prepare('SELECT id, display_name, username, avatar FROM users WHERE exclude_ranking = 0 AND tenant_id = ? ORDER BY display_name')
          .all(Number(su.tenantId || 1))
  ) as any[];

  return (
    <div className="min-h-screen">
      <Navbar />
      <AnalyticsClient allUsers={users as any} />
    </div>
  );
}
