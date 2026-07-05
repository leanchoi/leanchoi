import db from '@/lib/db';
import { requireUser, baseRole, canView, baseIdOfTable, visibleUsers } from '@/lib/access';
import { readOnlyReason } from '@/lib/tenant';
import { json, unauthorized, forbidden, notFound } from '@/lib/api';

export const dynamic = 'force-dynamic';

// Devuelve todo lo que la UI de una tabla necesita en un solo fetch
export async function GET(_req: Request, { params }: { params: { tableId: string } }) {
  const user = await requireUser();
  if (!user) return unauthorized();
  const baseId = baseIdOfTable(params.tableId);
  if (!baseId) return notFound();
  const role = baseRole(user, baseId);
  if (!canView(role)) return forbidden();

  const table = db.prepare('SELECT * FROM base_tables WHERE id = ?').get(params.tableId) as any;
  const base = db.prepare('SELECT * FROM bases WHERE id = ?').get(baseId) as any;
  const fields = (
    db
      .prepare('SELECT * FROM base_fields WHERE table_id = ? ORDER BY position')
      .all(params.tableId) as any[]
  ).map((f) => ({ ...f, options: JSON.parse(f.options || '{}') }));
  const records = (
    db
      .prepare('SELECT * FROM base_records WHERE table_id = ? ORDER BY position, created_at')
      .all(params.tableId) as any[]
  ).map((r) => ({ ...r, data: JSON.parse(r.data || '{}') }));
  const views = (
    db
      .prepare('SELECT * FROM base_views WHERE table_id = ? ORDER BY position')
      .all(params.tableId) as any[]
  )
    .filter((v) => !v.personal || v.created_by === user.id)
    .map((v) => ({ ...v, config: JSON.parse(v.config || '{}') }));

  const users = visibleUsers(user);

  // Registros vinculables por campo link (nombre = campo primario de la tabla destino)
  const linkedNames: Record<string, string> = {};
  const linkedTables: Record<string, { id: string; name: string }> = {};
  const linkedOptions: Record<string, { id: string; name: string }[]> = {};
  for (const f of fields) {
    if (f.type !== 'link' || !f.options?.tableId) continue;
    const lt = db
      .prepare('SELECT id, name FROM base_tables WHERE id = ?')
      .get(f.options.tableId) as any;
    if (!lt) continue;
    linkedTables[f.id] = lt;
    const firstField = db
      .prepare('SELECT id FROM base_fields WHERE table_id = ? ORDER BY position LIMIT 1')
      .get(lt.id) as any;
    const lrecs = db
      .prepare('SELECT id, data FROM base_records WHERE table_id = ? ORDER BY position, created_at')
      .all(lt.id) as any[];
    linkedOptions[f.id] = [];
    for (const lr of lrecs) {
      const data = JSON.parse(lr.data || '{}');
      const name = firstField ? String(data[firstField.id] ?? '') || 'Sin nombre' : 'Registro';
      linkedNames[lr.id] = name;
      linkedOptions[f.id].push({ id: lr.id, name });
    }
  }

  const baseTables = db
    .prepare('SELECT id, name FROM base_tables WHERE base_id = ? ORDER BY position')
    .all(baseId);

  return json({
    table,
    base,
    myRole: role,
    readOnly: readOnlyReason(user.id),
    fields,
    records,
    views,
    users,
    linkedNames,
    linkedTables,
    linkedOptions,
    baseTables,
  });
}
