import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import db from '@/lib/db';
import { getTenant, storageUsed, tenantUserCount } from '@/lib/tenant';
import Navbar from '@/components/Navbar';
import AdminPanel from '@/components/AdminPanel';

export default async function AdminPage() {
  const session = await getServerSession(authOptions);
  const su = session?.user as any;
  if (!session || (!su.isAdmin && !su.isMaster)) redirect('/boards');

  const isMaster = !!su.isMaster;
  const tenantId = Number(su.tenantId || 1);

  // El master administra todo; el admin de rama, solo su rama
  const users = (
    isMaster
      ? db.prepare('SELECT id, username, display_name, is_admin, is_master, tenant_id, password_is_default, password_changed_at FROM users ORDER BY tenant_id, id').all()
      : db
          .prepare(
            'SELECT id, username, display_name, is_admin, is_master, tenant_id, password_is_default, password_changed_at FROM users WHERE tenant_id = ? ORDER BY id'
          )
          .all(tenantId)
  ) as any[];
  const boards = (
    isMaster
      ? db.prepare('SELECT * FROM boards ORDER BY title ASC').all()
      : db.prepare('SELECT * FROM boards WHERE tenant_id = ? ORDER BY title ASC').all(tenantId)
  ) as any[];
  const bases = (
    isMaster
      ? db.prepare('SELECT * FROM bases ORDER BY name ASC').all()
      : db.prepare('SELECT * FROM bases WHERE tenant_id = ? ORDER BY name ASC').all(tenantId)
  ) as any[];
  const userBoards = db.prepare('SELECT user_id, board_id FROM user_boards').all() as any[];

  const usersWithBoards = users.map(u => ({
    ...u,
    board_ids: userBoards.filter((ub: any) => ub.user_id === u.id).map((ub: any) => ub.board_id),
  }));

  const myTenant = getTenant(tenantId);
  const tenantInfo = myTenant
    ? {
        name: myTenant.name,
        max_users: myTenant.max_users,
        user_count: tenantUserCount(tenantId),
        storage_mb: myTenant.storage_mb,
        storage_used: storageUsed(tenantId),
        expires_at: myTenant.expires_at,
      }
    : null;

  return (
    <div className="min-h-screen">
      <Navbar />
      <AdminPanel
        initialUsers={usersWithBoards}
        initialBoards={boards}
        initialBases={bases}
        isMaster={isMaster}
        tenantInfo={tenantInfo}
      />
    </div>
  );
}
