import db, { uid } from '@/lib/db';
import { requireUser, accessibleBases } from '@/lib/access';
import { readOnlyReason } from '@/lib/tenant';
import { json, err, unauthorized } from '@/lib/api';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await requireUser();
  if (!user) return unauthorized();
  const bases = accessibleBases(user).map((b) => {
    const tables = db
      .prepare('SELECT id, name FROM base_tables WHERE base_id = ? ORDER BY position')
      .all(b.id) as any[];
    const owner = db.prepare('SELECT display_name FROM users WHERE id = ?').get(b.owner_id) as any;
    return { ...b, tables, ownerName: owner?.display_name || '¿?', mine: b.owner_id === user.id };
  });
  return json({ bases });
}

export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return unauthorized();
  const ro = readOnlyReason(user.id);
  if (ro) return err(ro, 403);
  const body = await req.json();
  const name = String(body.name || '').trim();
  if (!name) return err('El nombre es obligatorio');
  const baseId = uid();
  const tableId = uid();
  const viewId = uid();
  const tx = db.transaction(() => {
    db.prepare(
      'INSERT INTO bases (id, name, color, icon, owner_id, tenant_id) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(baseId, name, body.color || 'teal', body.icon || '📊', user.id, user.tenantId);
    db.prepare('INSERT INTO base_tables (id, base_id, name, position) VALUES (?, ?, ?, 0)').run(
      tableId,
      baseId,
      'Tabla 1'
    );
    db.prepare(
      `INSERT INTO base_fields (id, table_id, name, type, options, position) VALUES (?, ?, 'Nombre', 'text', '{}', 0)`
    ).run(uid(), tableId);
    db.prepare(
      `INSERT INTO base_fields (id, table_id, name, type, options, position) VALUES (?, ?, 'Notas', 'longtext', '{}', 1)`
    ).run(uid(), tableId);
    db.prepare(
      `INSERT INTO base_views (id, table_id, name, type, config, position, created_by) VALUES (?, ?, 'Vista principal', 'grid', '{}', 0, ?)`
    ).run(viewId, tableId, user.id);
  });
  tx();
  return json({ id: baseId, tableId, viewId });
}
