import db, { now } from '@/lib/db';
import { requireUser, baseRole, canEdit, canView, baseIdOfRecord } from '@/lib/access';
import { readOnlyReason } from '@/lib/tenant';
import { notifyAssignments } from '@/lib/notify';
import { json, err, unauthorized, forbidden, notFound } from '@/lib/api';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: { recordId: string } }) {
  const user = await requireUser();
  if (!user) return unauthorized();
  const loc = baseIdOfRecord(params.recordId);
  if (!loc) return notFound();
  const role = baseRole(user, loc.baseId);
  if (!canView(role)) return forbidden();
  const record = db.prepare('SELECT * FROM base_records WHERE id = ?').get(params.recordId) as any;
  const table = db.prepare('SELECT * FROM base_tables WHERE id = ?').get(loc.tableId) as any;
  const view = db
    .prepare('SELECT id FROM base_views WHERE table_id = ? ORDER BY position LIMIT 1')
    .get(loc.tableId) as any;
  return json({
    record: { ...record, data: JSON.parse(record.data || '{}') },
    table,
    baseId: loc.baseId,
    firstViewId: view?.id || null,
  });
}

export async function PATCH(req: Request, { params }: { params: { recordId: string } }) {
  const user = await requireUser();
  if (!user) return unauthorized();
  const ro = readOnlyReason(user.id);
  if (ro) return err(ro, 403);
  const loc = baseIdOfRecord(params.recordId);
  if (!loc) return notFound();
  const role = baseRole(user, loc.baseId);
  if (!canEdit(role)) return forbidden();
  const body = await req.json();
  const rec = db.prepare('SELECT * FROM base_records WHERE id = ?').get(params.recordId) as any;
  const oldData = JSON.parse(rec.data || '{}');
  const newData = { ...oldData, ...(body.data || {}) };
  for (const k of Object.keys(newData)) {
    if (newData[k] === null) delete newData[k];
  }
  db.prepare('UPDATE base_records SET data = ?, updated_at = ? WHERE id = ?').run(
    JSON.stringify(newData),
    now(),
    params.recordId
  );
  notifyAssignments(loc.tableId, params.recordId, oldData, newData, user);
  return json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: { recordId: string } }) {
  const user = await requireUser();
  if (!user) return unauthorized();
  const ro = readOnlyReason(user.id);
  if (ro) return err(ro, 403);
  const loc = baseIdOfRecord(params.recordId);
  if (!loc) return notFound();
  const role = baseRole(user, loc.baseId);
  if (!canEdit(role)) return forbidden();
  db.prepare('DELETE FROM base_records WHERE id = ?').run(params.recordId);
  db.prepare('DELETE FROM record_comments WHERE record_id = ?').run(params.recordId);
  return json({ ok: true });
}
