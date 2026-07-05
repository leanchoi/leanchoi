import { redirect } from 'next/navigation';
import { requireUser, baseRole, canView } from '@/lib/access';
import TableApp from '@/components/arrayan/TableApp';

export const dynamic = 'force-dynamic';

export default async function TableViewPage({
  params,
}: {
  params: { baseId: string; tableId: string; viewId: string };
}) {
  const user = await requireUser();
  if (!user) redirect('/login');
  const role = baseRole(user, params.baseId);
  if (!canView(role)) redirect('/boards');
  return <TableApp baseId={params.baseId} tableId={params.tableId} viewId={params.viewId} />;
}
