import db, { uid, now } from '@/lib/db';
import { requireUser, baseRole, canEdit, baseIdOfTable } from '@/lib/access';
import { readOnlyReason } from '@/lib/tenant';
import { notifyAssignments } from '@/lib/notify';
import { json, err, unauthorized, forbidden, notFound } from '@/lib/api';

export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: { tableId: string } }) {
  const user = await requireUser();
  if (!user) return unauthorized();
  const ro = readOnlyReason(user.id);
  if (ro) return err(ro, 403);
  const baseId = baseIdOfTable(params.tableId);
  if (!baseId) return notFound();
  const role = baseRole(user, baseId);
  if (!canEdit(role)) return forbidden();
  const body = await req.json().catch(() => ({}));
  const data = body.data || {};
  const max = db
    .prepare('SELECT COALESCE(MAX(position), -1) AS m FROM base_records WHERE table_id = ?')
    .get(params.tableId) as any;
  const id = uid();
  db.prepare(
    'INSERT INTO base_records (id, table_id, data, position, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(id, params.tableId, JSON.stringify(data), max.m + 1, user.id, now(), now());
  notifyAssignments(params.tableId, id, {}, data, user);
  return json({ id });
}
