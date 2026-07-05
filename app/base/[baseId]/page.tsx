import { redirect } from 'next/navigation';
import db from '@/lib/db';
import { requireUser, baseRole, canView } from '@/lib/access';

export const dynamic = 'force-dynamic';

export default async function BasePage({ params }: { params: { baseId: string } }) {
  const user = await requireUser();
  if (!user) redirect('/login');
  const role = baseRole(user, params.baseId);
  if (!canView(role)) redirect('/boards');
  const table = db
    .prepare('SELECT id FROM base_tables WHERE base_id = ? ORDER BY position LIMIT 1')
    .get(params.baseId) as any;
  if (!table) redirect('/boards');
  const views = db
    .prepare('SELECT id, personal, created_by FROM base_views WHERE table_id = ? ORDER BY position')
    .all(table.id) as any[];
  const view = views.find((v) => !v.personal || v.created_by === user.id);
  if (!view) redirect('/boards');
  redirect(`/base/${params.baseId}/table/${table.id}/view/${view.id}`);
}
