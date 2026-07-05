import db from '@/lib/db';
import { requireUser, baseRole, canEdit, baseIdOfTable } from '@/lib/access';
import { readOnlyReason } from '@/lib/tenant';
import { json, err, unauthorized, forbidden, notFound } from '@/lib/api';

export const dynamic = 'force-dynamic';

function fieldBase(fieldId: string) {
  const f = db.prepare('SELECT * FROM base_fields WHERE id = ?').get(fieldId) as any;
  if (!f) return null;
  const baseId = baseIdOfTable(f.table_id);
  if (!baseId) return null;
  return { field: f, baseId };
}

export async function PATCH(req: Request, { params }: { params: { fieldId: string } }) {
  const user = await requireUser();
  if (!user) return unauthorized();
  const ro = readOnlyReason(user.id);
  if (ro) return err(ro, 403);
  const fb = fieldBase(params.fieldId);
  if (!fb) return notFound();
  const role = baseRole(user, fb.baseId);
  if (!canEdit(role)) return forbidden();
  const body = await req.json();
  const name = body.name !== undefined ? String(body.name).trim() : fb.field.name;
  if (!name) return err('El nombre es obligatorio');
  const type = body.type ?? fb.field.type;
  const options = body.options !== undefined ? JSON.stringify(body.options) : fb.field.options;
  const position = body.position !== undefined ? body.position : fb.field.position;
  db.prepare('UPDATE base_fields SET name = ?, type = ?, options = ?, position = ? WHERE id = ?').run(
    name,
    type,
    options,
    position,
    params.fieldId
  );
  return json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: { fieldId: string } }) {
  const user = await requireUser();
  if (!user) return unauthorized();
  const ro = readOnlyReason(user.id);
  if (ro) return err(ro, 403);
  const fb = fieldBase(params.fieldId);
  if (!fb) return notFound();
  const role = baseRole(user, fb.baseId);
  if (!canEdit(role)) return forbidden();
  const count = db
    .prepare('SELECT COUNT(*) AS c FROM base_fields WHERE table_id = ?')
    .get(fb.field.table_id) as any;
  if (count.c <= 1) return err('No podés borrar el único campo de la tabla');
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM base_fields WHERE id = ?').run(params.fieldId);
    const records = db
      .prepare('SELECT id, data FROM base_records WHERE table_id = ?')
      .all(fb.field.table_id) as any[];
    const upd = db.prepare('UPDATE base_records SET data = ? WHERE id = ?');
    for (const r of records) {
      const data = JSON.parse(r.data || '{}');
      if (params.fieldId in data) {
        delete data[params.fieldId];
        upd.run(JSON.stringify(data), r.id);
      }
    }
  });
  tx();
  return json({ ok: true });
}
