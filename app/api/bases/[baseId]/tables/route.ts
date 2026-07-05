import db, { uid } from '@/lib/db';
import { requireUser, baseRole, canEdit } from '@/lib/access';
import { readOnlyReason } from '@/lib/tenant';
import { json, err, unauthorized, forbidden } from '@/lib/api';

export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: { baseId: string } }) {
  const user = await requireUser();
  if (!user) return unauthorized();
  const ro = readOnlyReason(user.id);
  if (ro) return err(ro, 403);
  const role = baseRole(user, params.baseId);
  if (!canEdit(role)) return forbidden();
  const body = await req.json();
  const name = String(body.name || '').trim();
  if (!name) return err('El nombre es obligatorio');
  const max = db
    .prepare('SELECT COALESCE(MAX(position), -1) AS m FROM base_tables WHERE base_id = ?')
    .get(params.baseId) as any;
  const tableId = uid();
  const viewId = uid();
  const tx = db.transaction(() => {
    db.prepare('INSERT INTO base_tables (id, base_id, name, position) VALUES (?, ?, ?, ?)').run(
      tableId,
      params.baseId,
      name,
      max.m + 1
    );
    db.prepare(
      `INSERT INTO base_fields (id, table_id, name, type, options, position) VALUES (?, ?, 'Nombre', 'text', '{}', 0)`
    ).run(uid(), tableId);
    db.prepare(
      `INSERT INTO base_views (id, table_id, name, type, config, position, created_by) VALUES (?, ?, 'Vista principal', 'grid', '{}', 0, ?)`
    ).run(viewId, tableId, user.id);
  });
  tx();
  return json({ id: tableId, viewId });
}
